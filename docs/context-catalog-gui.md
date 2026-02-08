# Context Catalog GUI

Web-based interface for managing project context and chatting with Claude about your codebase.

## Overview

The Context Catalog GUI provides a three-panel interface for:
- **Browsing** context files, plans, and sessions per project
- **Chatting** with Claude about your project context
- **Managing** context files (add, edit, delete)

Access the GUI at `http://localhost:4243` when the Jacques server is running.

## Architecture

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [SIDEBAR 240px]  │  [CATALOG 240px]  │  [CHAT flex:1]         │
│                   │                    │                        │
│  • Dashboard      │  ▼ Files (3)       │  $ context assistant   │
│  • Archive        │    auth-flow.md    │                        │
│  • Context ←      │    api-notes.md    │  [chat messages]       │
│                   │                    │                        │
│  Sources          │  ▼ Plans (2)       │  [suggestions]         │
│  • Obsidian       │    phase-1.md      │                        │
│  • Google Docs    │                    │  > [input] [send]      │
│  • Notion         │  ▶ Sessions (5)    │                        │
│                   │                    │                        │
│  [Settings]       │  [+ New Context]   │                        │
└─────────────────────────────────────────────────────────────────┘
```

### Responsive Behavior

| Content Width | Behavior |
|---------------|----------|
| >= 800px | Full three-panel layout |
| < 800px | Catalog auto-collapses to 52px icon rail |

Both sidebar and catalog collapse states persist to `localStorage`.

## Components

### CatalogPanel (`gui/src/components/context/CatalogPanel.tsx`)

Left panel displaying project context organized into sections:

- **Files**: Context files from `.jacques/context/`
- **Plans**: Implementation plans from `.jacques/plans/`
- **Sessions**: Saved conversation sessions

Features:
- Search/filter across all items
- Collapsible sections with item counts
- Tree-style layout with subtle left border
- Prominent "New Context" button (coral accent)
- Monochrome design matching terminal aesthetic

### ChatPanel (`gui/src/components/context/ChatPanel.tsx`)

Main chat interface with Claude CLI integration:

- Real-time streaming via WebSocket
- Tool use display (badges showing which tools Claude used)
- Welcome state with keyboard hints
- Empty state: `$ select a project to continue`

### ChatInput (`gui/src/components/context/ChatInput.tsx`)

Terminal-style input with:
- Command prompt character (`>`)
- Monospace font (JetBrains Mono)
- Send/Stop button based on streaming state
- Enter to send, Shift+Enter for newline

### ChatMessage (`gui/src/components/context/ChatMessage.tsx`)

Message display:
- **User**: Subtle left border, "you" label
- **Assistant**: Coral accent border, bgSecondary background, tool badges

### SuggestionChips (`gui/src/components/context/SuggestionChips.tsx`)

Context-aware suggestions shown when chat is empty:
- "how do I add context files?" (empty catalog)
- "summarize {first-file}" (has files)
- "list implementation plans" (has plans)

## Backend

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects/:path/catalog` | Full catalog (files, plans, sessions) |
| GET | `/api/projects/:path/context/:id/content` | File content |
| POST | `/api/projects/:path/context` | Add context file |
| PUT | `/api/projects/:path/context/:id` | Update content |
| DELETE | `/api/projects/:path/context/:id` | Delete file |

### WebSocket Messages

**Client → Server:**
- `chat_send { projectPath, message }` - Send message to Claude
- `chat_abort { projectPath }` - Stop current generation

**Server → Client:**
- `chat_delta { projectPath, text }` - Streaming text chunk
- `chat_tool_event { projectPath, toolName }` - Tool use detected
- `chat_complete { projectPath, fullText, inputTokens, outputTokens }` - Generation complete
- `chat_error { projectPath, reason, message }` - Error occurred
- `catalog_updated { projectPath, action, itemId }` - Catalog changed

### ChatService (`server/src/services/chat-service.ts`)

Manages Claude CLI process lifecycle:
- Spawn with `--session-id` for isolation
- Multi-turn via `--resume`
- Stream stdout line-by-line
- Kill on abort/disconnect/timeout
- Clean up on server shutdown

## Design System

### Colors

```typescript
// From gui/src/styles/theme/colors.ts
bgPrimary: '#0d0d0d'      // Main background
bgSecondary: '#1a1a1a'    // Panel backgrounds
bgElevated: '#242424'     // Elevated elements
accent: '#E67E52'         // Coral accent (actions, active states)
textPrimary: '#f5f5f5'    // Primary text
textSecondary: '#a0a0a0'  // Secondary text
textMuted: '#666666'      // Muted text
borderSubtle: '#2a2a2a'   // Subtle borders
```

### Typography

- **Font**: JetBrains Mono (monospace)
- **Sizes**: 9px (labels), 11-12px (body), 13px (headers)
- **Weight**: 500-600 for emphasis

### Design Principles

1. **Monochrome**: No colors except coral accent for primary actions
2. **Terminal aesthetic**: Prompt characters, monospace font, subtle borders
3. **Minimal**: Clean spacing, no decorative elements
4. **Functional**: Every element serves a purpose

## Files

### New Files (Phase 12)

```
gui/src/components/context/
├── CatalogPanel.tsx      # Context catalog sidebar
├── ChatPanel.tsx         # Chat interface with streaming
├── ChatInput.tsx         # Terminal-style input
├── ChatMessage.tsx       # Message rendering
├── SuggestionChips.tsx   # Context-aware suggestions
└── index.ts              # Re-exports

server/src/services/
├── chat-service.ts       # Claude CLI process management
└── chat-system-prompt.ts # Dynamic system prompt builder
```

### Modified Files

- `gui/src/components/Layout.tsx` - Collapsible sidebar, nav item rename to "Context"
- `gui/src/pages/Context.tsx` - Three-panel orchestrator
- `gui/src/hooks/useJacquesClient.ts` - Chat WS methods and callbacks
- `gui/src/types.ts` - Chat message types
- `server/src/http-api.ts` - Catalog CRUD endpoints
- `server/src/websocket.ts` - Chat message routing
- `server/src/types.ts` - Server-side chat types

## Usage

1. Start the Jacques server: `npm run start:server`
2. Open `http://localhost:4243` in a browser
3. Select a project from the sidebar
4. Navigate to "Context" page
5. Browse catalog items or chat with Claude about your context

## Development

```bash
# Build GUI
cd gui && npm run build

# Dev mode (with hot reload)
cd gui && npm run dev

# Run with server
npm run start:server  # Serves GUI at :4243
```
