/**
 * Chat Service
 *
 * Manages Claude CLI process lifecycle for the context catalog chat.
 * Spawns claude with --session-id for isolation, streams responses
 * back via WebSocket, handles abort/timeout/disconnect cleanup.
 */

import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import { buildChatSystemPrompt } from './chat-system-prompt.js';
import type { Logger } from '../logging/logger-factory.js';
import { createLogger } from '../logging/logger-factory.js';

// ─── Types ────────────────────────────────────────────────────

export interface ChatSession {
  sessionId: string;
  proc: ChildProcess;
  ws: WebSocket;
  projectPath: string;
  turnCount: number;
  totalTokensEstimate: number;
  timeoutId: ReturnType<typeof setTimeout>;
  accumulatedText: string;
  startedAt: number;
  _disconnectHandler?: () => void;
}

export interface ChatServiceOptions {
  /** Logger instance */
  logger?: Logger;
  /** Suppress console output */
  silent?: boolean;
  /** Timeout per turn in ms (default: 5 min) */
  turnTimeout?: number;
  /** Max turns before session reset (default: 30) */
  maxTurns?: number;
  /** Context usage percentage that triggers session reset (default: 60) */
  contextResetThreshold?: number;
  /** Callback when catalog may have changed (tool calls detected) */
  onCatalogChange?: (projectPath: string) => void;
}

// ─── Chat Service ─────────────────────────────────────────────

export class ChatService {
  private activeSessions = new Map<string, ChatSession>();
  private logger: Logger;
  private turnTimeout: number;
  private maxTurns: number;
  private contextResetThreshold: number;
  private onCatalogChange?: (projectPath: string) => void;

  constructor(options: ChatServiceOptions = {}) {
    this.logger = options.logger ?? createLogger({ silent: options.silent });
    this.turnTimeout = options.turnTimeout ?? 5 * 60 * 1000; // 5 minutes
    this.maxTurns = options.maxTurns ?? 30;
    this.contextResetThreshold = options.contextResetThreshold ?? 60;
    this.onCatalogChange = options.onCatalogChange;
  }

