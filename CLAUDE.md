# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jacques is a real-time context monitor for multiple AI coding assistants (Claude Code, Cursor). It displays **exact token usage percentage** in real-time through:
- CLI TUI (Ink/React-based terminal interface)
- In-app statusLine integration
- Session lifecycle tracking

The system uses a three-layer architecture:
1. **Hooks** (Python/Bash) → send events via Unix socket
2. **Server** (Node.js/TypeScript) → manages sessions and broadcasts updates via WebSocket
3. **CLI** (Ink/React) → displays real-time context usage

**Platform Support**: macOS, Linux, Windows. See `docs/PLATFORM-SUPPORT.md` for terminal compatibility.

**Current Status**: Phases 1-4, 6-12 complete. Phase 5 (context breakdown) pending.

## Key Commands

### Setup & Installation
```bash
npm run setup              # Full setup: install deps, build, symlink hooks
npm run configure          # Configure Claude Code settings.json with hooks
```

### Development
```bash
npm run install:all        # Install dependencies for server and cli
npm run build:all          # Build both server and cli TypeScript

# Server
npm run dev:server         # Server dev mode (tsc --watch)
npm run start:server       # Start Jacques server
cd server && npm test      # Run server tests

# CLI (Terminal TUI)
npm run dev:cli            # CLI dev mode (tsc --watch)
npm run start:cli          # Start terminal CLI

# GUI (Web Interface)
npm run build:gui          # Build GUI (required before serving)
npm run start:server       # Server serves GUI at http://localhost:4243
npm run dev:gui            # OR: Run GUI dev server at http://localhost:5173 (hot reload)
```

### Running the Web GUI

The GUI can be accessed two ways:

1. **Production mode** (served by server):
   ```bash
   npm run build:all        # Build everything including GUI
   npm run start:server     # Start server - GUI at http://localhost:4243
   ```

2. **Development mode** (hot reload):
   ```bash
   npm run start:server     # Start server for API (ports 4242/4243)
   npm run dev:gui          # Start GUI dev server at http://localhost:5173
   ```

**Important**: Always rebuild GUI (`npm run build:gui`) before using production mode if you made changes.

### Testing
```bash
cd server && npm test                                           # Run all server tests
cd core && npm test                                             # Run core tests
cd cli && npm test                                              # Run cli tests
cd hooks && python3 -m pytest adapters/test_*.py                # Run hook adapter tests
```

**Important**: Tests use `--experimental-vm-modules` because the codebase uses ES modules (`"type": "module"`).

**Test Organization**:
- `server/src/*.test.ts`: Server component tests
- `core/src/**/*.test.ts`: Core module tests (plan-extractor, catalog, plan progress)
- `core/src/plan/*.test.ts`: Plan progress tests (plan-parser, task-extractor, progress-matcher, progress-computer)
- `cli/src/**/*.test.ts`: CLI tests (sources, context, archive)
- `hooks/adapters/test_*.py`: Hook adapter tests
- Tests use mock data, no actual AI tool sessions required

## Architecture

```
Claude Code/Cursor
    ↓ (hooks via Unix socket /tmp/jacques.sock)
Jacques Server (Node.js + TypeScript)
    ↓ (WebSocket on port 4242)
CLI (Ink/React TUI)
```

- **Server** (`server/src/`): Unix socket listener, session registry, WebSocket broadcaster, HTTP API
- **Core** (`core/src/`): Shared business logic — archive, catalog, context indexing, session parsing, handoff generation
- **CLI** (`cli/src/`): Ink/React TUI with components, archive UI, context management
- **Hooks** (`hooks/`): Python/Bash scripts that send events from Claude Code/Cursor to the server
- **GUI** (`gui/`): Web-based GUI (Electron/React) for browsing sessions, plans, and subagents

**Build order**: Core → Server → CLI (each depends on the previous)

## Project Discovery

Projects are discovered from `~/.claude/projects/` where Claude Code stores JSONL session transcripts.

**Path decoding**: Claude Code encodes project paths by replacing `/` with `-` (e.g., `/Users/gole/Desktop/my-project` → `-Users-gole-Desktop-my-project`). Decoding uses three tiers:
1. `sessions-index.json` `originalPath` — authoritative (written by Claude Code)
2. `cwd` field from first JSONL entry — reliable fallback (most projects)
3. Naive decode (all `-` → `/`) — last resort, ambiguous for paths with hyphens

**Git worktree grouping**: Multiple worktrees of the same repo are grouped into a single project using `gitRepoRoot`. For deleted worktrees (directory exists but `.git` is gone), `gitBranch` is recovered from JSONL entries and the project is merged into a matching sibling git repo. The `discoverProjects()` function (`core/src/cache/project-discovery.ts`) handles all grouping.

