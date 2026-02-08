# Server (`@jacques/server`)

Real-time session tracking, event processing, and REST/WebSocket API. Depends on `@jacques/core` (must be built first).

**Build**: `cd server && npx tsc`
**Test**: `cd server && npm test`
**Start**: `npm run start:server` (standalone) or embedded via dashboard
**Ports**: 4242 (WebSocket), 4243 (HTTP API)

## Key Files

| File | Responsibility |
|------|----------------|
| `server.ts` | Main orchestrator — wires socket, WebSocket, registry, HTTP |
| `start-server.ts` | Embeddable entry point (used by dashboard) |
| `types.ts` | Server-specific types (events, messages) |
| `session-registry.ts` | In-memory session state management |
| `process-scanner.ts` | Cross-platform startup session detection |
| `unix-socket.ts` | Listen on `/tmp/jacques.sock` for hook events |
| `websocket.ts` | Broadcast session updates to clients |
| `http-api.ts` | REST API on port 4243 |
| `terminal-activator.ts` | Activate terminal window via AppleScript |
| `focus-watcher.ts` | Monitor OS focus changes |

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

In-memory session store indexed by `session_id`.

- **Auto-registration**: If `context_update` arrives before `session_start`, auto-creates the session
- **Discovery registration**: Sessions detected at startup via process scanning
- **Auto-focus**: Most recently active session gets focus
- **Terminal identity**: `terminal_key` combines TTY, iTerm session ID, terminal PID
- **Auto-compact tracking**: Reads `~/.claude/settings.json` for autoCompact settings
- **Session mode**: Tracked via `permission_mode` from hook events (`plan`, `acceptEdits`, `default`); JSONL detection as fallback for bypass sessions (where hooks always report `acceptEdits`)
- **Bypass tracking**: `is_bypass` boolean (orthogonal to mode). Detected via three paths: launch-time CWD tracking, startup PID checking, hook-based PID storage. See `docs/CONNECTION.md` for details.
- **Session status**: `active` → `working` → `idle` or `awaiting` (4 states)
- **Awaiting detection**: PreToolUse starts 1s debounce timer; if PostToolUse arrives in time, timer cancelled; otherwise status becomes `awaiting` with tool-specific labels

## HTTP API Endpoints

### Projects
- `GET /api/projects` — All discovered projects, grouped by git repo root. Merges worktrees. Filters hidden projects. Returns `{ projects: DiscoveredProject[] }` with name, gitRepoRoot, isGitProject, projectPaths, encodedPaths, sessionCount, lastActivity.
- `DELETE /api/projects/:name` — Hide a project from the discovered list. Persisted in `~/.jacques/hidden-projects.json`.

### Sessions
- `GET /api/sessions` — All sessions from cache
- `GET /api/sessions/:id` — Single session with **catalog overlay** (deduplicated planRefs)
- `GET /api/sessions/:id/plans/:messageIndex` — Plan content (handles all source types)

### Archive
- `GET /api/archive/search?q=...` — Search archived conversations
- `GET /api/archive/manifests` — List all manifests

### Sync
- `POST /api/sync` — Unified sync: catalog extraction then session index rebuild (SSE progress with `phase: 'extracting' | 'indexing'`; `?force=true` to re-sync all)

### Catalog
- `POST /api/catalog/extract` — Trigger catalog extraction (standalone, SSE progress)
- `POST /api/sessions/rebuild` — Rebuild session index (standalone, SSE progress)
- `GET /api/projects/:path/catalog` — Project catalog (context, plans, sessions)
- `GET /api/projects/:path/subagents/:id/content` — Subagent result markdown
- `GET /api/projects/:path/plans/:id/content` — Plan content from catalog

### Sources
- `GET /api/sources/status` — Check source connections
- `POST /api/sources/google` — Configure Google Docs OAuth
- `POST /api/sources/notion` — Configure Notion OAuth

### Static Files
- `GET /` — Serve `gui/dist/index.html`
- `GET /*` — Static assets

## Catalog Overlay

The session API overlays deduplicated `planRefs` from catalog manifests onto the session index cache. This is critical for the Plan Identity System:

1. `GET /api/sessions/:id` reads session from cache
2. Looks up `.jacques/sessions/{id}.json` catalog manifest
3. If found, replaces cache `planRefs` with catalog's deduplicated version (has `catalogId`, `sources`)
4. Falls back to raw cache planRefs when no catalog exists

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

## Services

- `broadcast-service.ts` — Dispatch events to all WebSocket clients
- `notification-service.ts` — Native OS desktop notifications (node-notifier)
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
