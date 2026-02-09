# Cross-Platform Support

Jacques supports macOS, Windows 10/11, and Linux. This document covers platform-specific behavior across all subsystems.

## Overview

| Platform | Status | Notes |
|----------|--------|-------|
| **macOS** | Full | Primary development platform. All features supported. |
| **Windows 10/11** | Full | Requires PowerShell 5.1+ (pre-installed). |
| **Linux (X11)** | Full | Optional `wmctrl` for window positioning. |
| **Linux (Wayland)** | Partial | No window positioning support. |

### Minimum Requirements

| Requirement | macOS | Windows | Linux |
|-------------|-------|---------|-------|
| Node.js | 18+ | 18+ | 18+ |
| Python | 3.8+ (`python3`) | 3.8+ (`python`) | 3.8+ (`python3`) |
| PowerShell | N/A | 5.1+ (pre-installed) | N/A |
| jq | Optional (legacy) | Not needed | Optional (legacy) |
| wmctrl | N/A | N/A | Optional (X11 tiling) |

---

## Path Conventions

### Claude Code Data Directory

Claude Code stores session data at `~/.claude/` on all platforms:

| Platform | Default Path | Env Override |
|----------|-------------|--------------|
| macOS | `/Users/<name>/.claude/` | `CLAUDE_CONFIG_DIR` |
| Windows | `C:\Users\<name>\.claude\` | `CLAUDE_CONFIG_DIR` |
| Linux | `/home/<name>/.claude/` | `CLAUDE_CONFIG_DIR` |

**Note**: Linux may use `~/.config/claude/` in newer Claude Code versions. The `CLAUDE_CONFIG_DIR` env var takes precedence.

#### Session Files

Session JSONL files are stored at:
```
~/.claude/projects/{encoded-path}/{session-uuid}.jsonl
```

Path encoding: directory path characters (`/`, `\`) are replaced with `-`.
- macOS: `/Users/gole/project` → `-Users-gole-project`
- Linux: `/home/gole/project` → `-home-gole-project`
- Windows: `C:\Users\gole\project` → `-C-Users-gole-project` (drive letter colon stripped)

Path decoding uses a three-tier resolution:
1. `sessions-index.json` `originalPath` — authoritative, written by Claude Code when a project is first opened
2. `cwd` field from the first JSONL session entry — reliable fallback for projects without `sessions-index.json`
3. Naive decode (replace `-` with `/`) — last resort, ambiguous for paths containing hyphens

**Project Discovery**: The `discoverProjects()` function scans all encoded directories and groups them by git repo root. Git worktrees of the same repo are merged into a single project. For deleted worktrees (directory exists but `.git` is gone), `gitBranch` is recovered from JSONL entries and matched to a sibling git project. Hidden projects (via `DELETE /api/projects/:name`) are filtered out. Non-git projects remain standalone. See `core/src/cache/project-discovery.ts`.

### Jacques Configuration

| File/Directory | Location | Purpose |
|---------------|----------|---------|
| Config | `~/.jacques/config.json` | Global settings, rootPath, source configs |
| Hidden projects | `~/.jacques/hidden-projects.json` | Projects excluded from discovery |
| Cache | `~/.jacques/cache/` | Session index cache |
| Archive | `~/.jacques/archive/` | Global session archive |
| Hooks | `~/.jacques/hooks/` → symlink to source | Hook scripts |
| Per-project | `{project}/.jacques/` | Catalogs, plans, subagents, context |

The `rootPath` field in `config.json` overrides the default Claude data directory. Resolution order:
1. `CLAUDE_CONFIG_DIR` env var
2. `rootPath` from `~/.jacques/config.json`
3. Default: `~/.claude/`

---

## IPC Communication

Hooks communicate with the Jacques server via IPC:

| Platform | Transport | Default Path | Env Override |
|----------|-----------|-------------|--------------|
| macOS/Linux | Unix socket | `/tmp/jacques.sock` | `JACQUES_SOCKET_PATH` |
| Windows | Named Pipe | `\\.\pipe\jacques` | `JACQUES_SOCKET_PATH` |

Node.js `net.createServer()` and `net.connect()` support both transports with the same API. Python hooks on Windows use direct pipe file write (`open(path, 'wb')`).

### Ports

| Port | Service | Configurable Via |
|------|---------|-----------------|
| 4242 | WebSocket (CLI) | `JACQUES_WS_PORT` |
| 4243 | HTTP API (GUI) | `JACQUES_HTTP_PORT` |

---

## Process Detection

Jacques detects running Claude Code sessions at startup and monitors them.

### Detection Methods

| Method | macOS | Windows | Linux |
|--------|-------|---------|-------|
| Find processes | `pgrep -x claude` | PowerShell `Get-Process` | `pgrep -x claude` |
| Get TTY | `ps -o tty= -p $PID` | N/A (no TTY concept) | `ps -o tty= -p $PID` |
| Get CWD | `lsof -p $PID \| grep cwd` | PowerShell `Get-WmiObject` | `lsof` or `/proc/{pid}/cwd` |
| Check alive | `kill -0 $PID` | PowerShell `Get-Process -Id` | `kill -0 $PID` |
| Read env | Not available (security) | Not available | `/proc/{pid}/environ` |
| Bypass check | `ps -o args= -p $PID` | PowerShell `Get-WmiObject` | `ps -o args= -p $PID` |

**Implementation**: `server/src/connection/process-detection.ts`

---

## Terminal Support

### macOS Terminals

| Terminal | Env Variable | Detection | Launching | Focus | Positioning |
|----------|-------------|-----------|-----------|-------|-------------|
| **iTerm2** | `ITERM_SESSION_ID` | Excellent | AppleScript | AppleScript | AppleScript |
| **Terminal.app** | `TERM_SESSION_ID` | Good | AppleScript | AppleScript | AppleScript |
| **Kitty** | `KITTY_WINDOW_ID` | Excellent | CLI spawn | - | - |
| **WezTerm** | `WEZTERM_PANE` | Excellent | CLI spawn | - | - |
| **Alacritty** | None | TTY fallback | - | - | - |
| **VS Code** | `VSCODE_INJECTION` | Good | - | - | - |

### Windows Terminals

| Terminal | Env Variable | Detection | Launching | Positioning |
|----------|-------------|-----------|-----------|-------------|
| **Windows Terminal** | `WT_SESSION` | Good | `wt` CLI | PowerShell/Win32 |
| **PowerShell** | None | PID fallback | `Start-Process` | PowerShell/Win32 |
| **cmd.exe** | None | PID fallback | - | PowerShell/Win32 |
| **VS Code** | `VSCODE_INJECTION` | Good | - | - |
| **ConEmu** | `ConEmuANSI` | Partial | - | - |

### Linux Terminals

| Terminal | Env Variable | Detection | Launching | Positioning |
|----------|-------------|-----------|-----------|-------------|
| **Kitty** | `KITTY_WINDOW_ID` | Excellent | CLI spawn | wmctrl (X11) |
| **WezTerm** | `WEZTERM_PANE` | Excellent | CLI spawn | wmctrl (X11) |
| **GNOME Terminal** | `VTE_VERSION` | Partial | CLI spawn | wmctrl (X11) |
| **Konsole** | `KONSOLE_VERSION` | Partial | - | wmctrl (X11) |
| **Alacritty** | `WINDOWID` | Partial | - | wmctrl (X11) |

### Terminal Key Formats

| Format | Example | Source |
|--------|---------|--------|
| `ITERM:{session_id}` | `ITERM:w0t0p0:ABC123` | iTerm2 hook |
| `KITTY:{window_id}` | `KITTY:42` | Kitty hook |
| `WEZTERM:{pane}` | `WEZTERM:pane:0` | WezTerm hook |
| `WT:{session}` | `WT:{GUID}` | Windows Terminal |
| `TTY:{tty}` | `TTY:/dev/ttys001` | Unix TTY |
| `PID:{pid}` | `PID:12345` | Fallback |
| `DISCOVERED:*` | `DISCOVERED:TTY:ttys001:12345` | Startup scan |
| `AUTO:{session_id}` | `AUTO:abc-123` | Auto-registered |

---

## Terminal Launching

Jacques can launch new Claude Code sessions in terminal windows.

### Auto-Detection Priority

| macOS | Windows | Linux |
|-------|---------|-------|
| 1. iTerm2 (`/Applications/iTerm.app`) | 1. Windows Terminal (`where wt`) | 1. Kitty |
| 2. Kitty | 2. PowerShell | 2. WezTerm |
| 3. WezTerm | | 3. GNOME Terminal |
| 4. Terminal.app | | |

**Implementation**: `server/src/terminal-launcher.ts`

---

## Window Management & Smart Tiling

### Capabilities by Platform

| Feature | macOS | Windows | Linux (X11) | Linux (Wayland) |
|---------|-------|---------|-------------|-----------------|
| Position windows | AppleScript | PowerShell/Win32 | wmctrl | Not supported |
| Read window bounds | Yes | No | No | No |
| Multi-display | Full (JXA NSScreen) | Basic | Basic (xrandr) | Not supported |
| Tile validation | Bounds + session | Session only | Session only | Not supported |
| Smart tiling | Full | Partial | Partial | Not supported |
| Free-space (n>8) | Yes | Yes | Yes | No |

### Window Positioning Technology

- **macOS**: AppleScript + JXA (JavaScript for Automation). Uses `NSScreen` for multi-display, per-terminal AppleScript for positioning.
- **Windows**: PowerShell with Win32 API (`SetWindowPos`, `SetForegroundWindow`, `ShowWindow`). Display detection via `System.Windows.Forms.Screen`.
- **Linux**: `wmctrl` for X11 window positioning, `xrandr` for display detection. Wayland has no standard window positioning API.

**Implementation**: `server/src/window-manager/`

---

## Git Worktrees

Fully cross-platform using `git` CLI commands:

| Operation | Command | Platform |
|-----------|---------|----------|
| Detect branch/worktree | `git rev-parse --abbrev-ref HEAD --git-common-dir` | All |
| Create worktree | `git worktree add -b <name> <path>` | All |
| List worktrees | `git worktree list --porcelain` | All |
| Remove worktree | `git worktree remove <path>` | All |
| Check merged | `git merge-base --is-ancestor` | All |

**Implementation**: `server/src/connection/worktree.ts`, `server/src/connection/git-info.ts`

---

## Hook Scripts

### Cross-Platform Hooks (Python)

All Python hooks work on macOS, Linux, and Windows:

| Hook | Script | Event |
|------|--------|-------|
| Status line | `statusline.py` | `StatusLine` — context updates |
| Register | `jacques-register-session.py` | `SessionStart` |
| Activity | `jacques-report-activity.py` | `PostToolUse` |
| Idle | `jacques-session-idle.py` | `Stop` |
| Unregister | `jacques-unregister-session.py` | `SessionEnd` |
| Pre-tool | `claude-code/pre-tool-use.py` | `PreToolUse` |

### Legacy Hooks (Unix only)

| Hook | Script | Replacement |
|------|--------|-------------|
| Status line | `statusline.sh` | `statusline.py` |
| Git detect | `git-detect.sh` | Python fallback in `base.py` |

`statusline.sh` requires `bash`, `jq`, and `nc` (netcat). The Python replacement (`statusline.py`) requires only Python 3.8+ and has no external dependencies.

### Configuration

Hooks are registered in `~/.claude/settings.json` via `npm run configure`. The configure script automatically uses `python3` on Unix and `python` on Windows.

---

## Focus Tracking

| Platform | Supported | Technology |
|----------|-----------|------------|
| macOS | iTerm2, Terminal.app | AppleScript polling |
| Windows | Not supported | - |
| Linux | Not supported | - |

**Implementation**: `server/src/focus-watcher.ts`

Focus tracking detects which terminal window is in the foreground, enabling the CLI to highlight the active session.

---

## Known Limitations

### Windows

- **No terminal focus detection** — no equivalent to AppleScript for detecting foreground window per-terminal
- **No window bounds reading** — tile state validation relies on session-alive checks only
- **CWD detection less reliable** — PowerShell may return executable path instead of working directory
- **`WT_SESSION` inheritance** — child processes inherit the Windows Terminal session GUID, causing false positive terminal identification
- **Python command** — Windows uses `python` instead of `python3`
- **Symlinks need admin** — setup uses junction points (no admin required) instead of symlinks
- **Path encoding** — Windows path encoding in Claude Code needs verification (drive letter colon handling)

### Linux

- **Wayland** — no window positioning support (no standard API)
- **No focus detection** — window manager dependent, not implemented
- **wmctrl required** — for X11 window positioning (`sudo apt install wmctrl`)
- **Config directory** — may use `~/.config/claude/` instead of `~/.claude/` (set `CLAUDE_CONFIG_DIR` to override)

### macOS

- **Focus detection limited** — only iTerm2 and Terminal.app supported
- **jq optional** — only needed for legacy `statusline.sh` (Python replacement available)
- **Cannot read process environment** — security restriction prevents reading env vars of other processes without hooks

---

## Setup Per Platform

### macOS

```bash
# Prerequisites: Node.js 18+, Python 3
brew install jq  # Optional (for legacy statusline.sh)

