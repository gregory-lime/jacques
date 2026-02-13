# Common Pitfalls, Known Bugs & Lessons Learned

## Common Pitfalls & Solutions

### Timing Issues
**Problem**: statusLine fires BEFORE SessionStart hook
**Solution**: Auto-register sessions from context_update events

### Project Detection
**Problem**: `cwd` in hook input may be `~/.claude`, not the project directory
**Solution**: Always prefer `workspace.project_dir` over `cwd`

### Empty Transcripts
**Problem**: Transcript may be empty at SessionStart
**Solution**: Generate fallback titles using project name

### Cursor Model Confusion
**Problem**: Cursor reports different models in different events
**Solution**: Only use model from `sessionStart` (user's actual model), ignore model from `preCompact` (internal Gemini Flash for summarization)

### Skill Overhead
**Problem**: Cursor injects ALL installed skills into EVERY message (~20k tokens for 17 skills)
**Solution**: Detect skills at session start, add to baseline estimate

### Bash Case Statement Syntax in Hooks
**Problem**: Case patterns with `<` characters in bash break with quoted syntax
```bash
# BROKEN - causes syntax error:
case "$content" in
  '<local-command'*) continue ;;
esac
```
**Solution**: Use first-character checking instead:
```bash
# WORKS:
first_char="${content:0:1}"
if [ "$first_char" = "<" ]; then
  continue
fi
```

### Embedded Plan Detection
**Problem**: Plan content must be ≥100 chars AFTER trigger phrase removal
**Example**: User message "Implement the following plan:\n\n# Title\n\nContent" is 120 chars, but after removing trigger (31 chars), content is only 89 chars
**Solution**: Ensure plan content alone exceeds 100 characters, not including the trigger phrase
**Test gotcha**: When writing tests, account for this when creating test data

### Claude Code Source Field
**Problem**: Claude Code sends `source: "clear"`, `source: "startup"`, `source: "resume"` to indicate how session started, not which AI tool
**Solution**: Normalize these to `claude_code` in session-registry.ts for internal tracking

### Output Tokens in JSONL Are Inaccurate
**Problem**: Claude Code JSONL files record `output_tokens: 1` or very low values (1-9) for every assistant entry, regardless of actual text content length. This appears to be a streaming artifact where only incremental/partial values are logged, not the final totals.
**Evidence**:
- Text with 8,156 characters shows `output_tokens: 1`
- All entries have `stop_reason: null` (incomplete streaming state)
- Sum across entire session gives ~500 output tokens when actual output is 10,000+ tokens
**Solution**: Use **tiktoken** (`@dqbd/tiktoken` with `cl100k_base` encoding) to count actual tokens from:
- Assistant message text (`entry.content.text`)
- Thinking blocks (`entry.content.thinking`)
- Tool call inputs (`JSON.stringify(entry.content.toolInput)`)
**Implementation**: `core/src/session/parser.ts` - `countTokens()` function and `totalOutputTokensEstimated` field
**Note**: Other tools like ccusage, toktrack also have this limitation - they just read the inaccurate JSONL values. Our tiktoken approach gives ~30-100x more accurate estimates.

### Bypass Sessions Report Wrong permission_mode
**Problem**: Sessions launched with `--dangerously-skip-permissions` always report `permission_mode: "acceptEdits"` in hook events, regardless of actual mode (plan, exec, etc.)
**Solution**: Disable hook-based `updateModeFromPermission()` for bypass sessions. Use JSONL transcript scanning instead:
- **Raw text scan** for `"name":"EnterPlanMode"` / `"name":"ExitPlanMode"` (catches tool_use blocks in any position, not just first per message)
- Falls back to parsed `detectModeAndPlans()` for execution mode
- When ExitPlanMode is found after the last EnterPlanMode but parsed detection returns no mode, returns `'default'` to clear stale `'planning'` state
- **30s per-session debounce** on `detectModeIfBypass()` in EventHandler prevents re-reading full JSONL on every Activity/Idle event

### Bypass Session Title Flickering
**Problem**: In bypass mode, the CLI sessions tab alternates between the real title and "Active Session". Two code paths update `session_title` and they disagree: `updateContext()` (from statusline) correctly filters `<local-command`/`<command-` prefixed messages, but `updateActivity()` (from Activity events) passes through whatever `sessions-index.json` recorded as the summary — which can be a `<local-command-caveat>` message if the session started with a slash command. `formatSessionTitle()` sees the `<local-command` prefix and displays "Active Session", then the next statusline update restores the correct title.
**Solution**: Filter titles starting with `<local-command` or `<command-` server-side in all three title update paths: `registerSession()`, `updateActivity()`, and `updateContext()` in `session-registry.ts`.

### CWD-based Process Matching Is Unreliable
**Problem**: `pgrep -x claude` doesn't find all Claude processes (some run under different process names like `node`). Attempting to match sessions to processes by CWD can assign bypass flags to wrong sessions.
**Solution**: Don't use CWD-based process matching. Instead, store `terminal_pid` from hook events (`os.getppid()`) and check bypass per-PID directly. Three detection paths: launch-time CWD tracking, startup PID checking, hook-based PID storage.

### Startup Shows Wrong Git Branch for Worktree Sessions
**Problem**: At startup, the process scanner trusted the session catalog's `gitBranch` field, which was detected once per decoded project path (not per session CWD). For worktrees, the decoded path could resolve to the main repo root, producing "master" for all sessions. Live git detection was only used when the catalog had *no* branch — so a wrong "master" value prevented the correct branch from being detected.
**Solution**: `resolveSessionMetadata()` in `session-discovery.ts` now always runs live `detectGitInfo(cwd)` using the process's actual CWD. Catalog git info is only used as fallback when live detection fails. Additionally, `jacques-register-session.py` now sends git info at SessionStart (previously it sent none).

### CLI Shows "other" Instead of Worktree Name for New Worktrees
**Problem**: When a new git worktree is created and a session starts in it, the CLI's cached worktree list (from `git worktree list`) may not include the new worktree yet. Sessions that can't match any known worktree were dumped under a hardcoded `"other"` header with `branch: null`.
**Solution**: `sessions-items-builder.ts` now groups unmatched sessions by their `git_branch` (or `git_worktree`) instead of using a hardcoded "other" label. The literal "other" only appears as a last resort when a session has no git info at all.

### Parent-Directory Matching Silently Loses Sessions
**Problem**: The second pass of `discoverProjects()` merged orphaned worktrees into git projects by matching parent directories (`path.dirname()`). When multiple git repos shared the same parent (e.g., `/Users/user/Desktop`), `Array.find()` returned the first arbitrary match. If that match was a hidden project, the merged sessions were deleted by the hidden-projects filter — silently losing 20% of sessions on some machines.
**Solution**: Replaced parent-directory matching with two reliable strategies: (1) `readWorktreeRepoRoot()` reads the `.git` text file in zombie worktrees to find the exact repo root (no ambiguity), (2) name-prefix heuristic matches worktree dirname to repo basename (e.g., `my-repo-feature` → `my-repo`), using longest prefix match when multiple candidates exist and skipping when no match is found. See `core/src/cache/project-discovery.ts` and `core/src/cache/git-utils.ts`.

### ToggleSwitch Click Bug
**Problem**: Inner `<div role="switch">` had `onClick={(e) => e.stopPropagation()}` which prevented direct clicks on the switch from toggling
**Solution**: Changed to `onClick={handleClick}` so clicks on the switch element itself trigger the toggle

### GUI Startup Race Condition
**Problem**: GUI shows skeleton loaders for several seconds on first load. Active sessions from WebSocket arrive within ~2s, but a single `loading` boolean gates BOTH active sessions and history behind skeletons until the slow HTTP `/api/sessions/by-project` call finishes (which triggers `buildSessionIndex()` — filesystem scan, JSONL parsing, `git rev-parse` per project).
**Root cause**: Server starts HTTP/WebSocket before `scanForActiveSessions()` runs, so `initial_state` is empty. Meanwhile, `buildSessionIndex()` is called concurrently from multiple API endpoints, doubling work.
**Solution** (3-part):
1. **GUI**: Decouple loading states — `historyLoading` only gates session history, active sessions render immediately from WebSocket data (`Dashboard.tsx`)
2. **Server**: Pre-warm session index cache on startup with fire-and-forget `getSessionIndex()` call (`start-server.ts`)
3. **Core**: Deduplicate concurrent `buildSessionIndex()` calls via module-level promise (`cache/persistence.ts`)

### Cache Module Circular Dependency
**Problem**: `persistence.ts` needs `buildSessionIndex` from `metadata-extractor.ts`, but `metadata-extractor.ts` imports `writeSessionIndex` from `persistence.ts`, creating a circular import.
**Solution**: Use dynamic `await import("./metadata-extractor.js")` in `persistence.ts` (inside `getSessionIndex()`) to break the cycle at runtime. The import only runs when a rebuild is needed, not at module load time.

### ESM Test Mocking in Core
**Problem**: Core uses ES modules (`"type": "module"`). `jest.mock()` is not available as a global in ESM mode — `ReferenceError: jest is not defined`.
**Solution**: Import `jest` from `@jest/globals`, use `jest.unstable_mockModule()` instead of `jest.mock()`, and dynamically import the module under test in `beforeEach`. When mocking `fs`, include all named exports used by transitive dependencies (e.g., `existsSync`, `readFileSync`) — not just the methods your test calls directly.

### Silent Catch Blocks Hide Real Errors
**Problem**: Core modules had 20+ bare `catch {}` blocks that silently swallowed all errors — ENOENT (expected), JSON corruption (bug), permission denied (config issue) all returned the same empty default with no diagnostics.
**Solution**: Replaced with structured logging using `core/src/logging/`. Each catch now classifies the error:
- ENOENT → stay silent (file doesn't exist yet, expected)
- JSON parse / permission / unexpected → `logger.warn()` or `logger.error()`
- Race condition (file disappeared between readdir/stat) → stay silent
All loggers are **silent by default** (`createLogger()` returns no-op). Server can inject verbose loggers later.

### TUI Log Flickering
**Problem**: In embedded/TUI mode, `startLogInterception()` writes ALL console output (including `console.error` from core modules like `parser.ts`, `token-estimator.ts`) to stdout/stderr, which IS the alternate screen buffer where Ink renders, causing visual flickering.
**Solution**: `startLogInterception({ silent: true })` suppresses writing to original console while still broadcasting to WebSocket listeners (`logger.ts`)

### CLI Socket-In-Use Error Detection
**Problem**: When another Jacques server is already listening, the thrown error has `code: undefined` (not `EADDRINUSE`) and only carries a message string. The CLI showed a misleading "Warning: Could not start embedded server" message.
**Solution**: Check both `error.code === 'EADDRINUSE'` and `error.message` containing "already" or "listening" (`cli.ts`)

### Ghost Sessions After /clear (Client-Side Race Condition)
**Problem**: After `/clear` in Claude Code, the old session persists alongside the new one in the CLI/GUI session list (2 sessions instead of 1). The server correctly removes the stale session and broadcasts `session_removed`, but a late `session_update` or `focus_changed` event arrives after the removal — and the React state handler re-adds the session because it no longer exists in the array.
**Root cause**: In `useJacquesClient.ts`, the `session_update` handler checks `if (index >= 0) { update } else { add new }`. After `session_removed` fires and filters the session out, a queued `session_update` or `focus_changed` arrives, finds no match (index < 0), and re-adds the removed session as if it were new.
**Solution**: Added `recentlyRemovedRef` (`useRef<Set<string>>`) in both `cli/src/hooks/useJacquesClient.ts` and `gui/src/hooks/useJacquesClient.ts`. On `session_removed`, the session ID is added to the set with a 10-second TTL. The `session_update` and `focus_changed` handlers skip sessions in this set, preventing ghost re-addition.

### Stale Session Detection Strategies
**Problem**: When a new session registers from the same terminal (e.g., after `/clear`), the server must identify and remove the old session. Different registration paths produce different terminal key formats (`ITERM:`, `DISCOVERED:`, `AUTO:`, etc.), making exact-match comparison insufficient.
**Solution**: `isStaleSessionForNewRegistration()` uses three strategies in order:
1. **Terminal key matching** (`matchTerminalKeys()`): Smart cross-format matching (e.g., `ITERM:w0t0p0:UUID` matches `DISCOVERED:ITERM:UUID`)
2. **PID matching**: If the new session's `terminal_pid` matches an existing session's PID
3. **CWD matching for AUTO: sessions**: If the existing session has an `AUTO:` prefix key and the CWDs match (trailing slash normalized)

### Terminal Key Priority Must Be Consistent Across All Scripts
**Problem**: Five different scripts build terminal keys (`terminal-key.ts`, `base.py`, `statusline.py`, `statusline.sh`, `jacques-register-session.py`). If the priority order differs, sessions from the same terminal get different keys and stale detection fails.
**Canonical order**: `ITERM > KITTY > WEZTERM > WT > TERM > TTY > PID`
**Solution**: Aligned all five scripts to the same priority order. Always check all scripts when adding a new terminal type.

## Known Bugs & Workarounds

### Claude Code Bug #18264
Even with `autoCompact: false`, compaction still triggers at ~78% context usage.

**Workaround**: Create handoff files before 70% usage to avoid automatic compaction.

## Lessons Learned

### Technical
- statusLine provides `transcript_path` - enables real-time parsing
- Different AI tools have incompatible field names - adapter pattern essential
- tiktoken not available in system Python 3.13 - always implement fallbacks
- JSONL user messages are `type: "user"`, NOT `queue-operation`
- Path encoding uses dashes, keep the leading dash
- Plan `source` field has three values: `"embedded" | "write" | "agent"` — grouping picks best via priority (write > embedded > agent)
- Jaccard similarity is lower than intuitive - 0.9 threshold appropriate for very similar plans
- Plan extraction triggers on Save Context or archive, not during active session
- Session index cache (`~/.jacques/cache/sessions-index.json`) has raw plan detections; catalog manifests (`.jacques/sessions/{id}.json`) have deduplicated planRefs with `catalogId` — server must overlay catalog data onto cache responses
- PlanNavigator must use backend `planRefs` when available (has `catalogId` for content loading); message-based re-detection is a fallback only for uncataloged sessions
- Agent plan content must be read from subagent JSONL (last substantial assistant message), not served as a redirect — the `/api/sessions/:id/plans/:messageIndex` endpoint handles all source types directly

### Process
- Read files before editing (especially for large codebases)
- Test each functionality before moving to next task
- Use TDD when possible (Phase 2, 3 had excellent test coverage)
- Remove dead code aggressively (Phase 7 removed 32.6 KB)
