# Web GUI (`@jacques/gui`)

Browser-based session monitoring and management. Built with React 18 + Vite + React Router. Connects to the server via HTTP API (4243) and WebSocket (4242).

**Build**: `cd gui && npm run build` (tsc + vite build)
**Dev**: `cd gui && npm run dev`
**Test**: `cd gui && npm run test` (vitest)

The GUI does **not** depend on `@jacques/core` or `@jacques/server` directly — it uses the HTTP API instead.

## Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | Dashboard | Session overview, context meter |
| `/archive` | Archive | Search archived conversations |
| `/context` | Context | Manage `.jacques/` context files |
| `/settings` | Settings | Toggle options, sync sessions |
| `/sources` | Sources | Configure external sources |
| `/sources/google` | GoogleDocsConnect | Google OAuth callback |
| `/sources/notion` | NotionConnect | Notion OAuth callback |

## Architecture

```
main.tsx → App.tsx (BrowserRouter)
    ↓
Routes → Pages → Components
    ↓
api/config.ts → HTTP API (localhost:4243)
hooks/ → React hooks for state management
```

**Context Providers**: ProjectScope (active project), OpenSessions (session tabs)

## Key Components

### Pages (`gui/src/pages/`)
- `Dashboard.tsx` — Session list, context meter, active session viewer. Uses separate loading states: active sessions render immediately from WebSocket data (never gated by loading), while session history uses `historyLoading` to show skeletons during the HTTP fetch.
- `Archive.tsx` — Search conversations, view manifests
- `Settings.tsx` — Sync (Sync New / Re-sync All), "Dangerously Skip Permissions" toggle, notifications
- `Sources.tsx` — Source connection status, configuration

### Conversation Viewer (`gui/src/components/Conversation/`)
- `ConversationViewer.tsx` — Full session transcript rendering
- `PlanNavigator.tsx` — Sidebar: plans in a session (uses backend planRefs when available)
- `PlanViewer.tsx` — Modal: loads plan content (catalog endpoint first, messageIndex fallback)

### UI Components
- `ContentModal.tsx` — Reusable modal container
- `NotificationCenter.tsx` — Toast notifications
- `ContextMeter.tsx` — Visual context usage meter
- `ProjectSelector.tsx` — Project dropdown (uses `GET /api/projects` for discovered projects grouped by git repo root; falls back to WebSocket sessions pre-sync; "+" button to launch sessions; "x" button to hide projects from the list)
- `SessionList.tsx` / `SessionCard.tsx` — Session browsing
- `RemoveWorktreeModal.tsx` — Worktree management modal (list, status, remove)
- `WindowToolbar.tsx` — Top toolbar (Maximize, Tile, Focus, GitFork manage worktrees)

## API Client (`gui/src/api/config.ts`)

Wraps HTTP calls to the server REST API.

**Base URL**: `http://localhost:4243/api` (dev) or `/api` (production, served by server)

Key functions: `getSourcesStatus()`, `configureGoogleDocs()`, `configureNotion()`

All session data, archive search, and catalog operations go through the HTTP API — the GUI never reads JSONL files directly.

## Plan Loading Flow

```
PlanNavigator
  ├─ Has backend planRefs? → Use directly (has catalogId for content loading)
  └─ No planRefs? → Fallback: detectPlansFromMessages() (title-based dedup)

PlanViewer
  ├─ Has catalogId? → GET /api/projects/:path/plans/:id/content
  └─ No catalogId? → GET /api/sessions/:id/plans/:messageIndex
  └─ Task Progress → GET /api/sessions/:id/tasks (summary + task list)
```

## Plan Progress Display

Dashboard shows task progress for plans:
- **Loading**: Spinner while fetching task data
- **In Progress**: `X/Y` format (e.g., "5/7")
- **Complete**: Green checkmark + `X/X`
- **No Tasks**: Nothing shown (session didn't use TaskCreate/TaskUpdate)

When multiple sessions have the same plan title, the Dashboard finds the session with actual tasks for accurate progress display.

## Hooks (`gui/src/hooks/`)

| Hook | Purpose |
|------|---------|
| `usePersistedState` | Type-safe localStorage with cross-tab sync |
| `useProjectScope` | Select active project (persisted) |
| `useOpenSessions` | Track open session tabs (persisted) |
| `useSessionDetails` | Fetch single session details |
| `useNotifications` | Manage toast notifications (persisted) |
| `useJacquesClient` | WebSocket client — live sessions, worktree ops, terminal launch |
| `useAuth` | OAuth token management |

### Persisted State Keys

All UI preferences persist to localStorage with the `jacques:` prefix:

| Key | Type | Used By |
|-----|------|---------|
| `selectedProject` | `string \| null` | `useProjectScope` |
| `sidebarCollapsed` | `boolean` | `Layout` |
| `showLogs` | `boolean` | `Layout` |
| `logPanelHeight` | `number` | `MultiLogPanel` |
| `catalogCollapsed` | `boolean` | `Context` |
| `dangerouslySkipPermissions` | `boolean` | `Settings`, `Dashboard` |

## Static File Serving

In production, the server serves `gui/dist/` at port 4243. The dashboard auto-rebuilds GUI if sources are newer than dist (`cli.ts` checks timestamps).