**Non-git projects**: Projects without a git repo are standalone entries — each directory is its own project.

**Hidden projects**: Users can hide unwanted projects (e.g., `/tmp`) via `DELETE /api/projects/:name` or the X button in the ProjectSelector. Hidden list persisted in `~/.jacques/hidden-projects.json`. Use `hideProject()`/`unhideProject()` from core.

**Data flow**:
1. `discoverProjects()` scans `~/.claude/projects/`, cross-references with the session index, groups by git repo root, merges deleted worktrees, filters hidden projects
2. `GET /api/projects` exposes this as a server endpoint; `DELETE /api/projects/:name` hides a project
3. `useProjectScope` fetches on mount; `ProjectSelector` uses discovered projects as primary source
4. After sync, `refreshProjects()` is called to reload the project list

**Platform support**: macOS/Linux paths use `-` encoding. Windows drive letters strip the colon (`C:\foo` → `-C-foo`). See `docs/PLATFORM-SUPPORT.md`.

## Session Lifecycle

Sessions are tracked through their entire lifecycle, from start to end.

### Session Detection
- **Hooks**: When Claude Code starts, `SessionStart` hook fires → registers session with terminal identity
- **Process Scanner**: At server startup, scans for running `claude` processes → discovers active sessions from JSONL files
- **Auto-registration**: `statusLine` hook can auto-register sessions that started before the server

### Session Termination
- **Normal exit**: `SessionEnd` hook fires → unregisters session, triggers catalog extraction
- **Ctrl+C / Crash**: No hook fires → process verification detects dead process → unregisters session, triggers catalog extraction

### Process Verification (every 30s)
Sessions with PID-based terminal keys are verified:
1. Extract PID from terminal_key (e.g., `DISCOVERED:TTY:ttys012:68231`)
2. Check if process is still running (`kill -0 PID`)
3. If dead, unregister session and trigger catalog extraction

### Bypass Mode (`--dangerously-skip-permissions`)
Sessions can be launched with `--dangerously-skip-permissions` via the GUI Settings toggle. Tracked as `is_bypass` boolean (orthogonal to session mode). Detection paths:
1. **Launch-time**: GUI toggle → server marks CWD as pending bypass → auto-registration picks it up
2. **Startup**: `detectBypassSessions()` checks process command lines for discovered sessions with PIDs
3. **Hook-based**: `storeTerminalPid()` stores PID from first hook event and checks bypass (covers iTerm sessions without PIDs in terminal keys)

See `docs/CONNECTION.md` for full details.

### Catalog Extraction on Removal
When any session is removed (hook, process verification, or cleanup):
1. Extract session manifest → `.jacques/sessions/{id}.json`
2. Extract plans → `.jacques/plans/`
3. Extract subagent results → `.jacques/subagents/`

This ensures sessions killed with Ctrl+C are still saved to history with their plans.

## TypeScript Configuration

- **Target**: ES2022
- **Module**: NodeNext (ES modules with `.js` extensions in imports)
- **All imports must use `.js` extension** even for `.ts` files (e.g., `import { foo } from './types.js'`)
- Output directory: `dist/`
- Source maps and declarations enabled

## File Organization

```
jacques-context-manager/
├── core/src/            # Shared business logic (TypeScript)
│   ├── archive/         # Cross-project search and archiving (includes filename-utils.ts)
│   ├── cache/           # Session indexing (7 submodules: types, persistence, metadata-extractor, mode-detector, project-discovery, git-utils, hidden-projects)
│   ├── catalog/         # Catalog extraction (pre-extract JSONL → .jacques/)
│   ├── context/         # Project knowledge management (index.json)
│   ├── handoff/         # Session handoff generation
│   ├── logging/         # Structured logging (Logger interface, error classification)
│   ├── plan/            # Plan progress tracking (task extraction, progress matching)
│   ├── session/         # JSONL parsing, filtering, transformation
│   └── sources/         # External source adapters (Obsidian, etc.)
├── server/src/          # Node.js server (TypeScript)
├── server/src/connection/ # Claude Code connection layer (terminal keys, process detection, etc.)
├── server/src/mcp/      # MCP server for archive search
├── cli/src/             # CLI TUI (Ink/React)
│   ├── components/      # React/Ink UI components
│   ├── hooks/           # Custom React hooks (state management)
│   ├── handoff/         # Handoff tests (imports from @jacques/core)
│   └── templates/       # Skill templates
├── gui/src/             # Web GUI (React + Vite)
│   ├── api/             # HTTP API client (9 domain modules: sources, archive, sessions, plans, context, sync, handoffs, usage, server-config)
│   ├── components/      # React components
│   │   ├── context/     # Context Catalog GUI components
│   │   └── ui/          # Shared UI (ErrorBoundary, etc.)
│   ├── hooks/           # Custom React hooks
│   ├── pages/           # Route pages
│   ├── styles/          # Theme and styling
│   └── utils/           # Shared utilities (session-display.tsx)
├── hooks/               # Claude Code/Cursor hooks (Python/Bash)
├── scripts/             # Setup and configuration scripts
└── docs/                # Documentation
```

