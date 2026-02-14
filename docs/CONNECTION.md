# Connection Layer (`server/src/connection/`)

The connection layer handles all interaction between the Jacques server and running Claude Code/Cursor sessions: process detection, terminal identity, session discovery, focus detection, and terminal activation.

## Module Overview

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `constants.ts` | Centralized configuration values | `DEFAULT_CONTEXT_WINDOW_SIZE`, `IDLE_TIMEOUT_MS`, `TerminalKeyPrefix`, `TERMINAL_APP_NAMES` |
| `terminal-key.ts` | Terminal key parsing, building, matching | `parseTerminalKey()`, `buildTerminalKey()`, `extractPid()`, `extractItermUuid()`, `matchTerminalKeys()` |
| `applescript.ts` | macOS AppleScript execution | `escapeAppleScript()`, `runAppleScript()`, `isAppleScriptAvailable()` |
| `git-info.ts` | Git branch/worktree/root detection | `detectGitInfo()` |
| `worktree.ts` | Git worktree create, list, status, remove | `createWorktree()`, `listWorktrees()`, `listWorktreesWithStatus()`, `removeWorktree()` |
| `session-discovery.ts` | JSONL session file discovery | `findActiveSessionFiles()`, `findMostRecentSessionFile()`, `findRecentSessionFiles()` |
| `process-detection.ts` | Cross-platform Claude process detection | `getClaudeProcesses()`, `isProcessRunning()`, `isProcessBypass()`, `getPlatformInfo()` |
| `index.ts` | Public API (re-exports all modules) | Everything above |

## Session Module (`server/src/session/`)

Session state management is decomposed into focused modules. The `SessionRegistry` delegates to these:

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `session-factory.ts` | Create Session objects from 3 registration paths | `createFromHook()`, `createFromDiscovered()`, `createFromContextUpdate()`, `deriveProjectName()` |
| `process-monitor.ts` | Process verification, bypass detection, PID tracking | `ProcessMonitor` class |
| `cleanup-service.ts` | Recently-ended tracking, stale session cleanup | `CleanupService` class |

## Terminal Key Formats

Terminal keys uniquely identify terminal sessions. Format: `PREFIX:value`

### Key Types

| Format | Example | Source |
|--------|---------|--------|
| `ITERM:w0t0p0:UUID` | `ITERM:w0t0p1:ABC123-DEF456` | iTerm2 env `ITERM_SESSION_ID` |
| `ITERM:UUID` | `ITERM:ABC123-DEF456` | iTerm2 AppleScript (no pane info) |
| `TTY:/dev/ttysXXX` | `TTY:/dev/ttys001` | Terminal.app or generic Unix |
| `PID:XXXXX` | `PID:12345` | Fallback when no better ID |
| `KITTY:XX` | `KITTY:42` | Kitty window ID |
| `WEZTERM:pane:X` | `WEZTERM:pane:0` | WezTerm pane ID |
| `DISCOVERED:TYPE:value:PID` | `DISCOVERED:TTY:ttys001:12345` | Startup process scan |
| `AUTO:session-uuid` | `AUTO:abc-123-def` | Auto-registered from context_update |

### Key Lifecycle

1. **Session start (hooks fire)**: Hook sends `ITERM:w0t0p0:UUID` or `TTY:/dev/ttys001`
2. **Startup discovery (no hooks)**: Process scanner creates `DISCOVERED:TTY:ttys001:PID`
3. **Auto-registration (statusLine fires first)**: Created as `AUTO:session-uuid`
4. **Upgrade**: When hooks fire for a DISCOVERED/AUTO session, the key is upgraded to the real terminal key

### iTerm UUID Matching

iTerm keys have two formats that must match:
- From env: `ITERM:w0t0p0:ABC123-DEF456` (window/tab/pane prefix + UUID)
- From AppleScript: `ITERM:ABC123-DEF456` (UUID only)

`extractItermUuid()` extracts the UUID from either format. `matchTerminalKeys()` uses this for cross-format matching.

## Process Detection Flow

### At Startup (`scanForActiveSessions`)

