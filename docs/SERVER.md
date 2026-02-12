# Server (`@jacques/server`)

Real-time session tracking, event processing, and REST/WebSocket API. Depends on `@jacques/core` (must be built first).

**Build**: `cd server && npx tsc`
**Test**: `cd server && npm test`
**Start**: `npm run start:server` (standalone) or embedded via CLI
**Ports**: 4242 (WebSocket), 4243 (HTTP API)

## Key Files

| File | Responsibility |
|------|----------------|
| `server.ts` | Standalone CLI entry point — PID file, pre-flight checks, signal handlers |
| `start-server.ts` | Embeddable orchestrator — wires socket, WebSocket, registry, HTTP; thin router delegates to handler classes |
| `types.ts` | Server-specific types (events, messages) |
| `session-registry.ts` | In-memory session state management (facade over session/ modules) |
| `session/session-factory.ts` | Session object creation from 3 registration paths |
| `session/process-monitor.ts` | Process verification, bypass detection, PID management |
| `session/cleanup-service.ts` | Recently-ended tracking, stale session cleanup |
| `process-scanner.ts` | Cross-platform startup session detection |
| `unix-socket.ts` | Listen on `/tmp/jacques.sock` for hook events |
| `websocket.ts` | Broadcast session updates to clients |
| `http-api.ts` | REST API orchestrator — thin router chains domain route handlers |
| `routes/types.ts` | RouteContext, RouteHandler types shared by all route modules |
| `routes/http-utils.ts` | parseBody, sendJson, handleCors, getMimeType, serveStaticFile, createSSEWriter |
| `routes/config-store.ts` | JacquesConfig read/write (`~/.jacques/config.json`) |
| `routes/session-routes.ts` | 11 routes: `/api/sessions/*` (list, detail, badges, tasks, plans, subagents) |
| `routes/project-routes.ts` | 15 routes: `/api/projects/*` (plans, context CRUD, catalog, handoffs) |
| `routes/archive-routes.ts` | 8 routes: `/api/archive/*` (stats, conversations, search, subagents, initialize) |
| `routes/source-routes.ts` | 5 routes: `/api/sources/*` (status, Google/Notion OAuth) |
| `routes/sync-routes.ts` | 2 SSE routes: `/api/sync`, `/api/catalog/extract` |
| `routes/notification-routes.ts` | 3 routes: `/api/notifications/*` (settings, history) |
| `routes/claude-routes.ts` | 2 routes: `/api/claude/operations/*` |
| `routes/tile-routes.ts` | 3 routes: `/api/tile/*` (displays, sessions, with-keys) |
| `routes/config-routes.ts` | 2 routes: `/api/config/*` (root-path) |
| `routes/usage-routes.ts` | 1 route: `/api/usage` |
| `routes/static-routes.ts` | GUI static file serving with SPA fallback |
| `terminal-activator.ts` | Activate terminal window via AppleScript |
| `focus-watcher.ts` | Monitor OS focus changes |
| `handlers/event-handler.ts` | Routes hook events to registry + broadcast |
| `handlers/window-handler.ts` | Window management: tile, maximize, browser layout, smart tile |
| `handlers/worktree-handler.ts` | Git worktree create, list, remove |
| `handlers/session-handler.ts` | Focus terminal, launch session |
| `handlers/settings-handler.ts` | Auto-compact toggle, notification settings, handoff context |
| `handlers/ws-utils.ts` | Shared WebSocket response helper |

## Event Flow

```
Hooks (Python/Bash)
    ↓ newline-delimited JSON
/tmp/jacques.sock (Unix socket)
    ↓
UnixSocketServer → EventHandler → SessionRegistry
                                      ↓
                                BroadcastService → WebSocket clients (4242)
                                      ↓
                                HTTP API (4243) — for GUI and REST queries
```

**Event types**: SessionStart, PostToolUse, ContextUpdate, Stop, SessionEnd

## Startup Session Detection

At startup, Jacques scans for running Claude Code sessions **before** hooks fire. This provides immediate visibility into active sessions.

**Process** (in `start-server.ts`):
1. HTTP/WebSocket servers start
2. `getSessionIndex()` fires (fire-and-forget) to pre-warm the session index cache
3. `scanForActiveSessions()` enumerates running `claude` processes
4. Maps each process CWD to `~/.claude/projects/{encoded-path}/`
5. Finds active JSONL files (modified < 60s) or most recent
6. Registers sessions with `DISCOVERED:*` terminal key prefix
7. Broadcasts to connected clients

