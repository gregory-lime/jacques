/**
 * Event Handler
 *
 * Routes and handles hook events from the Unix socket.
 * Coordinates between the session registry, broadcast service,
 * and handoff watcher.
 */

import type {
  HookEvent,
  SessionStartEvent,
  PreToolUseEvent,
  ActivityEvent,
  ContextUpdateEvent,
  IdleEvent,
  SessionEndEvent,
} from '../types.js';
import type { SessionRegistry } from '../session-registry.js';
import type { BroadcastService } from '../services/broadcast-service.js';
import type { NotificationService } from '../services/notification-service.js';
import type { HandoffWatcher } from '../watchers/handoff-watcher.js';
import type { Logger } from '../logging/logger-factory.js';
import { createLogger } from '../logging/logger-factory.js';

/**
 * Configuration for EventHandler
 */
export interface EventHandlerConfig {
  /** Session registry for managing sessions */
  registry: SessionRegistry;
  /** Broadcast service for sending updates */
  broadcastService: BroadcastService;
  /** Handoff watcher for file watching */
  handoffWatcher: HandoffWatcher;
  /** Notification service for desktop + in-app notifications */
  notificationService?: NotificationService;
  /** Optional logger */
  logger?: Logger;
}

/**
 * EventHandler - routes and processes hook events
 *
 * This class extracts the event handling logic from the main
 * orchestrator (start-server.ts), making it easier to test
 * and maintain.
 */
export class EventHandler {
  private registry: SessionRegistry;
  private broadcastService: BroadcastService;
  private handoffWatcher: HandoffWatcher;
  private notificationService?: NotificationService;
  private logger: Logger;

  constructor(config: EventHandlerConfig) {
    this.registry = config.registry;
    this.broadcastService = config.broadcastService;
    this.handoffWatcher = config.handoffWatcher;
    this.notificationService = config.notificationService;
    this.logger = config.logger ?? createLogger({ silent: true });
  }

  /**
   * Handle an incoming hook event
   *
   * Routes the event to the appropriate handler based on event type.
   *
   * @param event The hook event to handle
   */
  handleEvent(event: HookEvent): void {
    switch (event.event) {
      case 'session_start':
        this.handleSessionStart(event as SessionStartEvent);
        break;

      case 'pre_tool_use':
        this.handlePreToolUse(event as PreToolUseEvent);
        break;

      case 'activity':
        this.handleActivity(event as ActivityEvent);
        break;

      case 'context_update':
        this.handleContextUpdate(event as ContextUpdateEvent);
        break;

      case 'idle':
        this.handleIdle(event as IdleEvent);
        break;

      case 'session_end':
        this.handleSessionEnd(event as SessionEndEvent);
        break;

      default:
        this.logger.error(`[EventHandler] Unknown event type: ${(event as HookEvent).event}`);
    }
  }

  /**
   * Handle session start event
   */
  private handleSessionStart(event: SessionStartEvent): void {
    const session = this.registry.registerSession(event);
    this.broadcastService.broadcastSessionWithFocus(session);

    // Start watching for handoff file
    const projectDir = session.workspace?.project_dir || session.cwd;
    if (projectDir) {
      this.handoffWatcher.startWatching(session.session_id, projectDir);
    }

    // Detect mode asynchronously and broadcast if found
    this.registry.updateSessionMode(session.session_id).then((updatedSession) => {
      if (updatedSession && updatedSession.mode) {
        // Mode detected, broadcast the update
        this.broadcastService.broadcastSessionWithFocus(updatedSession);
      }
    }).catch((err) => {
      this.logger.warn(`[EventHandler] Failed to detect session mode: ${err}`);
    });
  }

  /**
   * Handle activity event
   */
  private handleActivity(event: ActivityEvent): void {
    const session = this.registry.updateActivity(event);
    if (session) {
      // Activity doesn't change focus — only broadcast the session update
      this.broadcastService.broadcastSessionUpdate(session);

      this.detectModeIfBypass(session);
    }
  }

  /**
   * Handle context update event
   */
  private handleContextUpdate(event: ContextUpdateEvent): void {
    const session = this.registry.updateContext(event);
    if (session) {
      // Context updates don't change focus — only broadcast the session update
      this.broadcastService.broadcastSessionUpdate(session);
      this.notificationService?.onContextUpdate(session);
      // Note: Mode detection is NOT done here. permission_mode from hooks
      // (PreToolUse, Activity, Idle, SessionStart) is the authoritative source.
      // JSONL-based detection is only used at session registration time.
    }
  }

  /**
   * Handle pre-tool-use event (PreToolUse hook)
   * Starts a debounced awaiting timer — if PostToolUse doesn't arrive
   * within 1 second, the session status changes to 'awaiting'.
   */
  private handlePreToolUse(event: PreToolUseEvent): void {
    this.registry.setSessionAwaiting(
      event.session_id,
      event.tool_name,
      event.permission_mode,
      (session) => {
        this.broadcastService.broadcastSessionUpdate(session);
      },
      event.terminal_pid,
    );
  }

  /**
   * Handle idle event
   */
  private handleIdle(event: IdleEvent): void {
    const session = this.registry.setSessionIdle(event.session_id, event.permission_mode, event.terminal_pid);
    if (session) {
      // Idle doesn't change focus, so just broadcast the session update
      this.broadcastService.broadcastSessionUpdate(session);
      this.detectModeIfBypass(session);
    }
  }

  /**
   * For bypass sessions, hook permission_mode is unreliable (always reports acceptEdits).
   * Detect mode from JSONL transcript instead and broadcast if changed.
   */
  private detectModeIfBypass(session: { session_id: string; mode?: string | null; is_bypass?: boolean }): void {
    if (!session.is_bypass) return;
    const modeBefore = session.mode;
    this.registry.updateSessionMode(session.session_id).then((updated) => {
      if (updated && updated.mode !== modeBefore) {
        this.broadcastService.broadcastSessionUpdate(updated);
      }
    }).catch(() => {});
  }

  /**
   * Handle session end event
   */
  private handleSessionEnd(event: SessionEndEvent): void {
    // Stop watching for handoff file before removing session
    const session = this.registry.getSession(event.session_id);
    if (session) {
      this.handoffWatcher.stopWatching(session.session_id);
    }

    this.registry.unregisterSession(event.session_id);
    this.broadcastService.broadcastSessionRemovedWithFocus(event.session_id);
    this.notificationService?.onSessionRemoved(event.session_id);
  }
}
