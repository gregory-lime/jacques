/**
 * Notification Service
 *
 * Server-side notification management for Jacques.
 * Handles desktop OS notifications via node-notifier and broadcasts
 * notification events to GUI clients via WebSocket.
 *
 * Settings are persisted in ~/.jacques/config.json under "notifications".
 */

import notifier from 'node-notifier';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { open as fsOpen } from 'fs/promises';
import { stat as fsStat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import type {
  NotificationCategory,
  NotificationSettings,
  NotificationItem,
} from '@jacques/core/notifications';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_COOLDOWNS,
  CATEGORY_SYMBOLS,
  MAX_NOTIFICATION_HISTORY,
  getContextThresholdPriority,
} from '@jacques/core/notifications';
import { parseJSONL, detectModeAndPlans } from '@jacques/core';
import type { NotificationFiredMessage, Session } from '../types.js';
import type { Logger } from '../logging/logger-factory.js';
import { createLogger } from '../logging/logger-factory.js';

// ============================================================
// Constants
// ============================================================

const JACQUES_DIR = join(homedir(), '.jacques');
const JACQUES_CONFIG_PATH = join(JACQUES_DIR, 'config.json');
const __dirname = dirname(fileURLToPath(import.meta.url));
const ICON_PATH = join(__dirname, '..', '..', '..', 'gui', 'public', 'jacsub.png');

// ============================================================
// Types
// ============================================================

export interface NotificationServiceConfig {
  /** Callback to broadcast messages to WebSocket clients */
  broadcast: (message: NotificationFiredMessage) => void;
  /** Optional callback to focus a terminal window by session ID */
  focusTerminal?: (sessionId: string) => void;
  /** Optional logger */
  logger?: Logger;
}

interface ClaudeOperationInfo {
  id: string;
  operation: string;
  phase: 'start' | 'complete';
  totalTokens: number;
  userPromptPreview?: string;
}

// ============================================================
// Service
// ============================================================

export class NotificationService {
  private broadcastFn: (message: NotificationFiredMessage) => void;
  private focusTerminalFn?: (sessionId: string) => void;
  private logger: Logger;

  /** Cooldown tracking: key -> last fire timestamp */
  private cooldowns = new Map<string, number>();
  /** Per-session fired thresholds */
  private firedThresholds = new Map<string, Set<number>>();
  /** Previous context percentages per session (for crossing detection) */
  private prevContextPct = new Map<string, number>();
  /** Notification history (most recent first) */
  private history: NotificationItem[] = [];
  /** Cached settings */
  private settings: NotificationSettings;
  /** Plan detection: known plan titles per session */
  private knownPlanTitles = new Map<string, Set<string>>();
  /** Plan detection: last check timestamp per session (30s debounce) */
  private planCheckTimestamp = new Map<string, number>();
  /** Error scanning: last byte offset per session */
  private errorScanOffset = new Map<string, number>();
  /** Error scanning: accumulated errors since last alert */
  private errorCountSinceAlert = new Map<string, number>();

  constructor(config: NotificationServiceConfig) {
    this.broadcastFn = config.broadcast;
    this.focusTerminalFn = config.focusTerminal;
    this.logger = config.logger ?? createLogger({ silent: true });
    this.settings = this.loadSettings();
  }

  // ----------------------------------------------------------
  // Settings
  // ----------------------------------------------------------

  getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  updateSettings(patch: Partial<NotificationSettings>): NotificationSettings {
    if (patch.categories) {
      this.settings.categories = {
        ...this.settings.categories,
        ...patch.categories,
      };
    }
    if (patch.enabled !== undefined) this.settings.enabled = patch.enabled;
    if (patch.largeOperationThreshold !== undefined) {
      this.settings.largeOperationThreshold = patch.largeOperationThreshold;
    }
    if (patch.contextThresholds !== undefined) {
      this.settings.contextThresholds = patch.contextThresholds;
    }
    if (patch.bugAlertThreshold !== undefined) {
      this.settings.bugAlertThreshold = patch.bugAlertThreshold;
    }
    this.saveSettings();
    return this.getSettings();
  }