**Index pre-warming**: The fire-and-forget `getSessionIndex()` call (step 2) runs concurrently with session scanning (step 3). This populates `~/.jacques/cache/sessions-index.json` before the GUI's first HTTP request arrives, so `listSessionsByProject()` returns instantly from cache instead of triggering a slow rebuild.

**Platform support**: macOS, Linux, Windows. See `docs/PLATFORM-SUPPORT.md` for details.

**Multi-session same-directory**: Detects ALL active sessions, not just one per directory.

**Hook upgrade**: When hooks fire, `DISCOVERED:*` sessions upgrade to real terminal keys.

**Metadata sources** (priority order):
1. **Jacques session index** (`getSessionIndex()` from `@jacques/core/cache`) — Pre-extracted titles, git info, token stats from `.jacques/index.json`
2. **Git detection** — Inline `git rev-parse` for uncataloged sessions
3. **JSONL parsing** — Fallback for brand-new sessions not in catalog

This ensures discovered sessions show accurate metadata immediately without expensive JSONL parsing.

## Session Registry

In-memory session store indexed by `session_id`. The registry is a thin facade that delegates to three focused modules:

- **`session/session-factory.ts`** — Creates Session objects from 3 registration paths (hooks, process discovery, context_update auto-registration)
- **`session/process-monitor.ts`** — Verifies processes are still running, detects bypass mode from PIDs, manages pending bypass CWD tracking
- **`session/cleanup-service.ts`** — Tracks recently-ended sessions (prevents re-registration from stale events), runs periodic stale session cleanup

**Key behaviors:**

- **Auto-registration**: If `context_update` arrives before `session_start`, auto-creates the session
- **Discovery registration**: Sessions detected at startup via process scanning
- **Terminal key upgrade**: AUTO:/DISCOVERED: keys upgrade to real keys when hooks fire
- **Terminal key conflict**: New session in same terminal tab removes the old session
- **Auto-focus**: Most recently active session gets focus
- **Terminal identity**: `terminal_key` combines TTY, iTerm session ID, terminal PID
- **Auto-compact tracking**: Reads `~/.claude/settings.json` for autoCompact settings
- **Session mode**: Tracked via `permission_mode` from hook events (`plan`, `acceptEdits`, `default`); JSONL detection as fallback for bypass sessions (where hooks always report `acceptEdits`)
- **Bypass tracking**: `is_bypass` boolean (orthogonal to mode). Detected via three paths: launch-time CWD tracking, startup PID checking, hook-based PID storage. See `docs/CONNECTION.md` for details.
- **Session status**: `active` → `working` → `idle` or `awaiting` (4 states)
- **Awaiting detection**: PreToolUse starts 1s debounce timer; if PostToolUse arrives in time, timer cancelled; otherwise status becomes `awaiting` with tool-specific labels

## HTTP API Endpoints

The HTTP API is organized into domain-specific route modules in `routes/`. Each module exports a `RouteHandler` function that returns `true` if it handled the request, `false` to pass to the next handler. The orchestrator in `http-api.ts` chains handlers — first match wins.

### Sessions (`routes/session-routes.ts`)
- `GET /api/sessions` — All sessions from cache. Returns `{ sessions, lastScanned }`
- `GET /api/sessions/by-project` — Sessions grouped by project slug. Returns `{ projects: Record<string, session[]> }`
- `GET /api/sessions/stats` — Cache index statistics. Returns `{ totalSessions, totalSizeBytes, sizeFormatted }`
- `POST /api/sessions/rebuild` — Rebuild session index (SSE streaming progress). Events: `progress`, `complete`
- `POST /api/sessions/launch` — Launch a new Claude Code session in a terminal. Body: `{ cwd, mode? }`
- `GET /api/sessions/:id` — Single session with **catalog overlay** (deduplicated planRefs). Returns session detail with entries, statistics, mode, subagents
- `GET /api/sessions/:id/badges` — Lightweight badge data (plan count, mode, subagent count, awaiting status)
- `GET /api/sessions/:id/subagents/:agentId` — Subagent detail from JSONL entries
- `GET /api/sessions/:id/web-searches` — Web search results extracted from session entries
- `GET /api/sessions/:id/tasks` — Task signals extracted from session. Returns `{ tasks, summary: { total, completed, percentage } }`
- `GET /api/sessions/:id/plans/:messageIndex` — Plan content by assistant message index (handles all source types: local file, catalog, inline)

