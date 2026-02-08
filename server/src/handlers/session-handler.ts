/**
 * Session Handler
 *
 * Handles WebSocket requests for session-level operations:
 * - focus_terminal
 * - launch_session
 */

import { WebSocket } from 'ws';
import { sendWsResponse } from './ws-utils.js';
import type { SessionRegistry } from '../session-registry.js';
import type { Logger } from '../logging/logger-factory.js';
import { activateTerminal } from '../terminal-activator.js';
import { launchTerminalSession } from '../terminal-launcher.js';
import type {
  FocusTerminalRequest,
  FocusTerminalResultMessage,
  LaunchSessionRequest,
  LaunchSessionResultMessage,
} from '../types.js';

export interface SessionHandlerDeps {
  registry: SessionRegistry;
  logger: Logger;
}

export class SessionHandler {
  private registry: SessionRegistry;
  private logger: Logger;

  constructor(deps: SessionHandlerDeps) {
    this.registry = deps.registry;
    this.logger = deps.logger;
  }

  async handleFocusTerminal(ws: WebSocket, request: FocusTerminalRequest): Promise<void> {
    const session = this.registry.getSession(request.session_id);

    if (!session) {
      sendWsResponse<FocusTerminalResultMessage>(ws, {
        type: 'focus_terminal_result',
        session_id: request.session_id,
        success: false,
        method: 'unsupported',
        error: `Session not found: ${request.session_id}`,
      });
      return;
    }

    this.logger.log(`Focusing terminal for session ${request.session_id} (key: ${session.terminal_key})`);

    if (!session.terminal_key) {
      sendWsResponse<FocusTerminalResultMessage>(ws, {
        type: 'focus_terminal_result',
        session_id: request.session_id,
        success: false,
        method: 'unsupported',
        error: 'Session has no terminal key',
      });
      return;
    }

    const result = await activateTerminal(session.terminal_key);

    sendWsResponse<FocusTerminalResultMessage>(ws, {
      type: 'focus_terminal_result',
      session_id: request.session_id,
      success: result.success,
      method: result.method,
      error: result.error,
    });

    if (result.success) {
      this.logger.log(`Terminal focused via ${result.method} for session ${request.session_id}`);
    } else {
      this.logger.log(`Terminal focus failed (${result.method}): ${result.error}`);
    }
  }

  async handleLaunchSession(ws: WebSocket, request: LaunchSessionRequest): Promise<void> {
    const { cwd, preferred_terminal, dangerously_skip_permissions } = request;

    if (!cwd) {
      sendWsResponse<LaunchSessionResultMessage>(ws, {
        type: 'launch_session_result',
        success: false,
        method: 'unsupported',
        cwd: cwd || '',
        error: 'Missing cwd',
      });
      return;
    }

    this.logger.log(`Launching new terminal session in ${cwd}`);

    try {
      const result = await launchTerminalSession({
        cwd,
        preferredTerminal: preferred_terminal,
        dangerouslySkipPermissions: dangerously_skip_permissions,
      });

      sendWsResponse<LaunchSessionResultMessage>(ws, {
        type: 'launch_session_result',
        success: result.success,
        method: result.method,
        cwd,
        error: result.error,
      });

      if (result.success) {
        this.logger.log(`Launched terminal (${result.method}) in ${cwd}`);
      } else {
        this.logger.error(`Failed to launch terminal: ${result.error}`);
      }
    } catch (err) {
      this.logger.error(`Failed to launch terminal: ${err}`);
      sendWsResponse<LaunchSessionResultMessage>(ws, {
        type: 'launch_session_result',
        success: false,
        method: 'unsupported',
        cwd,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
