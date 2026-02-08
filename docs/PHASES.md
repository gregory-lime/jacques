# Development Phases & Progress

## Completed Phases

**Phase 1**: Terminal Context Monitor
- Basic server/dashboard architecture
- Unix socket + WebSocket communication
- Session registry with focus detection

**Phase 2**: Multi-Source Adapter Architecture
- Adapter pattern for multiple AI tools
- Claude Code + Cursor support
- Unified installer (`hooks/install.py`)
- 30/30 unit tests passing

**Phase 3**: Real-Time Context Tracking
- Token estimation with tiktoken (fallback to char-based)
- Skill overhead detection (~34k tokens for 21 skills)
- Calibration system for improving estimates
- 61/61 tests passing

**Phase 4**: TUI Library Refactor (Ink)
- Migrated from ANSI escape codes to Ink/React
- Jacques Derrida mascot
- Component-based architecture

**Phase 6**: Manual Compact Workflow
- Auto-compact toggle functionality
- Handoff file generation
- Known bug #18264 handling (78% threshold despite autoCompact: false)

**Phase 7**: CLI Redesign (Hybrid Menu Interface)
- Simplified 5-button menu
- Save Context feature (JSONL → JSON transformation)
- Session detection and parsing
- Removed unused components (~32.6 KB dead code)

**Phase 8**: UI Polish & Professional Terminal Experience
- **Alternate screen buffer**: Full-screen mode like vim/htop (preserves terminal state on exit)
- **Anti-ghosting**: Hard reset (`\x1Bc`) on resize prevents artifacts
- **Responsive layout**: Horizontal down to 60 chars, vertical below; version hides at <70 chars
- **Fixed box height**: 10 rows consistent across all views
- **Scrollable sessions**: Arrow key navigation with overlay indicators
- **Perfect borders**: Mathematically correct width calculations for pixel-perfect alignment
- **Minimal spacing**: Single empty lines for breathing room
- **Soft coral palette**: #E67E52 accent color matching mascot

**Phase 9**: LoadContext Feature
- **External sources**: Load context from Obsidian vaults (Google Docs, Notion coming soon)
- **Auto-detection**: Finds Obsidian vaults from system config, manual path entry fallback
- **File browser**: Scrollable list of markdown files with relative paths and sizes
- **Context catalog**: Copies files to `.jacques/context/`, indexes in `.jacques/index.json`
- **78/78 unit tests**: Full test coverage for sources and context modules

**Phase 10**: Conversation Archive & Search
- **Cross-project search**: Keyword-indexed search over archived conversations
- **Dual save**: Save Context saves to both local project and global archive
- **MCP server**: `search_conversations` tool for Claude Code integration
- **CLI commands**: `jacques search`, `jacques archive-stats`
- **Settings view**: Configure auto-archive toggle, catalog extraction
- **Manifest extraction**: Title, user questions, files modified, technologies
- **Plan detection**: Automatically archives plans referenced in conversations
- **47/47 unit tests**: Full test coverage for archive module

**Phase 11**: Embedded Plan Extraction
- **Automatic detection**: Scans user messages for "Implement the following plan:" trigger patterns
- **Multi-plan support**: Handles multiple plans per session (split by markdown headings)
- **Content-based deduplication**: SHA-256 hashing + Jaccard similarity (90% threshold)
- **Bidirectional linking**: Plans ↔ Sessions via `.jacques/index.json`
- **Handoff integration**: Includes plan context in session handoffs
- **Module**: `core/src/archive/plan-extractor.ts` (433 lines)
- **37/37 unit tests**: Full coverage for detection, extraction, deduplication, and indexing

**Phase 12**: Catalog Extraction System
- **Pre-extraction**: Extracts expensive data from JSONL into per-project `.jacques/` for fast dashboard loading
- **Three categories**: Sessions (manifest JSON), Plans (markdown), Subagents (explore results + web search results as markdown)
- **Within-session plan dedup**: Groups embedded/agent/write detections into logical plans (write > embedded > agent priority)
- **Incremental extraction**: Compares JSONL mtime to skip unchanged sessions
- **Bulk extraction**: Scans all projects via `~/.claude/projects/`
- **HTTP API**: `POST /api/catalog/extract`, `GET /api/projects/:path/catalog`, `GET /api/projects/:path/subagents/:id/content`
- **Server catalog overlay**: Session API overlays deduplicated `planRefs` from catalog manifests onto session index cache
- **Module**: `core/src/catalog/` (extractor, bulk-extractor, types)
- **22 unit tests**: Full coverage for exploration, search, manifest, incremental, and index integration

## Pending Phases

**Phase 5**: Context Details Breakdown
- Show breakdown by category (messages, skills, system prompts, cache)
- Parse `transcript_path` for message-level analysis
- Capture cost and cache metrics from statusLine
- Plan validated and ready for implementation