  /**
   * Send a chat message. Spawns claude CLI and streams responses.
   */
  async send(ws: WebSocket, projectPath: string, message: string): Promise<void> {
    // Check for duplicate
    const existing = this.activeSessions.get(projectPath);
    if (existing) {
      this.sendToClient(ws, {
        type: 'chat_error',
        projectPath,
        reason: 'already_active',
        message: 'A chat is already in progress for this project',
      });
      return;
    }

    // Get or create session ID
    let sessionId = this.getStoredSessionId(projectPath);
    const isResume = sessionId !== null;
    if (!sessionId) {
      sessionId = randomUUID();
      this.storeSessionId(projectPath, sessionId);
    }

    // Build system prompt
    let systemPrompt: string;
    try {
      systemPrompt = await buildChatSystemPrompt(projectPath);
    } catch (err) {
      this.sendToClient(ws, {
        type: 'chat_error',
        projectPath,
        reason: 'process_error',
        message: `Failed to build system prompt: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    // Build CLI args
    const args: string[] = [
      '-p', message,
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--max-turns', '25',
    ];

    // System prompt only on first message (not resume)
    if (!isResume) {
      args.push('--system-prompt', systemPrompt);
      args.push('--session-id', sessionId);
    } else {
      args.push('--resume', sessionId);
    }

    // Allowed tools
    const tools = 'Read,Write,Edit,Grep,Glob,Task,WebSearch,WebFetch';
    args.push('--allowedTools', tools);

    this.logger.log(`[ChatService] Spawning claude for ${projectPath} (session: ${sessionId.substring(0, 8)}..., resume: ${isResume})`);

    let proc: ChildProcess;
    try {
      proc = spawn('claude', args, {
        cwd: projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          JACQUES_SUBPROCESS: '1',
        },
      });
    } catch (err) {
      this.sendToClient(ws, {
        type: 'chat_error',
        projectPath,
        reason: 'spawn_failed',
        message: 'Claude CLI not found. Install Claude Code CLI to use chat.',
      });
      return;
    }

    // Close stdin to trigger streaming
    proc.stdin?.end();

    // Set up timeout
    const timeoutId = setTimeout(() => {
      this.logger.log(`[ChatService] Timeout for ${projectPath}`);
      proc.kill('SIGTERM');
      this.sendToClient(ws, {
        type: 'chat_error',
        projectPath,
        reason: 'timeout',
        message: 'Chat timed out after 5 minutes',
      });
      this.cleanup(projectPath);
    }, this.turnTimeout);

    // Track session
    const session: ChatSession = {
      sessionId,
      proc,
      ws,
      projectPath,
      turnCount: (this.getStoredTurnCount(projectPath) ?? 0) + 1,
      totalTokensEstimate: 0,
      timeoutId,
      accumulatedText: '',
      startedAt: Date.now(),
    };
    this.activeSessions.set(projectPath, session);
    this.storeTurnCount(projectPath, session.turnCount);

    // Parse stdout stream
    let streamBuffer = '';
    let catalogMayHaveChanged = false;

    proc.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      streamBuffer += chunk;
      const lines = streamBuffer.split('\n');
      streamBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          this.handleStreamEvent(event, session, ws, () => {
            catalogMayHaveChanged = true;
          });
        } catch {
          // Skip unparseable lines
        }
      }
    });

    // Collect stderr
    let stderr = '';
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Handle process exit
    proc.on('error', (err) => {
      this.logger.error(`[ChatService] Spawn error: ${err.message}`);
      this.sendToClient(ws, {
        type: 'chat_error',
        projectPath,
        reason: 'spawn_failed',
        message: `Failed to start Claude CLI: ${err.message}`,
      });
      this.cleanup(projectPath);
    });

    proc.on('exit', (code) => {
      this.logger.log(`[ChatService] Process exited with code ${code} for ${projectPath}`);

      if (code === 0) {
        this.sendToClient(ws, {
          type: 'chat_complete',
          projectPath,
          fullText: session.accumulatedText,
          inputTokens: session.totalTokensEstimate,
          outputTokens: 0, // Estimated via tiktoken would be more accurate
        });
      } else if (code !== null) {
        // Non-zero exit — if it was a resume failure, reset session
        if (isResume && code !== 0) {
          this.logger.log(`[ChatService] Resume failed, resetting session for ${projectPath}`);
          this.clearStoredSession(projectPath);
        }

        // Don't send error if we already cleaned up (abort case)
        if (this.activeSessions.has(projectPath)) {
          this.sendToClient(ws, {
            type: 'chat_error',
            projectPath,
            reason: 'process_error',
            message: stderr.trim() || `Claude exited with code ${code}`,
          });
        }
      }

      this.cleanup(projectPath);

      // Notify catalog change after cleanup
      if (catalogMayHaveChanged && this.onCatalogChange) {
        this.onCatalogChange(projectPath);
      }
    });

    // Handle client disconnect
    const disconnectHandler = () => {
      if (this.activeSessions.has(projectPath)) {
        this.logger.log(`[ChatService] Client disconnected, killing process for ${projectPath}`);
        proc.kill('SIGTERM');
        this.cleanup(projectPath);
      }
    };
    ws.on('close', disconnectHandler);
    session._disconnectHandler = disconnectHandler;
  }

  /**
   * Abort an active chat
   */
  abort(projectPath: string): void {
    const session = this.activeSessions.get(projectPath);
    if (!session) return;

    this.logger.log(`[ChatService] Aborting chat for ${projectPath}`);
    session.proc.kill('SIGTERM');

    this.sendToClient(session.ws, {
      type: 'chat_error',
      projectPath,
      reason: 'aborted',
      message: 'Chat aborted by user',
    });

    this.cleanup(projectPath);
  }

  /**
   * Kill all active sessions (server shutdown)
   */
  killAll(): void {
    for (const [projectPath, session] of this.activeSessions) {
      this.logger.log(`[ChatService] Killing session for ${projectPath}`);
      try {
        session.proc.kill('SIGTERM');
      } catch {
        // Ignore errors during shutdown
      }
      clearTimeout(session.timeoutId);
    }
    this.activeSessions.clear();
  }

  /**
   * Check if a chat is active for a project
   */
  isActive(projectPath: string): boolean {
    return this.activeSessions.has(projectPath);
  }

  // ─── Stream Event Handling ──────────────────────────────────

  private handleStreamEvent(
    event: Record<string, unknown>,
    session: ChatSession,
    ws: WebSocket,
    onToolDetected: () => void,
  ): void {
    // Handle stream_event wrapper
    if (event.type === 'stream_event') {
      const inner = event.event as Record<string, unknown> | undefined;
      if (!inner) return;

      // Content block start — detect tool use
      if (inner.type === 'content_block_start') {
        const contentBlock = inner.content_block as { type?: string; name?: string } | undefined;
        if (contentBlock?.type === 'tool_use' && contentBlock.name) {
          this.sendToClient(ws, {
            type: 'chat_tool_event',
            projectPath: session.projectPath,
            toolName: contentBlock.name,
          });

          // Mark catalog change for Write/Edit
          if (contentBlock.name === 'Write' || contentBlock.name === 'Edit') {
            onToolDetected();
          }
        }
      }

      // Text delta — stream text back
      if (inner.type === 'content_block_delta') {
        const delta = inner.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === 'text_delta' && delta.text) {
          session.accumulatedText += delta.text;
          this.sendToClient(ws, {
            type: 'chat_delta',
            projectPath: session.projectPath,
            text: delta.text,
          });
        }
      }

      // Token usage update
      if (inner.type === 'message_start') {
        const message = inner.message as { usage?: { input_tokens?: number; cache_read_input_tokens?: number } } | undefined;
        if (message?.usage) {
          session.totalTokensEstimate = (message.usage.input_tokens || 0) + (message.usage.cache_read_input_tokens || 0);
        }
      }
    }

    // Result event — final response
    if (event.type === 'result') {
      const usage = event.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } | undefined;
      if (usage) {
        session.totalTokensEstimate = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
      }
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────

  private cleanup(projectPath: string): void {
    const session = this.activeSessions.get(projectPath);
    if (!session) return;

    clearTimeout(session.timeoutId);

    // Remove disconnect handler
    if (session._disconnectHandler) {
      session.ws.removeListener('close', session._disconnectHandler);
    }

    this.activeSessions.delete(projectPath);
  }

  // ─── Session ID Persistence ─────────────────────────────────
  // Simple in-memory map for session IDs (survives across WS connections)

  private sessionIds = new Map<string, string>();
  private turnCounts = new Map<string, number>();

  private getStoredSessionId(projectPath: string): string | null {
    return this.sessionIds.get(projectPath) ?? null;
  }

  private storeSessionId(projectPath: string, sessionId: string): void {
    this.sessionIds.set(projectPath, sessionId);
  }

  private clearStoredSession(projectPath: string): void {
    this.sessionIds.delete(projectPath);
    this.turnCounts.delete(projectPath);
  }

  private getStoredTurnCount(projectPath: string): number | null {
    return this.turnCounts.get(projectPath) ?? null;
  }

  private storeTurnCount(projectPath: string, count: number): void {
    this.turnCounts.set(projectPath, count);
  }

  // ─── WebSocket Helpers ──────────────────────────────────────

  private sendToClient(ws: WebSocket, message: Record<string, unknown>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}
