# CLI TUI (`jacques`)

Terminal UI for real-time session monitoring. Built with Ink (React for CLIs). Depends on both `@jacques-ai/core` and `@jacques-ai/server`.

**Build**: `cd cli && npx tsc`
**Test**: `cd cli && npm test`
**Start**: `npm run start:cli` or just `jacques`
**Entry point**: `cli/src/cli.ts`

## CLI Commands

| Command | Description |
|---------|-------------|
| `jacques` / `jacques dashboard` | Interactive TUI (full-screen, requires TTY) |
| `jacques status` | One-shot status check |
| `jacques list` | JSON output of sessions |
| `jacques search <query>` | Search archived conversations |
| `jacques archive-stats` | Show archive statistics |
| `jacques update` | Check for and install the latest version |

The CLI TUI cannot run inline in Claude Code (requires TTY). Use `jacques` in a separate terminal.

## Architecture

```
cli.ts (Commander)
    ↓
startEmbeddedServer() → Server (embedded)
    ↓
JacquesClient (WebSocket from @jacques-ai/core) → App.tsx (Ink root)
    ↓
Dashboard (view router) → Views
```

The CLI embeds the server automatically — no need to start it separately.

### View Structure

Main menu has 3 items: **All Sessions** (1), **Settings** (2), **Web GUI** (3). Bottom bar shows **[Q]uit**.

```
App.tsx (root: hooks, keyboard dispatcher, state)
    ↓
Dashboard.tsx (view router, terminal dimensions)
    ↓
├── MainMenuView              — session summary + menu (All Sessions/Settings/Web GUI)
├── SessionsExperimentView    — sessions grouped by project+worktree, multi-select, worktree mgmt
├── SettingsView              — auto-archive, catalog, handoffs, claude token
├── ArchiveBrowserView        — search archived conversations
├── ArchiveInitProgressView   — archive indexing progress
├── ProjectDashboardView      — per-project session detail
└── PlanViewerView            — display plan content
```

### State Management

Each view has a dedicated hook. Hooks manage their own state and expose `open()`, `handleInput()`, `reset()` methods. `App.tsx` wires hooks together and dispatches keyboard input via a central `useInput` handler.

| Hook | View | Responsibility |
|------|------|----------------|
| `useJacquesClient` | — | WebSocket connection, session state, server messages |
| `useSessionsExperiment` | SessionsExperimentView | Multi-project session list, worktree grouping, multi-select, create/remove worktrees |
| `useWorktrees` | (used by useSessionsExperiment) | Fetch worktrees via WebSocket, match sessions to worktrees |
| `useProjectSelector` | (auto-selects on mount) | Fetch projects from API, eager-load on mount |
| `useUsageLimits` | SettingsView | Fetch API rate limit data |
| `useSettings` | SettingsView | Settings menu navigation, API calls |
| `useArchiveBrowser` | ArchiveBrowserView | Archive search, result browsing |
| `useProjectDashboard` | ProjectDashboardView | Per-project session detail |
| `useClaudeToken` | SettingsView | Claude API token status |

### Import Conventions

Types and business logic come from `@jacques-ai/core`:
- `Session`, `DiscoveredProject` — canonical types
- `getProjectGroupKey()` — groups sessions by git repo root basename

The CLI has no local type definitions or websocket client — all shared logic lives in core.

## Key Components

| File | Responsibility |
|------|----------------|
| `cli.ts` | CLI arg parsing, server startup, Ink app mount |
| `components/App.tsx` | Root component: hooks init, keyboard dispatcher, state coordination |
| `components/Dashboard.tsx` | View router: tracks terminal dimensions, delegates to view components |
| `components/MainMenuView.tsx` | Main menu: session summary with context meters, 3-item menu |
| `components/SessionsExperimentView.tsx` | Sessions Lab: multi-project list, worktree grouping, scroll, multi-select |
| `components/SettingsView.tsx` | Settings: auto-archive, catalog extraction, handoff browser |
| `components/ArchiveBrowserView.tsx` | Archive search interface |
| `components/PlanViewerView.tsx` | Display plan content |
| `utils/sessions-items-builder.ts` | Pure functions that build the flat content item list for SessionsExperimentView |
| `utils/bottom-controls.tsx` | `buildBottomControls()` — builds bottom bar JSX and computes width |
| `utils/constants.ts` | `MENU_ITEMS` definition |

## Technical Details

- **Alternate screen buffer**: `\x1b[?1049h` (enter) / `\x1b[?1049l` (exit) — full-screen like vim
- **Anti-ghosting**: Terminal reset `\x1Bc` on resize clears artifacts
- **Responsive layout**: `HorizontalLayout` (≥62 chars) / `VerticalLayout` (<62 chars), version hidden <70 chars
- **Fixed viewport**: `FIXED_CONTENT_HEIGHT` = 10-row content area with scroll support
- **Border calculations**: All widths derived from `terminalWidth`
- **Bottom controls**: `buildBottomControls()` auto-computes character width from key/label pairs, preventing off-by-one bugs
- **ANSI art**: Mascot converted from PNG using Jimp (`wrap="truncate-end"`)
- **Theme**: `ACCENT_COLOR=#E67E52`, `MUTED_TEXT=#8B9296`, `BORDER_COLOR=#E67E52`
- **ASCII-only controls**: Bottom bar keys must use ASCII characters only — Unicode arrows have ambiguous terminal width

## Keyboard Shortcuts

### Main Menu

| Key | Action |
|-----|--------|
| `1` / Enter on All Sessions | Open Sessions Lab |
| `2` / Enter on Settings | Open settings view |
| `3` / Enter on Web GUI | Open web GUI in browser |
| `Q` / Ctrl+C | Quit (exits alternate screen, stops server) |
| Up/Down | Navigate menu items |

### Sessions Lab (`SessionsExperimentView`)

| Key | Action |
|-----|--------|
| Up/Down | Navigate selectable items (sessions, buttons) |
| Enter | Focus terminal (on session), launch (on New Session), create (on New Worktree) |
| Space | Toggle multi-select on current session |
| `f` | Maximize/fullscreen selected session's terminal window |
| `t` | Tile selected sessions (requires 2+ selected with Space) |
| `n` | Launch new session in same directory as current session |
| `a` | Select all sessions |
| `x` | Clear multi-selection |
| `d` | Toggle details mode (show all worktrees including empty, across all projects) |
| `h` | Toggle keyboard shortcut legend |
| Esc | Return to main menu |

#### Worktree Removal (within details mode)

| Key | Action |
|-----|--------|
| `b` | Toggle delete-branch option |
| `f` | Toggle force-remove (required for uncommitted changes) |
| Enter | Confirm removal |
| Esc | Cancel removal |

## Settings View

5 menu items:
1. Claude Code settings (auto-compact toggle)
2. Auto-Archive toggle
3. Extract Catalog
4. Re-extract All (force)
5. Browse handoffs
