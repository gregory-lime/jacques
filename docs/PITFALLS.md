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
**Solution**: Disable hook-based `updateModeFromPermission()` for bypass sessions. Use JSONL transcript scanning (`detectModeAndPlans`) instead, which detects `EnterPlanMode` tool calls.

### CWD-based Process Matching Is Unreliable
**Problem**: `pgrep -x claude` doesn't find all Claude processes (some run under different process names like `node`). Attempting to match sessions to processes by CWD can assign bypass flags to wrong sessions.
**Solution**: Don't use CWD-based process matching. Instead, store `terminal_pid` from hook events (`os.getppid()`) and check bypass per-PID directly. Three detection paths: launch-time CWD tracking, startup PID checking, hook-based PID storage.

### ToggleSwitch Click Bug
**Problem**: Inner `<div role="switch">` had `onClick={(e) => e.stopPropagation()}` which prevented direct clicks on the switch from toggling
**Solution**: Changed to `onClick={handleClick}` so clicks on the switch element itself trigger the toggle

### GUI Startup Race Condition
**Problem**: GUI shows skeleton loaders for several seconds on first load. Active sessions from WebSocket arrive within ~2s, but a single `loading` boolean gates BOTH active sessions and history behind skeletons until the slow HTTP `/api/sessions/by-project` call finishes (which triggers `buildSessionIndex()` — filesystem scan, JSONL parsing, `git rev-parse` per project).
**Root cause**: Server starts HTTP/WebSocket before `scanForActiveSessions()` runs, so `initial_state` is empty. Meanwhile, `buildSessionIndex()` is called concurrently from multiple API endpoints, doubling work.
**Solution** (3-part):
1. **GUI**: Decouple loading states — `historyLoading` only gates session history, active sessions render immediately from WebSocket data (`Dashboard.tsx`)
2. **Server**: Pre-warm session index cache on startup with fire-and-forget `getSessionIndex()` call (`start-server.ts`)
3. **Core**: Deduplicate concurrent `buildSessionIndex()` calls via module-level promise (`session-index.ts`)

### TUI Log Flickering
**Problem**: In embedded/TUI mode, `startLogInterception()` writes ALL console output (including `console.error` from core modules like `parser.ts`, `token-estimator.ts`) to stdout/stderr, which IS the alternate screen buffer where Ink renders, causing visual flickering.
**Solution**: `startLogInterception({ silent: true })` suppresses writing to original console while still broadcasting to WebSocket listeners (`logger.ts`)

### CLI Socket-In-Use Error Detection
**Problem**: When another Jacques server is already listening, the thrown error has `code: undefined` (not `EADDRINUSE`) and only carries a message string. The CLI showed a misleading "Warning: Could not start embedded server" message.
**Solution**: Check both `error.code === 'EADDRINUSE'` and `error.message` containing "already" or "listening" (`cli.ts`)

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