  getHistory(): NotificationItem[] {
    return [...this.history];
  }

  // ----------------------------------------------------------
  // Event handlers
  // ----------------------------------------------------------

  /**
   * Called when a session's context metrics are updated.
   * Checks for threshold crossings and fires notifications.
   */
  onContextUpdate(session: Session): void {
    const pct = session.context_metrics?.used_percentage;
    if (pct == null) return;

    const sessionId = session.session_id;
    const prevPct = this.prevContextPct.get(sessionId) ?? 0;
    this.prevContextPct.set(sessionId, pct);

    // Initialize fired thresholds set if needed
    if (!this.firedThresholds.has(sessionId)) {
      this.firedThresholds.set(sessionId, new Set());
    }
    const fired = this.firedThresholds.get(sessionId)!;

    for (const threshold of this.settings.contextThresholds) {
      // Fire if we crossed upward past the threshold and haven't fired it yet
      if (pct >= threshold && prevPct < threshold && !fired.has(threshold)) {
        fired.add(threshold);

        const priority = getContextThresholdPriority(threshold);
        const label = session.session_title || session.project || sessionId.slice(0, 8);

        this.fire(
          'context',
          `${sessionId}-${threshold}`,
          `Context ${threshold}%`,
          `"${label}" reached ${Math.round(pct)}% context usage`,
          priority,
          sessionId,
        );
      }
    }
  }

  /**
   * Called when a Claude operation completes.
   * Fires if the operation exceeds the token threshold.
   */
  onClaudeOperation(op: ClaudeOperationInfo): void {
    if (op.phase !== 'complete') return;
    if (op.totalTokens < this.settings.largeOperationThreshold) return;

    const tokens = op.totalTokens >= 1000
      ? `${Math.round(op.totalTokens / 1000)}k`
      : String(op.totalTokens);

    this.fire(
      'operation',
      op.id,
      `Large Operation (${tokens} tokens)`,
      op.userPromptPreview
        ? `"${op.userPromptPreview.slice(0, 80)}"`
        : `${op.operation} completed`,
      op.totalTokens >= 100_000 ? 'high' : 'medium',
    );
  }

  /**
   * Called when a handoff file is ready.
   */
  onHandoffReady(sessionId: string, path: string): void {
    const filename = path.split('/').pop() ?? 'handoff';
    this.fire(
      'handoff',
      `${sessionId}-handoff`,
      'Handoff Ready',
      `Generated ${filename}`,
      'medium',
      sessionId,
    );
  }

  /**
   * Called when a new plan is detected in a session.
   */
  onPlanReady(sessionId: string, planTitle: string): void {
    this.fire(
      'plan',
      `${sessionId}-plan-${Date.now()}`,
      'Plan Created',
      `New plan detected: "${planTitle}"`,
      'medium',
      sessionId,
    );
  }

  /**
   * Check for new plans in a session's JSONL transcript.
   * Debounced to 30s per session to avoid excessive JSONL parsing.
   */
  async checkForNewPlans(sessionId: string, transcriptPath: string): Promise<void> {
    try {
      // 30s debounce per session
      const lastCheck = this.planCheckTimestamp.get(sessionId) ?? 0;
      if (Date.now() - lastCheck < 30_000) return;
      this.planCheckTimestamp.set(sessionId, Date.now());

      const entries = await parseJSONL(transcriptPath);
      const { planRefs } = detectModeAndPlans(entries);

      if (!this.knownPlanTitles.has(sessionId)) {
        this.knownPlanTitles.set(sessionId, new Set());
      }
      const known = this.knownPlanTitles.get(sessionId)!;

      for (const ref of planRefs) {
        const title = ref.title ?? 'Untitled Plan';
        if (!known.has(title)) {
          known.add(title);
          this.onPlanReady(sessionId, title);
        }
      }
    } catch (err) {
      this.logger.error(`[Notification] checkForNewPlans failed for ${sessionId}: ${err}`);
    }
  }