### Projects (`routes/project-routes.ts`)
- `GET /api/projects` — All discovered projects, grouped by git repo root. Merges worktrees. Filters hidden projects. Returns `{ projects: DiscoveredProject[] }`
- `DELETE /api/projects/:name` — Hide a project. Persisted in `~/.jacques/hidden-projects.json`
- `GET /api/projects/:path/plans` — List plans for a project. Returns `{ plans }`
- `GET /api/projects/:path/plans/:planId/content` — Plan content from catalog. Looks up plan in project index, reads content from local file
- `POST /api/projects/:path/active-plans` — Activate a plan. Body: `{ planPath }`. Deduplicates via `findDuplicatePlan`
- `GET /api/projects/:path/active-plans` — List active plan IDs. Returns `{ activePlanIds }`
- `DELETE /api/projects/:path/active-plans/:planId` — Deactivate a plan
- `GET /api/projects/:path/catalog` — Project catalog overview. Returns `{ context, plans, sessions, subagents, updatedAt }`
- `GET /api/projects/:path/context/:id/content` — Read context file content
- `POST /api/projects/:path/context` — Add context to project index. Body: `{ name, content, source? }`
- `PUT /api/projects/:path/context/:id` — Update context entry. Body: `{ name?, content? }`
- `DELETE /api/projects/:path/context/:id` — Remove context from project index
- `GET /api/projects/:path/subagents/:id/content` — Subagent result markdown from `.jacques/subagents/`
- `GET /api/projects/:path/handoffs` — List handoff documents. Returns `{ handoffs }`
- `GET /api/projects/:path/handoffs/:filename/content` — Handoff document content

### Archive (`routes/archive-routes.ts`)
- `GET /api/archive/stats` — Archive statistics. Returns `{ totalConversations, totalProjects, totalSizeBytes }`
- `GET /api/archive/conversations` — List all archived conversation manifests. Returns `{ manifests }`
- `GET /api/archive/conversations/by-project` — Conversations grouped by project. Returns `{ projects: Record<string, manifest[]> }`
- `GET /api/archive/conversations/:id` — Single conversation manifest detail
- `POST /api/archive/search` — Search archived conversations. Body: `{ query, limit?, offset? }`. Returns `{ results, total }`
- `GET /api/archive/subagents/:agentId` — Archived subagent data. Returns `{ subagent }`
- `GET /api/archive/sessions/:sessionId/subagents` — List subagents for an archived session. Returns `{ subagents }`
- `POST /api/archive/initialize` — Initialize archive from existing data (SSE streaming). Events: `progress`, `complete`

### Sources (`routes/source-routes.ts`)
- `GET /api/sources/status` — Connection status for all sources (Obsidian, Google Docs, Notion). Returns `{ obsidian, googleDocs, notion }`
- `POST /api/sources/google` — Configure Google Docs OAuth. Body: `{ client_id, client_secret, tokens }`
- `DELETE /api/sources/google` — Disconnect Google Docs integration
- `POST /api/sources/notion` — Configure Notion OAuth. Body: `{ client_id, client_secret, tokens, workspace_name? }`
- `DELETE /api/sources/notion` — Disconnect Notion integration

### Sync (`routes/sync-routes.ts`)
- `POST /api/sync` — Unified sync: catalog extraction then session index rebuild (SSE streaming). Query: `?force=true` to re-extract all. Events: `progress` (with `phase: 'extracting' | 'indexing'`), `complete`
- `POST /api/catalog/extract` — Trigger catalog extraction only (SSE streaming). Query: `?project=<path>` for single project, `?force=true` to force re-extraction

### Notifications (`routes/notification-routes.ts`)
- `GET /api/notifications/settings` — Current notification preferences
- `PUT /api/notifications/settings` — Update notification preferences. Body: notification settings object
- `GET /api/notifications` — Recent notification history

### Config (`routes/config-routes.ts`)
- `GET /api/config/root-path` — Current Claude projects root path. Returns `{ rootPath }`
- `POST /api/config/root-path` — Set custom root path. Body: `{ rootPath }`

### Claude Operations (`routes/claude-routes.ts`)
- `GET /api/claude/operations` — List tracked Claude API operations
- `GET /api/claude/operations/:id/debug` — Debug data for a specific operation

### Tile (`routes/tile-routes.ts`)
- `GET /api/tile/displays` — Available display information for window tiling
- `POST /api/tile/sessions` — Tile windows by session IDs. Body: `{ sessionIds }`
- `POST /api/tile/with-keys` — Tile windows by terminal keys. Body: `{ terminalKeys }`

### Usage (`routes/usage-routes.ts`)
- `GET /api/usage` — Claude API usage limits and current consumption

### Static Files (`routes/static-routes.ts`)
- `GET /` — Serve `gui/dist/index.html`
- `GET /*` — Static assets from `gui/dist/`, with SPA fallback to `index.html`

## Catalog Overlay