## Dependencies

### Required System Tools
- **jq**: JSON parsing in statusline.sh (`brew install jq`)
- **nc** (netcat): Unix socket communication (usually pre-installed)
- **Python 3.x**: For hook scripts

### Node.js Dependencies
- **ws**: WebSocket library for server and client
- **ink**: React-based CLI framework for terminal TUI
- **commander**: CLI argument parsing

## Common Operations

Before exploring source code, read the relevant `docs/` file listed below. The docs contain architecture, key files, data flows, and API endpoints for each component.

| Task | Read first | Then |
|------|-----------|------|
| Work on catalog extraction | `docs/CORE.md` (Catalog Module section) | `core/src/catalog/` |
| Work on server API | `docs/SERVER.md` (HTTP API section) | `server/src/http-api.ts` |
| Work on CLI TUI | `docs/CLI.md` | `cli/src/components/` |
| Work on web GUI | `docs/GUI.md` | `gui/src/` |
| Work on project discovery | `docs/PLATFORM-SUPPORT.md` (Path encoding section) | `core/src/cache/project-discovery.ts` (`discoverProjects`) |
| Work on hooks | `docs/HOOKS.md` | `hooks/` |
| Parse JSONL transcripts | `docs/JSONL-FORMAT.md` | `core/src/session/` |
| Work on plans/dedup | `docs/CORE.md` (Plan Identity section) | `core/src/catalog/extractor.ts`, `core/src/archive/plan-cataloger.ts` |
| Work on plan progress | `docs/CORE.md` (Plan Progress section) | `core/src/plan/`, `server/src/http-api.ts` (tasks endpoint) |
| Work on archive/search | `docs/CORE.md` (Archive Module section) | `core/src/archive/` |
| Debug unexpected behavior | `docs/PITFALLS.md` | Relevant source files |
| Work on process/terminal detection | `docs/CONNECTION.md` | `server/src/connection/` |
| Work on bypass mode detection | `docs/CONNECTION.md` (Bypass Mode section) | `server/src/session-registry.ts`, `server/src/connection/process-detection.ts` |
| Work on terminal launching | `docs/CONNECTION.md` (Terminal Launching section) | `server/src/terminal-launcher.ts` |
| Build and test everything | Use commands in Key Commands above | `cd core && npx tsc && cd ../server && npx tsc && cd ../cli && npx tsc` |
| Re-sync all sessions | Start server, then `curl -X POST http://localhost:4243/api/sync?force=true` | Or use GUI Settings → Re-sync All |

## Detailed Documentation

Architecture docs by component (read when working on that component):

- `docs/CORE.md` — Core package modules: session parsing, archive, catalog, context, handoff
- `docs/SERVER.md` — Server: session registry, event flow, HTTP API, WebSocket, MCP
- `docs/CLI.md` — CLI TUI: Ink components, keyboard shortcuts, views
- `docs/GUI.md` — Web GUI: React pages, API client, plan loading flow
- `docs/HOOKS.md` — Hook scripts: adapters, field mappings, token estimation
- `docs/CONNECTION.md` — Connection layer: terminal keys, process detection, focus tracking

Reference docs (read when working on specific problems):

- `docs/JSONL-FORMAT.md` — Claude Code JSONL entry types, structures, token data
- `docs/PLATFORM-SUPPORT.md` — Cross-platform support: macOS, Linux, Windows; terminal detection
- `docs/PHASES.md` — Development phase history and progress tracking
- `docs/PITFALLS.md` — Common pitfalls, known bugs, and lessons learned

## Jacques

Instructions for Jacques-related workflows (handoffs, plan tracking, session continuity).

### Plan Tracking

When working with a plan file (from handoff or `/plan` mode):

1. **After completing a phase/step**: Edit the plan file to update progress
   - Change `☐` to `☑` for completed items
   - Move the `← CURRENT` or `← NEXT` marker to the next item
   - Add any notes about what was learned or changed

2. **Plan file location**: Usually at `~/.claude/plans/<plan-name>.md` or noted in the handoff's "Plan Status" section

3. **Before ending session**: If you completed phases, ensure the plan file is updated so the next session has accurate progress

### Handoff Workflow

- `/jacques-handoff` — Generate handoff document before ending a session
- `/jacques-continue` — Load most recent handoff when starting a new session

The handoff captures: project context, progress made, user decisions, plan status, blockers, and next steps.
