# Notification System

## Overview

Real-time alerts for context usage, plan detection, large operations, auto-compact events, and handoff generation. Architecture is **server-authoritative**: the server is the single source of truth for event detection, threshold tracking, and cooldowns. GUI and CLI are pure consumers.

## Architecture

### Data Flow

```
Hook Event → Unix Socket → Server EventHandler → NotificationService.fire()
  ├→ Native OS notification (node-notifier, click-to-focus)
  └→ WebSocket broadcast (notification_fired message)
      ├→ GUI: toastStore + notificationStore + Browser Notification API
      └→ CLI: inline notification in bottom border
```

### Layer Responsibilities

| Layer | Package | Role |
|-------|---------|------|
| Core | `@jacques/core/notifications` | Shared types, constants, utilities |
| Server | `server/src/services/notification-service.ts` | Event detection, threshold tracking, cooldowns, broadcasting |
| GUI | `gui/src/hooks/useJacquesClient.ts` | Receives `notification_fired`, pushes to stores |
| CLI | `cli/src/hooks/useNotification.ts` | Receives `notification_fired`, shows inline text |

## Notification Categories

| Category | Trigger | Default Thresholds | Cooldown | Priority |
|----------|---------|-------------------|----------|----------|
| context | Context usage crosses threshold | 50%, 70% | 60s | medium/high |
| operation | Claude operation > token threshold | 50k tokens | 10s | medium/high |
| plan | New plan detected in session (real-time via JSONL scanning on context_update) | -- | 30s | medium |
| auto-compact | Session automatically compacted | -- | 60s | high |
| handoff | Handoff file generated | -- | 10s | medium |
| bug-alert | Tool errors accumulate in session | 5 errors | 120s | medium/high |

## Settings

### Configuration

- **Storage**: `~/.jacques/config.json` under `notifications` key
- **Default**: disabled (master switch OFF)
- **GUI**: syncs settings to/from server via HTTP API (per-category toggles + threshold inputs)
- **CLI**: master toggle available in CLI Settings view (fetches/toggles via HTTP API)

### Settings Schema

```typescript
interface NotificationSettings {
  enabled: boolean;                              // Master switch (default: false)
  categories: Record<NotificationCategory, boolean>; // Per-category toggles
  largeOperationThreshold: number;               // Token count threshold (default: 50000)
  contextThresholds: number[];                   // Percentage thresholds (default: [50, 70])
  bugAlertThreshold: number;                     // Tool error count before alerting (default: 5)
}
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications/settings` | Get current settings |
| PUT | `/api/notifications/settings` | Update settings (partial patch) |
| GET | `/api/notifications` | Get notification history |

## Click-to-Focus

### Native OS Notifications (macOS)

- `node-notifier` fires with `wait: true`
- Click triggers `focusTerminal(sessionId)` callback
- Server uses AppleScript to bring terminal window to front

### Browser Notifications (GUI)

- Fires when GUI tab is unfocused
- Click brings browser to focus

### In-App Notifications (GUI)

- **NotificationCenter**: click notification row with sessionId to focus terminal
- **Toast**: ephemeral in-app popup showing notification title/body

## Developer Guide: Adding a New Category

1. Add to `NotificationCategory` type in `core/src/notifications/types.ts`
2. Add cooldown value in `core/src/notifications/constants.ts`
3. Add symbol and label in `core/src/notifications/constants.ts`
4. Implement detection method in `NotificationService` (server)
5. Wire trigger in `event-handler.ts` or `start-server.ts`
6. Add tests in `server/src/services/notification-service.test.ts`

## Key Files

| File | Purpose |
|------|---------|
| `core/src/notifications/` | Shared types, constants, utils |
| `server/src/services/notification-service.ts` | Server-side detection and firing |
| `server/src/routes/notification-routes.ts` | HTTP API for settings and history |
| `gui/src/hooks/useJacquesClient.ts` | WebSocket handler for `notification_fired` |
| `gui/src/hooks/useNotifications.tsx` | Settings provider (fetches from server) |
| `gui/src/components/ui/Toast.tsx` | In-app toast component |
| `gui/src/components/ui/NotificationCenter.tsx` | Bell icon + history panel |
| `gui/src/components/ui/NotificationStore.ts` | Persistent notification store (localStorage) |
| `cli/src/hooks/useNotification.ts` | CLI notification hook |

## Troubleshooting

- **Notifications not appearing**: check master switch in Settings, verify server is running
- **Duplicate notifications**: check cooldown periods, verify only server detects (not GUI)
- **Click-to-focus not working**: verify session has valid `terminal_key`, check macOS accessibility permissions
- **Settings not persisting**: check `~/.jacques/config.json` write permissions
