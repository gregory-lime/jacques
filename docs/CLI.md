# CLI TUI (`jacques`)

Terminal UI for real-time session monitoring. Built with Ink (React for CLIs). Depends on both `@jacques/core` and `@jacques/server`.

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

The CLI TUI cannot run inline in Claude Code (requires TTY). Use `jacques` in a separate terminal.

## Architecture

```
cli.ts (Commander)
    ↓
startEmbeddedServer() → Server (embedded)
    ↓
JacquesClient (WebSocket) → App.tsx (Ink root)
    ↓
Menu Router → Views (Dashboard, Settings, LoadContext, Archive, etc.)
```

The CLI embeds the server automatically — no need to start it separately.

## Key Components

| File | Responsibility |
|------|----------------|
| `cli.ts` | CLI arg parsing, server startup, Ink app mount |
| `components/App.tsx` | Root component, menu routing, client init |
| `components/Dashboard.tsx` | Main view: session list, context meter |
| `components/SettingsView.tsx` | Auto-archive toggle, catalog extraction, browse handoffs |
| `components/LoadContextView.tsx` | Import context from external sources |
| `components/ObsidianBrowserView.tsx` | Obsidian vault file browser |
| `components/PlanViewerView.tsx` | Display plan content |

## Technical Details

- **Alternate screen buffer**: `\x1b[?1049h` (enter) / `\x1b[?1049l` (exit) — full-screen like vim
- **Anti-ghosting**: Terminal reset `\x1Bc` on resize clears artifacts
- **Responsive breakpoints**: Horizontal ≥60 chars, vertical <60 chars, version hidden <70 chars
- **Fixed viewport**: 10-row content area with scroll support
- **Border calculations**: All widths derived from `terminalWidth`
- **ANSI art**: Mascot converted from PNG using Jimp (`wrap="truncate-end"`)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `S` | Settings view |
| `c` | Generate handoff from transcript (fast, rule-based) |
| `h` | Copy handoff prompt for manual paste |
| `H` | Browse existing handoffs |
| `Q` / Ctrl+C | Quit (exits alternate screen, stops server) |

## Module Duplication

The CLI duplicates some core modules (`archive/`, `context/`, `sources/`) for TUI compatibility. These are thin wrappers that delegate to `@jacques/core`.

## Settings View

5 menu items:
1. Claude Code settings (auto-compact toggle)
2. Auto-Archive toggle
3. Extract Catalog
4. Re-extract All (force)
5. Browse handoffs