npm run setup
npm run configure
```

### Windows

```powershell
# Prerequisites: Node.js 18+, Python 3, PowerShell 5.1+ (pre-installed)

npm run setup
npm run configure
```

### Linux

```bash
# Prerequisites: Node.js 18+, Python 3
sudo apt install wmctrl  # Optional (for X11 window positioning)

npm run setup
npm run configure
```

---

## Implementation Files

| Area | Files |
|------|-------|
| Path resolution | `core/src/session/detector.ts` (`getClaudeProjectsDir`, `encodeProjectPath`) |
| Config | `core/src/sources/config.ts` (`getRootCatalogPath`), `server/src/config/config.ts` |
| IPC server | `server/src/unix-socket.ts` |
| Process detection | `server/src/connection/process-detection.ts` |
| Terminal launching | `server/src/terminal-launcher.ts` |
| Window managers | `server/src/window-manager/{macos,linux,windows}-manager.ts` |
| Smart tiling | `server/src/window-manager/smart-layouts.ts`, `tile-state.ts` |
| Focus tracking | `server/src/focus-watcher.ts` |
| Git worktrees | `server/src/connection/worktree.ts`, `git-info.ts` |
| Hook base | `hooks/adapters/base.py` |
| Statusline | `hooks/statusline.py` (cross-platform), `hooks/statusline.sh` (legacy Unix) |
| Setup | `scripts/setup.js`, `scripts/configure-claude.js` |
| Stop server | `scripts/stop-server.js` |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Override Claude Code data directory |
| `JACQUES_SOCKET_PATH` | `/tmp/jacques.sock` or `\\.\pipe\jacques` | Override IPC socket path |
| `JACQUES_WS_PORT` | `4242` | WebSocket port |
| `JACQUES_HTTP_PORT` | `4243` | HTTP API port |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | `95` | Auto-compact threshold |
| `JACQUES_SKIP` | unset | Set to `1` to skip hooks |
| `JACQUES_DEBUG` | unset | Enable debug logging |

## Troubleshooting

### Sessions not detected at startup

1. Check process: `pgrep -x claude` (Unix) or `Get-Process -Name claude` (Windows)
2. Check session files: `ls ~/.claude/projects/*/` (Unix) or `dir %USERPROFILE%\.claude\projects\` (Windows)
3. Check file freshness (must be < 60 seconds old)

### Wrong terminal matched

1. Terminal key is best-effort at startup
2. Corrected when hooks fire — check logs for "Updating discovered session"

### Windows detection failing

1. PowerShell available: `powershell.exe -Command "echo test"`
2. Execution policy: `Get-ExecutionPolicy`
3. Claude process: `Get-Process | Where-Object Name -like "*claude*"`

### Hooks not firing

1. Verify config: check `~/.claude/settings.json` for Jacques hooks
2. Re-run: `npm run configure`
3. Restart Claude Code sessions to pick up new hooks

### IPC connection failed

1. Check server running: `npm run start:server`
2. Unix: Check socket exists `ls -la /tmp/jacques.sock`
3. Windows: Server will log Named Pipe listening address on startup
