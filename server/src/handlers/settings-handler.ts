/**
 * Settings Handler
 *
 * Handles WebSocket requests for settings management:
 * - toggle_autocompact
 * - update_notification_settings
 * - get_handoff_context
 */

import { WebSocket } from 'ws';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { sendWsResponse } from './ws-utils.js';
import type { SessionRegistry } from '../session-registry.js';
import type { JacquesWebSocketServer } from '../websocket.js';
import type { NotificationService } from '../services/notification-service.js';
import type { Logger } from '../logging/logger-factory.js';
import { ServerConfig } from '../config/config.js';
import { getCompactContextForSkill } from '@jacques-ai/core/handoff';
import type {
  AutoCompactToggledMessage,
  GetHandoffContextRequest,
  HandoffContextMessage,
  HandoffContextErrorMessage,
  UpdateNotificationSettingsRequest,
  NotificationSettingsMessage,
} from '../types.js';

export interface SettingsHandlerDeps {
  registry: SessionRegistry;
  wsServer: JacquesWebSocketServer;
  notificationService: NotificationService;
  logger: Logger;
}

export class SettingsHandler {
  private registry: SessionRegistry;
  private wsServer: JacquesWebSocketServer;
  private notificationService: NotificationService;
  private logger: Logger;

  constructor(deps: SettingsHandlerDeps) {
    this.registry = deps.registry;
    this.wsServer = deps.wsServer;
    this.notificationService = deps.notificationService;
    this.logger = deps.logger;
  }

  handleToggleAutoCompact(ws: WebSocket): void {
    try {
      let settings: Record<string, unknown> = {};
      if (existsSync(ServerConfig.claudeSettingsPath)) {
        try {
          const content = readFileSync(ServerConfig.claudeSettingsPath, 'utf-8');
          settings = JSON.parse(content);
        } catch {
          // Start fresh if file is corrupted
        }
      }

      const currentValue = settings.autoCompact !== false;
      const newValue = !currentValue;
      settings.autoCompact = newValue;

      const dir = dirname(ServerConfig.claudeSettingsPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(ServerConfig.claudeSettingsPath, JSON.stringify(settings, null, 2));

      const response: AutoCompactToggledMessage = {
        type: 'autocompact_toggled',
        enabled: newValue,
        warning: newValue ? undefined : 'Known bug: may still trigger at ~78%',
      };

      this.logger.log(`Auto-compact toggled to: ${newValue ? 'ON' : 'OFF'}`);
      sendWsResponse(ws, response);

      // Update all sessions with new autocompact status
      const sessions = this.registry.getAllSessions();
      for (const session of sessions) {
        session.autocompact = {
          enabled: newValue,
          threshold: ServerConfig.autoCompactThreshold,
          bug_threshold: newValue ? null : 78,
        };
        this.wsServer.broadcastSessionUpdate(session);
      }
    } catch (err) {
      this.logger.error(`Failed to toggle auto-compact: ${err}`);
    }
  }

  async handleGetHandoffContext(ws: WebSocket, request: GetHandoffContextRequest): Promise<void> {
    const session = this.registry.getSession(request.session_id);

    if (!session) {
      this.sendHandoffError(ws, request.session_id, `Session not found: ${request.session_id}`);
      return;
    }

    if (!session.transcript_path) {
      this.sendHandoffError(ws, request.session_id, 'Session has no transcript path');
      return;
    }

    const projectDir = session.workspace?.project_dir || session.cwd;

    try {
      this.logger.log(`Extracting compact handoff context for session ${request.session_id}`);
      const result = await getCompactContextForSkill(session.transcript_path, projectDir);

      const response: HandoffContextMessage = {
        type: 'handoff_context',
        session_id: request.session_id,
        context: result.context,
        token_estimate: result.tokenEstimate,
        data: {
          title: result.data.title,
          projectDir: result.data.projectDir,
          filesModified: result.data.filesModified,
          toolsUsed: result.data.toolsUsed,
          recentMessages: result.data.recentMessages,
          assistantHighlights: result.data.assistantHighlights,
          decisions: result.data.decisions,
          technologies: result.data.technologies,
          blockers: result.data.blockers,
          totalUserMessages: result.data.totalUserMessages,
          totalToolCalls: result.data.totalToolCalls,
          plans: result.data.plans,
        },
      };

      this.logger.log(`Compact context extracted: ~${result.tokenEstimate} tokens`);
      sendWsResponse(ws, response);
    } catch (err) {
      this.logger.error(`Failed to extract handoff context: ${err}`);
      this.sendHandoffError(
        ws,
        request.session_id,
        `Failed to extract context: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  handleUpdateNotificationSettings(ws: WebSocket, request: UpdateNotificationSettingsRequest): void {
    const updated = this.notificationService.updateSettings(request.settings);
    const response: NotificationSettingsMessage = {
      type: 'notification_settings',
      settings: updated,
    };
    sendWsResponse(ws, response);
    this.logger.log(`Notification settings updated: desktop=${updated.enabled}`);
  }

  private sendHandoffError(ws: WebSocket, sessionId: string, error: string): void {
    const errorResponse: HandoffContextErrorMessage = {
      type: 'handoff_context_error',
      session_id: sessionId,
      error,
    };
    sendWsResponse(ws, errorResponse);
  }
}