  /**
   * Scan a session's JSONL transcript for tool errors.
   * Reads incrementally from last byte offset for efficiency.
   * Fires bug-alert when error count reaches bugAlertThreshold.
   */
  async scanForErrors(sessionId: string, transcriptPath: string): Promise<void> {
    try {
      const fileStat = await fsStat(transcriptPath);
      const currentSize = fileStat.size;
      const lastOffset = this.errorScanOffset.get(sessionId) ?? 0;

      if (currentSize <= lastOffset) return;

      const fh = await fsOpen(transcriptPath, 'r');
      try {
        const buffer = Buffer.alloc(currentSize - lastOffset);
        await fh.read(buffer, 0, buffer.length, lastOffset);
        this.errorScanOffset.set(sessionId, currentSize);

        const newContent = buffer.toString('utf-8');
        const lines = newContent.split('\n');

        let errorCount = 0;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const entry = JSON.parse(trimmed);
            // Count tool_result entries with is_error
            if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
              for (const block of entry.message.content) {
                if (block.type === 'tool_result' && block.is_error === true) {
                  errorCount++;
                }
              }
            }
          } catch {
            // Skip malformed lines
          }
        }

        if (errorCount > 0) {
          const accumulated = (this.errorCountSinceAlert.get(sessionId) ?? 0) + errorCount;
          this.errorCountSinceAlert.set(sessionId, accumulated);

          if (accumulated >= this.settings.bugAlertThreshold) {
            this.fire(
              'bug-alert',
              `${sessionId}-bug-alert`,
              'Bug Alert',
              `${accumulated} tool errors in session`,
              accumulated >= 10 ? 'high' : 'medium',
              sessionId,
            );
            this.errorCountSinceAlert.set(sessionId, 0);
          }
        }
      } finally {
        await fh.close();
      }
    } catch (err) {
      this.logger.error(`[Notification] scanForErrors failed for ${sessionId}: ${err}`);
    }
  }

  /**
   * Called when a session is removed.
   * Cleans up tracking state for that session.
   */
  onSessionRemoved(sessionId: string): void {
    this.firedThresholds.delete(sessionId);
    this.prevContextPct.delete(sessionId);
    this.knownPlanTitles.delete(sessionId);
    this.planCheckTimestamp.delete(sessionId);
    this.errorScanOffset.delete(sessionId);
    this.errorCountSinceAlert.delete(sessionId);
  }

  /**
   * Fire a test notification (for development/debugging).
   * Bypasses cooldowns and enabled check.
   */
  fireTestNotification(
    category: NotificationCategory,
    title: string,
    body: string,
    priority: NotificationItem['priority'] = 'medium',
    sessionId?: string,
  ): void {
    const notification: NotificationItem = {
      id: `test-${category}-${Date.now()}`,
      category,
      title,
      body,
      priority,
      timestamp: Date.now(),
      sessionId,
    };

    // Native OS notification (if enabled)
    if (this.settings.enabled) {
      try {
        const symbol = CATEGORY_SYMBOLS[category];
        notifier.notify(
          {
            title: 'Jacques',
            subtitle: `${symbol} ${title}`,
            message: body,
            sound: 'Sosumi',
            contentImage: ICON_PATH,
            wait: true,
          },
          (_err: Error | null, response: string) => {
            if (response === 'activate' && sessionId && this.focusTerminalFn) {
              try {
                this.focusTerminalFn(sessionId);
              } catch (focusErr) {
                this.logger.error(`[Notification] Focus terminal failed: ${focusErr}`);
              }
            }
          },
        );
      } catch (err) {
        this.logger.error(`[Notification] Desktop notification failed: ${err}`);
      }
    }

    // Broadcast to GUI clients
    const message: NotificationFiredMessage = { type: 'notification_fired', notification };
    this.broadcastFn(message);
    this.history.unshift(notification);
    if (this.history.length > MAX_NOTIFICATION_HISTORY) {
      this.history = this.history.slice(0, MAX_NOTIFICATION_HISTORY);
    }
  }

  // ----------------------------------------------------------
  // Core fire logic
  // ----------------------------------------------------------

  private fire(
    category: NotificationCategory,
    key: string,
    title: string,
    body: string,
    priority: NotificationItem['priority'],
    sessionId?: string,
  ): void {
    // Category gating
    if (!this.settings.categories[category]) return;

    // Cooldown check
    if (!this.canFire(category, key)) return;

    const notification: NotificationItem = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category,
      title,
      body,
      priority,
      timestamp: Date.now(),
      sessionId,
    };

    // Add to history
    this.history.unshift(notification);
    if (this.history.length > MAX_NOTIFICATION_HISTORY) {
      this.history = this.history.slice(0, MAX_NOTIFICATION_HISTORY);
    }

    this.logger.log(`[Notification] ${category}: ${title} - ${body}`);

    // Desktop notification (if enabled)
    if (this.settings.enabled) {
      try {
        const symbol = CATEGORY_SYMBOLS[category];
        notifier.notify(
          {
            title: 'Jacques',
            subtitle: `${symbol} ${title}`,
            message: body,
            sound: 'Sosumi',
            contentImage: ICON_PATH,
            wait: true, // Keep notification for click-to-focus
          },
          (_err: Error | null, response: string) => {
            if (response === 'activate' && sessionId && this.focusTerminalFn) {
              try {
                this.focusTerminalFn(sessionId);
              } catch (focusErr) {
                this.logger.error(`[Notification] Focus terminal failed: ${focusErr}`);
              }
            }
          },
        );
      } catch (err) {
        this.logger.error(`[Notification] Desktop notification failed: ${err}`);
      }
    }

    // Broadcast to GUI clients
    const message: NotificationFiredMessage = {
      type: 'notification_fired',
      notification,
    };
    this.broadcastFn(message);
  }

  private canFire(category: NotificationCategory, key: string): boolean {
    const cooldownKey = `${category}:${key}`;
    const last = this.cooldowns.get(cooldownKey) ?? 0;
    const now = Date.now();
    if (now - last < NOTIFICATION_COOLDOWNS[category]) return false;
    this.cooldowns.set(cooldownKey, now);
    return true;
  }

  // ----------------------------------------------------------
  // Settings persistence
  // ----------------------------------------------------------

  private loadSettings(): NotificationSettings {
    try {
      if (!existsSync(JACQUES_CONFIG_PATH)) {
        return { ...DEFAULT_NOTIFICATION_SETTINGS };
      }
      const content = readFileSync(JACQUES_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(content);
      if (config.notifications) {
        return {
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...config.notifications,
          categories: {
            ...DEFAULT_NOTIFICATION_SETTINGS.categories,
            ...config.notifications.categories,
          },
        };
      }
    } catch {
      // Use defaults on any error
    }
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }

  private saveSettings(): void {
    try {
      let config: Record<string, unknown> = {};
      if (existsSync(JACQUES_CONFIG_PATH)) {
        try {
          config = JSON.parse(readFileSync(JACQUES_CONFIG_PATH, 'utf-8'));
        } catch {
          // Start fresh if corrupted
        }
      }

      config.notifications = {
        enabled: this.settings.enabled,
        categories: { ...this.settings.categories },
        largeOperationThreshold: this.settings.largeOperationThreshold,
        contextThresholds: [...this.settings.contextThresholds],
        bugAlertThreshold: this.settings.bugAlertThreshold,
      };

      if (!existsSync(JACQUES_DIR)) {
        mkdirSync(JACQUES_DIR, { recursive: true });
      }
      writeFileSync(JACQUES_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error(`[Notification] Failed to save settings: ${err}`);
    }
  }
}
