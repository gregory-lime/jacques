# Jacques — Coding Assistant

**Real-time session monitor and multi-session manager for Claude Code**

Jacques gives you full visibility and control over your Claude Code sessions. Monitor exact context window usage in real-time, tame the chaos of multiple concurrent sessions with smart terminal tiling and git worktrees, and search across your entire conversation history. Built for power users who run Claude Code at scale.

`v0.0.7-alpha` | macOS | Windows | Linux

---

## What It Does

### Monitor
- **Exact context usage** — see precise token percentage across all active sessions in real-time
- **StatusLine integration** — context % displayed directly inside Claude Code (e.g., `[Opus] ctx:42%`)
- **Session status tracking** — working, idle, awaiting approval, plan mode

### Manage
- **Launch sessions** — start new Claude Code terminals from the web GUI or API
- **Smart window tiling** — auto-arrange 1–8 terminal windows in a responsive grid layout
- **Git worktrees** — create, list, and remove worktrees with branch management from the GUI

### Archive
- **Full-text search** — search across all past conversations and their plans
- **Auto catalog extraction** — plans, subagents, and session manifests are saved automatically when sessions end (even Ctrl+C)
- **Session handoffs** — capture progress and resume in a new session with `/jacques-handoff` and `/jacques-continue`

---

## Architecture

```
Claude Code (Python hooks)
    │
    │  IPC Socket
    │  macOS/Linux: /tmp/jacques.sock
    │  Windows:     \\.\pipe\jacques
    v
┌────────────────────────────────────────┐
│  Jacques Server  (Node.js/TypeScript)  │
│                                        │
│  IPC Socket    WebSocket    HTTP API   │
│                 :4242        :4243     │
└────────────────────────────────────────┘
       │             │             │
       v             v             v
   Hook events    CLI TUI       Web GUI
                  (Ink TUI)   (localhost:4243)
```

- **IPC Socket** — Claude Code hooks send session lifecycle events (start, tool use, idle, end, context updates)
- **WebSocket (port 4242)** — real-time session state broadcasts to connected clients
- **HTTP API (port 4243)** — REST endpoints for sessions, archive, projects, tiling, sync; also serves the web GUI as static files

All three channels run from a single server process. The CLI TUI includes an embedded server, so running `jacques` starts everything.

---

## Installation

### Prerequisites

- **Node.js 18+** — `node --version`
- **Python 3.8+** — macOS/Linux: `python3 --version` | Windows: `python --version`
- **Git**
- Windows only: PowerShell 5.1+ (pre-installed on Windows 10/11)

### Step 1: Clone & Setup

```bash
git clone <repo-url> jacques
cd jacques
npm run setup
```

This checks prerequisites, installs dependencies (core, server, CLI, GUI), builds all packages, and symlinks hooks to `~/.jacques/hooks/`.

> **Windows**: Uses junction points instead of symlinks (no admin required). Hooks go to `C:\Users\<name>\.jacques\hooks\`.

### Step 2: Configure Claude Code Hooks

```bash
npm run configure
```

This backs up your existing `~/.claude/settings.json` and merges Jacques hooks: `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionEnd`, and `statusLine`.

> **Windows**: Automatically uses `python` instead of `python3` in hook commands. Settings at `C:\Users\<name>\.claude\settings.json`.

### Step 3: Install Skills

**macOS / Linux:**
```bash
mkdir -p ~/.claude/skills/jacques-handoff ~/.claude/skills/jacques-continue
cp skills/jacques-handoff/SKILL.md ~/.claude/skills/jacques-handoff/
cp skills/jacques-continue/SKILL.md ~/.claude/skills/jacques-continue/
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\skills\jacques-handoff"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\skills\jacques-continue"
Copy-Item skills\jacques-handoff\SKILL.md "$env:USERPROFILE\.claude\skills\jacques-handoff\"
Copy-Item skills\jacques-continue\SKILL.md "$env:USERPROFILE\.claude\skills\jacques-continue\"
```

This installs two slash commands: `/jacques-handoff` (save session progress) and `/jacques-continue` (resume in a new session). See the [Skills](#skills) section below.

### Step 4: Run Jacques

```bash
npx jacques
```

Starts the embedded server + CLI dashboard. Web GUI available at http://localhost:4243.

> **Tip**: `npm start` does the same thing. To make `jacques` available globally (type `jacques` from anywhere), run `cd cli && npm link`.

**Other run modes:**

| Mode | Command |
|------|---------|
| Server + Web GUI only | `npm run start:server` then open http://localhost:4243 |
| Development (hot reload) | `npm run start:server` + `npm run dev:gui` (two terminals) |

### Step 5: Initial Sync

On first run, open the web GUI at http://localhost:4243 and go to **Settings > Re-sync All**. This scans `~/.claude/projects/` and indexes all session transcripts.

Or via the command line:
```bash
curl -X POST http://localhost:4243/api/sync?force=true
```
```powershell
# Windows (PowerShell):
Invoke-WebRequest -Method POST -Uri "http://localhost:4243/api/sync?force=true"
```

Projects are automatically discovered and grouped by git repo root — worktrees of the same repo appear as one project. Use the **x** button next to any project in the sidebar to hide unwanted entries (e.g., `/tmp` sessions).

### Step 6: Start Claude Code

Start or restart a Claude Code session. It auto-registers via hooks. You'll see:

- Context percentage in Claude Code's status line: `[Opus] ctx:42%`
- The session appears in the Jacques CLI/GUI in real-time

**Important**: Restart any running Claude Code sessions after installation to pick up the new hooks.

---

## Skills

Jacques includes two slash commands for session continuity:

### `/jacques-handoff`

Generate a handoff document before ending a session. Captures:
- Current task and progress (with file paths, function names)
- User decisions and reasoning
- Plan status with completion markers
- Blockers, warnings, and failed approaches
- Prioritized next steps

Saved to: `.jacques/handoffs/{timestamp}-handoff.md`

### `/jacques-continue`

Load the latest handoff when starting a new session:
- Finds the most recent handoff in `.jacques/handoffs/`
- Summarizes where you left off
- Registers active plan for cross-session tracking
- Proposes the immediate next step

**Workflow**: End a session with `/jacques-handoff` → start a new session with `/jacques-continue`.

---

## Commands

| Command | Description |
|---------|-------------|
| `jacques` | Start CLI + embedded server (single command) |
| `npm run setup` | Install, build, symlink hooks |
| `npm run configure` | Configure Claude Code hooks in settings.json |
| `npm run start:server` | Start server only (API + WebSocket + GUI) |
| `npm run start:cli` | Start terminal TUI only |
| `npm run build:all` | Rebuild everything (core → server → CLI → GUI) |
| `npm run dev:gui` | GUI dev server with hot reload (localhost:5173) |
| `npm run stop:server` | Stop a running server |

---

## API & WebSocket

- **HTTP API** at `http://localhost:4243/api/` — endpoints for sessions, archive, projects, tiling, sync, and configuration
- **WebSocket** at `ws://localhost:4242` — real-time session updates

