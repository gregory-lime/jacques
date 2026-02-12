# Hooks (Python/Bash)

Integration scripts that send session events from Claude Code and Cursor to the Jacques server via Unix socket.

**Location**: `hooks/`
**Communication**: `/tmp/jacques.sock` (newline-delimited JSON)
**Test**: `cd hooks && python3 -m pytest adapters/test_*.py`

## Hook Scripts

### Claude Code Hooks (`hooks/`)

| Script | Event | What It Does |
|--------|-------|--------------|
| `jacques-register-session.py` | SessionStart | Register session with metadata (cwd, terminal identity, model, transcript path, permission_mode, git branch/worktree/repo root) |
| `claude-code/pre-tool-use.py` | PreToolUse | Detect when Claude is waiting for user approval (edit acceptance, command approval, etc.) |
| `jacques-report-activity.py` | PostToolUse | Track tool usage, update last_activity, update permission_mode |
| `jacques-session-idle.py` | Stop | Mark session as idle, update permission_mode |
| `jacques-unregister-session.py` | SessionEnd | Remove session from registry |
| `statusline.sh` | statusLine | Extract context metrics via `jq`, send to server, display abbreviated status |

### Cursor Hooks (`hooks/cursor/`)

| Script | Event |
|--------|-------|
| `session-start.py` | Register Cursor session |
| `post-tool-use.py` | Activity tracking |
| `after-agent-response.py` | Subagent tracking |
| `session-end.py` | Cleanup |
| `pre-compact.py` | Receive actual context metrics |

## Adapter Pattern (`hooks/adapters/`)

All hooks use adapters to normalize events from different AI tools:

| File | Responsibility |
|------|----------------|
| `base.py` | BaseAdapter — common functionality, socket communication |
| `claude_code.py` | ClaudeCodeAdapter — extract session_id, workspace.project_dir, etc. |
| `cursor.py` | CursorAdapter — extract conversation_id, workspace_roots[0], etc. |
| `template.py` | Template for adding new AI tool adapters |
| `tokenizer.py` | Token estimation (tiktoken with char-based fallback) |
| `skills.py` | Detect installed Claude Code skills |
| `calibration.py` | Calibrate token estimation against actual preCompact data |

**Field Mappings**:
| Source | Session ID | Project Path | Context Event |
|--------|-----------|-------------|---------------|
| Claude Code | `session_id` | `workspace.project_dir` | statusLine |
| Cursor | `conversation_id` | `workspace_roots[0]` | preCompact |

## Session Title Extraction

`statusline.sh` extracts titles with priority-based fallback:

1. `sessions-index.json` (closed/indexed sessions only)
2. Transcript `"type":"summary"` entries (after conversation progresses)
3. First user message (always available, skipping internal `<local-command>` tags)

Active sessions typically show the first user message until Claude generates a summary or the session gets indexed.

**Server-side filtering**: As defense-in-depth, `session-registry.ts` rejects titles starting with `<local-command` or `<command-` in all title update paths (`registerSession`, `updateActivity`, `updateContext`). This prevents title flickering when Activity events carry unfiltered `sessions-index.json` summaries that start with slash command artifacts.

## Permission Mode & Session Mode Detection

Claude Code includes a `permission_mode` field in every hook event input. This reflects the current UI mode and updates in real-time when the user presses Shift+Tab to cycle modes or uses `/plan`.

**Values**: `"default"`, `"plan"`, `"acceptEdits"`, `"dontAsk"`, `"bypassPermissions"`

All hook adapters extract `permission_mode` and include it in the event payload sent to the server. The server maps these to session mode display values:

| permission_mode | Session Mode | GUI Display |
|----------------|-------------|-------------|
| `"plan"` | `plan` | Green "plan" pill |
| `"acceptEdits"` | `acceptEdits` | Amber "auto" pill |
| `"default"` | `default` | Blue "exec" pill |
| `"dontAsk"` / `"bypassPermissions"` | `default` | Blue "exec" pill |

**Bypass sessions**: Sessions launched with `--dangerously-skip-permissions` always report `permission_mode: "acceptEdits"` regardless of actual mode. The server disables hook-based mode detection for bypass sessions and uses JSONL transcript scanning instead — raw text scan for `EnterPlanMode`/`ExitPlanMode` tool names, with parsed `detectModeAndPlans()` as fallback. This scan is debounced to once per 30s per session to avoid expensive JSONL re-reads on every hook event.

JSONL-based mode detection (`planning`/`execution`) is kept as fallback for discovered sessions that don't have hook data, and as the primary mode source for bypass sessions.

## Awaiting User Approval (PreToolUse)

The `PreToolUse` hook fires **before** Claude Code asks the user to approve a tool call. Combined with `PostToolUse` (which fires **after** approval), this enables detection of when Claude is blocked waiting for user input.

**Server-side flow**:
1. `PreToolUse` arrives → server starts a 1-second debounce timer
2. If `PostToolUse` arrives within 1 second → timer cancelled (tool was auto-approved)
3. If timer fires → session status set to `awaiting`, tool name stored for display

This debounce prevents UI flicker: auto-approved tools (in `acceptEdits` or `dontAsk` mode) trigger PostToolUse within ~100ms, so the awaiting state never broadcasts. Manual-approval tools take seconds, so the timeout fires.

**GUI display** — tool-specific labels when `status === 'awaiting'`:
| Tool | Label |
|------|-------|
| Edit, Write, NotebookEdit | "Accepting edits" |
| Bash | "Approving command" |
| AskUserQuestion | "Choosing option" |
| EnterPlanMode, ExitPlanMode | "Reviewing plan" |
| Other | "Waiting for approval" |

## Installation

`hooks/install.py` configures Claude Code/Cursor to call hooks by updating settings files. Run via `npm run configure`.

## Token Estimation (Cursor)

For Cursor sessions without preCompact data:
1. tiktoken `cl100k_base` encoding (~90% accurate)
2. Fallback to char-based estimation (4 chars/token)
3. Add skill overhead detection (~34k tokens for 21 skills)
4. Calibrate when preCompact provides actual metrics