```
1. getClaudeProcesses()
   ├── macOS/Linux: pgrep -x claude → ps (TTY) → lsof (CWD)
   └── Windows: PowerShell Get-Process → Get-WmiObject (CWD)

2. For each process CWD:
   ├── encodeProjectPath(cwd) → ~/.claude/projects/{encoded}/
   ├── findActiveSessionFiles(cwd, catalogMap)
   │   ├── List .jsonl files modified within 60s
   │   ├── Priority 1: Resolve from Jacques session catalog (fast)
   │   │   └── Git info: always live-detected from process CWD (catalog git info used only as fallback)
   │   └── Priority 2: Parse JSONL for metadata (slow fallback)
   ├── findMostRecentSessionFile() [fallback if no active files]
   └── findRecentSessionFiles() [for excess processes with idle sessions]

3. Match processes to session files by recency
   - If more processes than active sessions, find idle sessions via findRecentSessionFiles()

4. Register as DISCOVERED: sessions in SessionRegistry
```

### At Runtime (hooks)

```
Hook fires (SessionStart/statusLine/preCompact)
  → Unix socket → Jacques server
  → SessionRegistry.registerSession() or .updateContext()
  → Terminal key from hook data (ITERM:, TTY:, PID:)
```

### Session Verification (every 30s)

```
verifyProcesses()
  For each session with a PID:
    1. extractPid(terminal_key) or session.terminal.terminal_pid
    2. isProcessRunning(pid) via kill -0 (Unix) / Get-Process (Windows)
    3. If dead → unregisterSession() → catalog extraction
  Also checks:
    - CWD in Trash → remove
    - Idle > 4 hours → remove (only if process is NOT confirmed alive)
```

**Key behavior**: Sessions with a confirmed-alive PID are never removed by idle timeout. This preserves long-idle sessions where the user has the terminal open and plans to return. Only sessions without a PID or with a dead process are subject to idle cleanup.

### Periodic Cleanup (every 5 min)

`CleanupService` removes sessions in `idle` status that have been inactive > 60 minutes. Before removing, it checks PID liveness via `extractPid()` + `isProcessRunning()` — sessions with running processes are skipped.

## Bypass Mode Detection (`--dangerously-skip-permissions`)

Sessions launched with `--dangerously-skip-permissions` skip all tool approval prompts. Jacques tracks this via the `is_bypass` boolean on sessions (orthogonal to `mode` — a session can be both `plan` mode and bypass).

### Detection Paths

Three independent mechanisms detect bypass sessions:

1. **Launch-time** (`markPendingBypass`): When GUI launches a session with the flag, the CWD is recorded. The next session to auto-register from that CWD gets `is_bypass = true`.

2. **Startup discovery** (`detectBypassSessions`): After process scanning, checks each discovered session's PID via `isProcessBypass(pid)` which reads the process command line (`ps -o args=`). Only works for sessions with PIDs in their terminal keys (e.g., `DISCOVERED:TTY:ttys016:25847`).

3. **Hook-based** (`storeTerminalPid`): When the first hook event (activity, pre_tool_use, idle) arrives for an auto-registered session, the `terminal_pid` from `os.getppid()` is stored on the session and immediately checked via `isProcessBypass()`. This covers iTerm sessions whose terminal keys (`ITERM:w0t0p0:UUID`) don't contain PIDs.

### Why not CWD-based matching?

An earlier approach tried to match bypass processes to sessions by CWD when PIDs weren't available. This was unreliable because `pgrep -x claude` doesn't find all Claude processes (some run under different process names), leading to incorrect process-to-session pairings.

### Process Detection

`isProcessBypass(pid)` checks the process command line:
- **macOS/Linux**: `ps -o args= -p <pid>` → check for `--dangerously-skip-permissions`
- **Windows**: PowerShell `Get-WmiObject Win32_Process` → check `CommandLine`

`getClaudeProcesses()` also populates `isBypass` on each `DetectedProcess` by reading the full command line during enumeration.

### GUI Display

Bypass is orthogonal to mode (plan/exec). The GUI shows:
- Mode pill: green "plan" or blue "exec" (unchanged)
- Red `ShieldOff` icon next to mode pill when `is_bypass === true`

This ensures plan mode (more important for workflow) is always visible alongside the bypass indicator.

## Stale Session Detection

When a new session registers (e.g., after `/clear`), the server must detect and remove the old session from the same terminal. This is handled by `isStaleSessionForNewRegistration()` in `session-registry.ts`.

### Detection Strategies

Three strategies are applied in order:

1. **Terminal key matching** — `matchTerminalKeys()` from `terminal-key.ts` handles cross-format comparison:
   - `ITERM:w0t0p0:UUID` matches `ITERM:UUID` (env vs AppleScript format)
   - `DISCOVERED:TTY:ttys001:PID` matches `TTY:/dev/ttys001` (discovered vs hook format)
   - Strips `DISCOVERED:` and `AUTO:` prefixes before comparing

