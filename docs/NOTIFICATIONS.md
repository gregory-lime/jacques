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
| POST | `/api/notifications/test` | Fire a test notification (accepts `category`, `title`, `body`, `priority`, `sessionId` in JSON body) |

## Project/Branch Context

Notifications are enriched with project and branch info from the active session. The server resolves this via `getSession` callback wired from the session registry.

### Data Flow

1. `NotificationService.fire()` calls `resolveSessionContext(sessionId)`
2. Looks up session → extracts `project` (project name) and `git_branch`
3. Attaches `projectName` and `branchName` to `NotificationItem`
4. All surfaces (desktop, toast, browser, notification center) use these fields

### Display Logic (all surfaces)

When `projectName` is available:
- **Title**: project name (e.g., "my-project")
- **Body**: `branchName · notification title` (e.g., "feat/auth · Context reached 55%")

When `projectName` is not available (e.g., test notifications without a real session):
- **Title**: notification title
- **Body**: notification body

### Notification Titles

Titles are designed to be specific and informative:

| Category | Title Format | Example |
|----------|-------------|---------|
| context | "Context reached {N}%" | "Context reached 55%" |
| operation | "{N}k token operation" | "75k token operation" |
| plan | "Plan: {planTitle}" | "Plan: Refactor auth module" |
| bug-alert | "{N} tool errors" | "3 tool errors" |
| handoff | "Handoff Ready" | "Handoff Ready" |
| auto-compact | "Auto-compact" | "Auto-compact" |

## Click-to-Focus

### Native OS Notifications (macOS)

- `node-notifier` fires with `wait: true` and `actions: ['Focus']`
- Desktop format: project name as title, `branch · category` as subtitle, mascot icon as `contentImage`
- Click (either `'activate'` or `'Focus'` response) triggers `focusTerminal(sessionId)`
- Server uses AppleScript to bring terminal window to front
- **Note**: `actions` array is macOS-specific (terminal-notifier). Fails gracefully on Windows/Linux.

### Browser Notifications (GUI)

- Fires when GUI tab is unfocused
- Title: project name (or notification title if no project)
- Body: `branch · category` (or notification body if no project)
- Click brings browser to focus

### In-App Notifications (GUI)

- **Toast**: whole toast is clickable when session has a `sessionId` → click focuses terminal and dismisses toast. Shows project name as title, `branch · notification title` as body. Chrome bar shows category label.
- **NotificationCenter**: rows show project name as primary text, `branch · title` as secondary. Rows with a `sessionId` show a `→` focus affordance; clicking focuses the terminal.

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
| `gui/src/components/ui/Toast.tsx` | In-app toast component (clickable, project/branch display) |
| `gui/src/components/ui/ToastContainer.tsx` | Toast stack manager (threads `onFocusTerminal` to toasts) |
| `gui/src/components/ui/NotificationCenter.tsx` | Bell icon + history panel (project/branch display, click-to-focus) |
| `gui/src/components/Layout.tsx` | Wires `focusTerminal` into `ToastContainer` |
| `gui/src/components/ui/NotificationStore.ts` | Persistent notification store (localStorage) |
| `cli/src/hooks/useNotification.ts` | CLI notification hook |

## Troubleshooting

- **Notifications not appearing**: check master switch in Settings, verify server is running
- **Duplicate notifications**: check cooldown periods, verify only server detects (not GUI)
- **Click-to-focus not working**: verify session has valid `terminal_key`, check macOS accessibility permissions
- **Settings not persisting**: check `~/.jacques/config.json` write permissions