The session API overlays deduplicated `planRefs` from catalog manifests onto the session index cache. This is critical for the Plan Identity System. The shared `overlayCatalogPlanRefs()` helper in `session-routes.ts` handles this for both `handleGetSession` and `handlePlanByMessageIndex`:

1. Reads session from cache
2. Tries `.jacques/sessions/{id}.json` at `sessionEntry.projectPath`
3. If not found, falls back to `sessionEntry.gitRepoRoot` (covers deleted worktrees where `.jacques/` lives at the repo root)
4. If found, replaces cache `planRefs` with catalog's deduplicated version (has `catalogId`, `sources`)
5. Falls back to raw cache planRefs when no catalog exists at either location

## WebSocket Messages

**Server → Client**: InitialState, SessionUpdate, SessionRemoved, FocusChanged, ServerStatus, AutoCompactToggled, HandoffReady, CreateWorktreeResult, ListWorktreesResult, RemoveWorktreeResult, LaunchSessionResult

**Client → Server**: SelectSession, TriggerAction, ToggleAutoCompact, FocusTerminal, LaunchSession, CreateWorktree, ListWorktrees, RemoveWorktree

### Worktree Messages

**List worktrees with status** — Client → Server:
```json
{ "type": "list_worktrees", "repo_root": "/path/to/repo" }
```
Server → Client:
```json
{ "type": "list_worktrees_result", "success": true, "worktrees": [
  { "name": "my-feature", "path": "/path/to/repo-my-feature", "branch": "my-feature", "isMain": false,
    "status": { "hasUncommittedChanges": false, "isMergedToMain": true } }
]}
```

**Remove worktree** — Client → Server:
```json
{ "type": "remove_worktree", "repo_root": "/path/to/repo", "worktree_path": "/path/to/repo-my-feature", "force": false, "delete_branch": true }
```
Server → Client:
```json
{ "type": "remove_worktree_result", "success": true, "worktree_path": "/path/to/repo-my-feature", "branch_deleted": true }
```

See `docs/CONNECTION.md` (Worktree Management section) for full details on the git operations behind these messages.

## Log Interception (`server/src/logger.ts`)

`startLogInterception()` replaces `console.log/warn/error` to broadcast logs to WebSocket clients (for GUI log panel). Accepts `{ silent: boolean }` option:

- **`silent: false`** (default, standalone mode): writes to stdout/stderr AND broadcasts to WebSocket
- **`silent: true`** (embedded/TUI mode): only broadcasts to WebSocket, suppresses stdout/stderr to prevent core module `console.error` calls from leaking onto Ink's alternate screen buffer

## WebSocket Handlers

Client messages are routed by `start-server.ts` to domain handler classes:

| Handler | Messages | Deps |
|---------|----------|------|
| `WindowHandler` | tile_windows, maximize_window, position_browser_layout, smart_tile_add | registry, tileStateManager |
| `WorktreeHandler` | create_worktree, list_worktrees, remove_worktree | registry, tileStateManager |
| `SessionHandler` | focus_terminal, launch_session | registry |
| `SettingsHandler` | toggle_autocompact, get_handoff_context, update_notification_settings | registry, wsServer, notificationService |

`select_session`, `trigger_action`, `chat_send`, and `chat_abort` are handled inline in the router.

## Services

- `broadcast-service.ts` — Dispatch events to all WebSocket clients
- `notification-service.ts` — Server-authoritative notification service. Detects events, fires native OS notifications via `node-notifier` with click-to-focus, broadcasts `notification_fired` WebSocket messages. Uses types/constants from `@jacques/core/notifications`. See `docs/NOTIFICATIONS.md`
- `watchers/handoff-watcher.ts` — Monitor `.jacques/handoffs/` for new files

## MCP Server (`server/src/mcp/`)

Model Context Protocol server for Claude Code integration. Provides `search_conversations` tool.

**Entry**: `server/dist/mcp/server.js` (installed as `jacques-mcp` binary)

Configure in `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "jacques": {
      "command": "node",
      "args": ["/path/to/jacques/server/dist/mcp/server.js"]
    }
  }
}
```

## Server Management

**PID file**: `~/.jacques/server.pid`

**Pre-flight checks** before starting:
- PID file liveness (is the recorded PID still alive?)
- Socket liveness (is something listening on /tmp/jacques.sock?)
- Port availability (are 4242/4243 free?)

**Troubleshooting** — if sessions stop registering:
1. `npm run stop:server` to kill zombie processes
2. `lsof -i :4242 -i :4243` should show nothing
3. `ls /tmp/jacques.sock` should not exist
4. Start fresh