2. **PID matching** — If the new event includes `terminal_pid` (from `os.getppid()` in hooks), it's compared against the existing session's stored PID. Covers cases where terminal keys differ but the parent process is the same.

3. **CWD matching for AUTO: sessions** — If the existing session has an `AUTO:` terminal key (auto-registered from `context_update` before `SessionStart` hook fired) and both sessions share the same `cwd` (trailing slashes normalized), the old session is considered stale. This handles the case where no terminal identity or PID is available.

### Client-Side Ghost Prevention

Even with correct server-side detection, a race condition can cause ghost sessions in the CLI/GUI:

1. Server removes stale session → broadcasts `session_removed`
2. A queued `session_update` or `focus_changed` arrives after removal
3. Client handler sees the session isn't in the list → adds it back as "new"

**Fix**: Both `cli/src/hooks/useJacquesClient.ts` and `gui/src/hooks/useJacquesClient.ts` maintain a `recentlyRemovedRef` set. Session IDs are tracked for 10 seconds after removal. The `session_update` and `focus_changed` handlers skip sessions in this set.

### Recently-Ended Guard

The server also maintains a `wasRecentlyEnded` set (30-second TTL) in `CleanupService`. When a session ends via `SessionEnd` hook, its ID is tracked to prevent immediate re-registration from a late `context_update` event.

## Focus Tracking

macOS only. Polls the focused terminal app and maps it to a session.

```
startFocusWatcher(callbacks, pollIntervalMs)
  Every 500ms (1500ms when no terminal focused):
    1. getFrontmostApp() via AppleScript → "iTerm2", "Terminal", etc.
    2. Check against TERMINAL_APP_NAMES
    3. If iTerm → getITermSessionId() → "ITERM:UUID"
    4. If Terminal.app → getTerminalTTY() → "TTY:/dev/ttys001"
    5. matchTerminalKeys() against registered sessions
    6. callbacks.onFocusChange(terminalKey)
```

## Terminal Launching

Opens new terminal windows running `claude` in a given directory. Cross-platform support.

**Module**: `server/src/terminal-launcher.ts`

### Supported Terminals

| Terminal | macOS | Linux | Windows | Launch Method |
|----------|-------|-------|---------|---------------|
| iTerm2 | Yes | — | — | AppleScript `create window with default profile command` |
| Terminal.app | Yes | — | — | AppleScript `do script` |
| Kitty | Yes | Yes | — | `kitty --directory <cwd> claude` |
| WezTerm | Yes | Yes | Yes | `wezterm start --cwd <cwd> -- claude` |
| GNOME Terminal | — | Yes | — | `gnome-terminal --working-directory=<cwd> -- claude` |
| Windows Terminal | — | — | Yes | `wt -d <cwd> claude` |
| PowerShell | — | — | Yes | `Start-Process powershell ... cd <cwd>; claude` |

### Detection Priority

Auto-detection picks the first available terminal:
- **macOS**: iTerm2 (checks `/Applications/iTerm.app`) → Kitty → WezTerm → Terminal.app (always available)
- **Windows**: Windows Terminal (`where wt`) → PowerShell (always available)
- **Linux**: Kitty → WezTerm → GNOME Terminal

Override with `preferredTerminal` parameter.

### Launch Flow

```
GUI "+" button click
  → WebSocket: { type: 'launch_session', cwd: '/path/to/project', dangerously_skip_permissions: true }
  → start-server.ts: handleLaunchSession()
  → terminal-launcher.ts: launchTerminalSession({ cwd, dangerouslySkipPermissions })
    → detectAvailableTerminal() (if no preferred)
    → platform-specific launcher (AppleScript/spawn)
    → Command: `claude --dangerously-skip-permissions` (when flag set)
  → Terminal opens with `claude` running in <cwd>
  → Claude's SessionStart hook fires automatically
  → Session appears in GUI via existing WebSocket broadcast
  → Server calls markPendingBypass(cwd) to track bypass for session registration
```

### API

**WebSocket** (Client → Server):
```json
{ "type": "launch_session", "cwd": "/path/to/project", "preferred_terminal": "iterm", "dangerously_skip_permissions": true }
```