Key WebSocket messages: `InitialState`, `SessionUpdate`, `SessionRemoved`, `FocusChanged`, `LaunchSession`, `CreateWorktree`, `SmartTileAdd`

See [docs/SERVER.md](docs/SERVER.md) for the full endpoint reference.

---

## Configuration

### File Locations

| File | macOS / Linux | Windows |
|------|---------------|---------|
| Claude Code hooks | `~/.claude/settings.json` | `%USERPROFILE%\.claude\settings.json` |
| Hook scripts | `~/.jacques/hooks/` | `%USERPROFILE%\.jacques\hooks\` |
| Jacques config | `~/.jacques/config.json` | `%USERPROFILE%\.jacques\config.json` |
| Hidden projects | `~/.jacques/hidden-projects.json` | `%USERPROFILE%\.jacques\hidden-projects.json` |
| Skills | `~/.claude/skills/` | `%USERPROFILE%\.claude\skills\` |
| Per-project catalog | `{project}/.jacques/` | `{project}\.jacques\` |

### Environment Variables

All optional — sensible defaults are used if not set.

| Variable | Default | Purpose |
|----------|---------|---------|
| `JACQUES_WS_PORT` | `4242` | WebSocket port |
| `JACQUES_HTTP_PORT` | `4243` | HTTP API port |
| `JACQUES_SOCKET_PATH` | `/tmp/jacques.sock` (Unix) / `\\.\pipe\jacques` (Win) | IPC path |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Claude data directory override |

---

## Troubleshooting

### Server won't start

```bash
npm run stop:server                          # Kill zombie process
rm /tmp/jacques.sock                         # Remove stale socket (macOS/Linux)
lsof -i :4242 -i :4243                      # Check port conflicts (macOS/Linux)
```
```powershell
# Windows:
netstat -an | findstr "4242 4243"            # Check port conflicts
```

### Sessions not appearing

- Restart Claude Code to pick up hooks
- Verify hooks are installed:
  - macOS/Linux: `cat ~/.claude/settings.json | grep jacques`
  - Windows: `type %USERPROFILE%\.claude\settings.json | findstr jacques`
- Re-run: `npm run configure`

### CLI shows "Disconnected"

- Make sure the server is running: `npm run start:server` or just `jacques`

### Skills not working

- Verify skill files exist:
  - macOS/Linux: `ls ~/.claude/skills/jacques-handoff/SKILL.md`
  - Windows: `dir %USERPROFILE%\.claude\skills\jacques-handoff\SKILL.md`
- Re-copy from repo if missing (see [Installation Step 3](#step-3-install-skills))

### Windows-specific

- `npm link` needs an admin terminal — or use `npx jacques` instead
- Named pipe `\\.\pipe\jacques` is used automatically (no socket file to clean up)

---

## Development

```bash
npm run dev:server      # Server with tsc --watch
npm run dev:gui         # GUI with Vite hot reload
npm run build:all       # Full rebuild (core -> server -> cli -> gui)
```

### Tests

```bash
cd server && npm test       # Server tests
cd core && npm test         # Core tests
cd cli && npm test          # CLI tests
```

Build order: `core` → `server` → `cli` → `gui` (each depends on the previous).

---

## License

MIT