**WebSocket** (Server → Client):
```json
{ "type": "launch_session_result", "success": true, "method": "iterm", "cwd": "/path/to/project" }
```

**HTTP**:
```
POST /api/sessions/launch
Body: { "cwd": "/path/to/project", "preferredTerminal": "iterm", "dangerouslySkipPermissions": true }
Response: { "success": true, "method": "iterm" }
```

**Smart Tiling**: The GUI "+" button now uses `smart_tile_add` instead of `launch_session`, which positions the new terminal intelligently within the existing tiled layout. See [Smart Tiling](#smart-tiling) below.

### Auto-Registration

No special registration logic is needed. Once `claude` starts in the new terminal:
1. Claude Code's `SessionStart` hook fires
2. `jacques-register-session.py` detects terminal identity from environment variables
3. Sends `session_start` event to `/tmp/jacques.sock`
4. Session appears in GUI via WebSocket broadcast (~1-3s delay)

## Smart Tiling

Incrementally adds terminal windows to a tiled layout, or places them in free space when no layout is active. Supports up to 8 tiled terminals.

**Modules**:
- `server/src/window-manager/smart-layouts.ts` — Grid geometry engine, transition planning, free-space placement
- `server/src/window-manager/tile-state.ts` — Per-display tile state tracking

### Grid Progression

Row-based grid where each row can have a different column count. For n≥4: top row gets `ceil(n/2)` columns, bottom row gets `floor(n/2)`. Slot ordering is column-major (fill columns top-to-bottom, left-to-right):

```
n=1: [A]                              1 fullscreen
n=2: [A][B]                           2 side-by-side
n=3: [A][B][C]                        3 side-by-side
n=4: [A][B] / [C][D]                  2×2 equal grid
n=5: [A][B][C] / [D][E]              3 top (1/3 w), 2 bottom (1/2 w)
n=6: [A][B][C] / [D][E][F]            3×2 equal grid
n=7: [A][B][C][D] / [E][F][G]        4 top (1/4 w), 3 bottom (1/3 w)
n=8: [A][B][C][D] / [E][F][G][H]      4×2 equal grid
```

**Transitions use index-based mapping** (window at slot index i maps to new slot index i):

| Transition | Windows resized | What happens |
|---|---|---|
| 3→4 | 3 | Single row → 2×2 grid (all windows move) |
| 4→5 | 2 | Top row shrinks from 1/2 to 1/3 width |
| 5→6 | 2 | Bottom row shrinks from 1/2 to 1/3 width |
| 6→7 | 3 | Top row shrinks from 1/3 to 1/4 width |
| 7→8 | 3 | Bottom row shrinks from 1/3 to 1/4 width |

### Tile State Tracking

Server maintains an in-memory `TileState` per display. Updated when:
- User manually tiles via GUI → `TileStateManager.buildFromManualTile()`
- Smart tile adds a terminal → state updated with new slot
- Session ends → `TileStateManager.removeSession()` removes slot, recalculates grid

```typescript
interface TileState {
  displayId: string;
  workArea: WindowGeometry;
  columnsPerRow: number[];    // e.g., [3, 2] = 3 top cols, 2 bottom cols
  slots: TiledWindowSlot[];   // terminalKey, sessionId, geometry, column, row
  tiledAt: number;
}
```

State resets on server restart (tiling is ephemeral).

### Transition Algorithm

When adding a terminal (`planSmartTileTransition()`):
1. Get current tile state for the display
2. Calculate new grid spec for (count + 1) windows
3. Map existing windows by index to new grid slots (index-based, not position-identity)
4. Identify which windows need repositioning (geometry changed)
5. The last slot (at index = count) is where the new terminal goes

### Free-Space Placement

When no tile state exists, or count > 8:
1. Scan an 8×4 grid of candidate positions over the work area
2. For each candidate (1/4 width × 1/2 height), compute overlap with known windows
3. Pick the position with least overlap

### Cross-Platform Behavior

| Capability | macOS | Windows | Linux (X11) |
|---|---|---|---|
| Position windows | AppleScript | PowerShell/Win32 | wmctrl |
| Read window bounds | Yes | No | No |
| Tile state validation | Reads actual bounds (50px tolerance) | Checks session still alive | Checks session still alive |
| Display auto-detect | Majority vote on window positions | Tile state or primary | Tile state or primary |

### WebSocket API

**Client → Server:**
```json
{ "type": "smart_tile_add", "launch_cwd": "/path/to/project" }
```
or
```json
{ "type": "smart_tile_add", "new_session_id": "existing-session-id" }
```

**Server → Client:**
```json
{
  "type": "smart_tile_add_result",
  "success": true,
  "repositioned": 1,
  "total_tiled": 4,
  "used_free_space": false,
  "launch_method": "iterm"
}
```

### Integration

- GUI "+" button on worktree rows calls `smartTileAdd(cwd)` instead of `launchSession(cwd)`
- Manual tile (GUI "Tile" button) also updates tile state via `buildFromManualTile()`
- Session removal (`onSessionRemoved`) cleans tile state automatically

## Worktree Management

Creates, lists, inspects, and removes git worktrees for the project. Extends `git-info.ts` (read-only detection) with write operations.

**Module**: `server/src/connection/worktree.ts`

### API

`createWorktree(options)` → `CreateWorktreeResult`
- Creates a new git worktree as a sibling directory
- Path: `<parent>/<repoBasename>-<name>`
- Branch: auto-creates branch matching worktree name (`git worktree add -b <name> <path>`)
- Validation: name must match `[a-zA-Z0-9_-]+`, directory must not already exist

`listWorktrees(repoRoot)` → `WorktreeEntry[]`
- Prunes stale entries first (`git worktree prune`), then wraps `git worktree list --porcelain`

`listWorktreesWithStatus(repoRoot)` → `WorktreeWithStatus[]`
- Lists all worktrees with status metadata for each non-main worktree:
  - `hasUncommittedChanges`: via `git status --porcelain` (respects `.gitignore`)
  - `isMergedToMain`: via `git merge-base --is-ancestor <branch> <defaultBranch>`
- Default branch detected via `git symbolic-ref refs/remotes/origin/HEAD`, falling back to checking for `main` then `master`

`removeWorktree(options)` → `RemoveWorktreeResult`
- Removes a worktree via `git worktree remove <path>`
- Validates: path must exist, must not be the main worktree
- Optional `force` flag for worktrees with uncommitted changes
- Optional `deleteBranch` flag to also run `git branch -d <branch>` (or `-D` if force)

### WebSocket

**Create** — Client → Server:
```json
{ "type": "create_worktree", "repo_root": "...", "name": "...", "launch_session": true }
```
Server → Client:
```json
{ "type": "create_worktree_result", "success": true, "worktree_path": "...", "branch": "...", "session_launched": true }
```

**List with status** — Client → Server:
```json
{ "type": "list_worktrees", "repo_root": "..." }
```
Server → Client:
```json
{ "type": "list_worktrees_result", "success": true, "worktrees": [
  { "name": "my-worktree", "path": "/path/to/repo-my-worktree", "branch": "my-worktree", "isMain": false,
    "status": { "hasUncommittedChanges": false, "isMergedToMain": true } }
]}
```

**Remove** — Client → Server:
```json
{ "type": "remove_worktree", "repo_root": "...", "worktree_path": "...", "force": false, "delete_branch": true }
```
Server → Client:
```json
{ "type": "remove_worktree_result", "success": true, "worktree_path": "...", "branch_deleted": true }
```

### Create + Launch Flow

1. GUI sends `create_worktree` via WebSocket
2. Server validates name and creates worktree via `git worktree add -b <name> <path>`
3. If `launch_session` is true (default):
   a. Detect target display (majority vote over active session terminal keys)
   b. Launch terminal with `targetBounds` set to target display's work area
4. Claude's hooks auto-register the new session

### Remove Flow

1. GUI `GitFork` button in WindowToolbar opens `RemoveWorktreeModal`
2. Modal sends `list_worktrees` → server prunes stale entries, returns all worktrees with status
3. Modal displays non-main worktrees with status badges (uncommitted changes, merge status)
4. User clicks delete → confirmation panel shows warnings and options (force, delete branch)
5. Modal sends `remove_worktree` → server runs `git worktree remove` + optional `git branch -d`
6. Sessions in the removed worktree are cleaned up by the server's process verification cycle

## Live vs Archive Sessions

**Important distinction**: Jacques has two separate session data paths:

| Data | Transport | Endpoint | Source |
|------|-----------|----------|--------|
| **Live/active sessions** | WebSocket (port 4242) | WS broadcast `session_update` | `SessionRegistry` in server memory |
| **Archive/history** | HTTP API (port 4243) | `GET /api/sessions` | `@jacques-ai/core/cache` on disk |

The **live session registry** (`SessionRegistry`) tracks currently running sessions in memory. It's populated by:
- Hooks (Unix socket events: `context_update`, `session_start`, `session_end`)
- Process scanner at startup (`scanForActiveSessions()`)

The **archive** (`/api/sessions`) reads from the Jacques session index on disk (`.jacques/sessions/`). These are historical sessions with pre-extracted metadata.

The GUI gets live sessions via WebSocket and archive data via HTTP API.

## Constants Reference

### Context Window

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_CONTEXT_WINDOW_SIZE` | 200,000 | Claude context window in tokens |
| `AUTOCOMPACT_BUG_THRESHOLD` | 78 | Bug: autocompact triggers at ~78% when disabled |
| `DEFAULT_AUTOCOMPACT_THRESHOLD` | 95 | Default autocompact threshold when enabled |

### Timing Thresholds

| Constant | Value | Description |
|----------|-------|-------------|
| `ACTIVE_SESSION_THRESHOLD_MS` | 60s | JSONL modified within this = "active" |
| `RECENTLY_ENDED_TTL_MS` | 30s | Ignore context_update for recently ended sessions |
| `IDLE_TIMEOUT_MS` | 4h | Remove sessions idle this long |
| `PROCESS_VERIFY_INTERVAL_MS` | 30s | How often to check if processes are alive |
| `CLEANUP_INTERVAL_MS` | 5m | How often to clean up stale sessions |
| `CATALOG_CACHE_MAX_AGE_MS` | 5m | Max age for session catalog cache at startup |
| `FOCUS_WATCHER_POLL_MS` | 500ms | Focus poll interval (terminal focused) |
| `FOCUS_WATCHER_IDLE_POLL_MS` | 1500ms | Focus poll interval (no terminal focused) |

## Platform Support

| Feature | macOS | Linux | Windows |
|---------|-------|-------|---------|
| Process detection | pgrep + lsof | pgrep + lsof | PowerShell |
| Terminal identity | env vars + AppleScript | env vars via /proc | WT_SESSION |
| Focus tracking | AppleScript polling | Not supported | Not supported |
| Terminal activation | AppleScript | Not supported | Not supported |
| Terminal launching | AppleScript + spawn | spawn | spawn |
| Window positioning | AppleScript | wmctrl (X11) | PowerShell/Win32 |
| Smart tiling | Full (bounds validation) | Partial (session validation) | Partial (session validation) |
| Process verification | kill -0 | kill -0 | Get-Process |

## Consumers

| File | Uses |
|------|------|
| `session-registry.ts` | `extractPid`, `matchTerminalKeys`, `isProcessRunning`, `isProcessBypass`, constants |
| `process-scanner.ts` | `getClaudeProcesses`, `findActiveSessionFiles`, `findMostRecentSessionFile`, `findRecentSessionFiles`, `getPlatformInfo` |
| `focus-watcher.ts` | `runAppleScript`, `TERMINAL_APP_NAMES`, `FOCUS_WATCHER_POLL_MS` |
| `terminal-activator.ts` | `runAppleScript`, `extractItermUuid` |
| `terminal-launcher.ts` | `runAppleScript`, `isAppleScriptAvailable` |
| `window-manager/macos-manager.ts` | `extractItermUuid`, `runAppleScript` |
| `window-manager/smart-layouts.ts` | `WindowGeometry` (from types) |
| `window-manager/tile-state.ts` | `WindowGeometry`, `getGridSpec`, `calculateAllSlots` |
| `start-server.ts` | `PROCESS_VERIFY_INTERVAL_MS`, `createWorktree`, `TileStateManager`, `planSmartTileTransition`, `findFreeSpace` |

## Testing

```bash
cd server && npm test
```

Test files:
- `connection/terminal-key.test.ts` — 49 tests: parsing, building, extracting, matching
- `connection/applescript.test.ts` — 10 tests: escaping, platform detection
- `connection/git-info.test.ts` — 4 tests: branch detection, non-git dirs
- `connection/worktree.test.ts` — name validation, path computation, porcelain parsing
- `connection/process-detection.test.ts` — 6 tests: process liveness, platform info
- `terminal-launcher.test.ts` — Input validation, terminal detection, method dispatch
- `window-manager/smart-layouts.test.ts` — Grid specs, slot geometry, transitions (1→8), free-space placement
- `window-manager/tile-state.test.ts` — State tracking, session removal, validation (bounds + sessions)
