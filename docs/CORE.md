# Core Package (`@jacques/core`)

Shared business logic used by server, CLI, and GUI. Must be built first — server and CLI depend on its compiled `.d.ts` files.

**Build**: `cd core && npx tsc`
**Test**: `cd core && npm test`
**Exports**: 10 submodules via `package.json` exports map

## Module Map

| Module | Import Path | Responsibility |
|--------|-------------|----------------|
| Session | `@jacques/core/session` | JSONL parsing, filtering, token estimation |
| Archive | `@jacques/core/archive` | Cross-project search, plan extraction/dedup |
| Context | `@jacques/core/context` | `.jacques/index.json` CRUD, project knowledge |
| Catalog | `@jacques/core` | Pre-extract JSONL → `.jacques/` manifests |
| Sources | `@jacques/core/sources` | External adapters (Obsidian, Google Docs, Notion) |
| Storage | `@jacques/core/storage` | Save context (JSONL → JSON transformation) |
| Client | `@jacques/core/client` | WebSocket client (`JacquesClient`) |
| Handoff | `@jacques/core/handoff` | Session handoff generation |
| Utils | `@jacques/core/utils` | Settings, Claude token management |
| Cache | `@jacques/core/cache` | Session indexing, project discovery, mode detection |
| Logging | `core/src/logging/` | Structured logging, error classification (internal) |
| Project | `core/src/project/` | Aggregation for CLI |

## Session Module (`core/src/session/`)

Parses Claude Code JSONL transcripts. See `docs/JSONL-FORMAT.md` for the JSONL schema.

- `detector.ts` — Find sessions, list subagent files, encode/decode project paths
- `parser.ts` — Parse JSONL entries, categorize by type, estimate output tokens via tiktoken
- `transformer.ts` — Convert JSONL to SavedContext format
- `filters.ts` — Filter entries by type (messages, tools, thinking)
- `token-estimator.ts` — Token counting with tiktoken `cl100k_base`

## Archive Module (`core/src/archive/`)

Cross-project conversation search and plan management.

- `manifest-extractor.ts` — Extract metadata from sessions (title, files, technologies)
- `plan-extractor.ts` — Detect embedded plans via trigger phrases ("Implement the following plan:")
- `plan-cataloger.ts` — Cross-session dedup: SHA-256 exact match + Jaccard 75% fuzzy match
- `filename-utils.ts` — Shared slug/filename generation (`slugify`, `generatePlanFilename`, `generateArchivePlanFilename`, `generateVersionedFilename`)
- `search-indexer.ts` — Tokenize and build keyword inverted index
- `archive-store.ts` — Read/write `~/.jacques/archive/` (manifests, conversations, plans)
- `bulk-archive.ts` — Scan `~/.claude/projects/` and archive all sessions

**Storage**: `~/.jacques/archive/` (index.json, manifests/, conversations/, plans/)

## Context Module (`core/src/context/`)

Manages per-project `.jacques/index.json` (ProjectIndex v2.0.0).

- `types.ts` — Schema: context entries, session entries, plan entries, subagent entries
- `indexer.ts` — CRUD for index.json, v2 migration (adds `subagents: []`)
- `manager.ts` — File operations (copy to `.jacques/context/`, delete, estimate tokens)

**SubagentEntry.type**: `'exploration'` (Explore agent) or `'search'` (web search)

## Catalog Module (`core/src/catalog/`)

Pre-extracts expensive data from JSONL into per-project `.jacques/` for fast loading.

- `extractor.ts` — Single-session extraction: manifest + plan grouping + subagent extraction
- `bulk-extractor.ts` — All sessions for one project or across all projects
- `types.ts` — SessionManifest schema, extraction options

**Within-session plan dedup**: Groups embedded/agent/write detections into logical plans. Priority: write > embedded > agent. Merges sources, filePath, agentId, catalogId into the winner.

**Incremental**: Compares JSONL mtime against manifest `jsonlModifiedAt`. Use `force: true` to re-extract.

**Output**: `.jacques/sessions/{id}.json` (manifest), `.jacques/plans/`, `.jacques/subagents/`

## Sources Module (`core/src/sources/`)

External context adapters for importing documentation into projects.

- `config.ts` — Load/save `~/.jacques/config.json`
- `obsidian.ts` — Vault detection, file listing, tree building
- `googledocs.ts` — OAuth flow, Drive listing, export-to-markdown
- `notion.ts` — OAuth flow, page search, content fetching

## Logging Module (`core/src/logging/`)

Structured error handling and logging for core modules. Replaces scattered `console.error`/`console.warn` calls with a consistent, silent-by-default logger.

- `logger.ts` — `Logger` interface and `createLogger()` factory. Silent by default; callers opt into output via `silent: false`.
- `error-utils.ts` — Safe error classification: `isNotFoundError()` (ENOENT), `isPermissionError()` (EACCES/EPERM), `getErrorMessage()` (safe extraction from unknown).
- `claude-operations.ts` — `ClaudeOperationLogger` for debugging Claude Code CLI interactions.
- `index.ts` — Barrel re-export.

**Error classification rules:**

| Pattern | Action | Example |
|---------|--------|---------|
| ENOENT on optional file | Stay silent | Hidden projects file doesn't exist yet |
| JSON parse failure | `logger.warn()` | Corrupt index.json, malformed JSONL line |
| Permission error | `logger.warn()` | Can't read project directory |
| Unexpected error in critical path | `logger.error()` | `extractSessionMetadata` crashes |
| Git command fail on non-git dir | Stay silent | Expected when walking parent dirs |
| File disappeared between readdir/stat | Stay silent | Race condition, not a bug |

**Modules using structured logging:** `cache/persistence.ts`, `cache/git-utils.ts`, `cache/metadata-extractor.ts`, `cache/hidden-projects.ts`, `session/parser.ts`, `session/detector.ts`, `session/token-estimator.ts`.

## Handoff Module (`core/src/handoff/`)

Session handoff generation for continuing work across sessions.

- `generator.ts` — Extract from transcript (files modified, tools used, recent messages)
- `catalog.ts` — List, read, store handoff files in `.jacques/handoffs/`
- `prompts.ts` — Handoff prompt templates

**Output**: `.jacques/handoffs/{timestamp}-handoff.md`

## Plan Identity System

Plans undergo two-level deduplication:

**Within-session** (`catalog/extractor.ts`): Sort planRefs by messageIndex → `embedded` starts group → `agent`/`write` join → pick best (write > embedded > agent) → merge metadata.

**Cross-session** (`archive/plan-cataloger.ts`): SHA-256 hash → exact match. Same title + 90% Jaccard → fuzzy match. Result: `PlanEntry.sessions[]` tracks all sessions.

**Three detection sources**:
| Source | Trigger | Location |
|--------|---------|----------|
| `embedded` | User pastes plan with trigger phrase | User message in JSONL |
| `agent` | Plan subagent generates plan | Subagent JSONL |
| `write` | Claude writes plan to `.md` file | File on disk |

## Plan Progress Module (`core/src/plan/`)

Tracks task completion within sessions for plan progress display.

- `types.ts` — TaskSignal, TaskStatus, ProgressItem interfaces
- `plan-parser.ts` — Parse markdown plan structure into PlanItem tree (headings, numbered, bullet, checkbox)
- `task-extractor.ts` — Extract TaskSignals from JSONL (TaskCreate, TaskUpdate, TaskList, TodoWrite, agent_progress, bash_progress, file heuristic)
- `progress-matcher.ts` — Match signals to plan items via 5 strategies (exact text, keyword overlap, identifier, file path, substring) with source confidence multipliers and parent-child propagation
- `progress-computer.ts` — Orchestrate full progress computation with caching (`~/.jacques/cache/plan-progress/`)

**Task Sources** (with confidence multipliers):
| Source | Tool/Detection | Multiplier |
|--------|---------------|------------|
| `task_create` | TaskCreate | 1.0 |
| `task_update` | TaskUpdate | 1.0 |
| `task_list` | TaskList results | 1.0 |
| `todo_write` | TodoWrite (legacy) | 1.0 |
| `agent_progress` | Subagent assistant messages | 0.7 |
| `file_heuristic` | Write/Edit file paths | 0.6 |
| `bash_progress` | Test/build/deploy output | 0.5 |

**Matching strategies** (tried in order, best confidence wins):
1. Exact text match (normalized)
2. Keyword overlap (Jaccard similarity >= 0.3)
3. Identifier match (CamelCase >= 5 chars, hyphenated, file names)
4. File path match (basename in item text)
5. Substring match (2-4 word phrase >= 8 chars)

**Test coverage**: All 4 modules have comprehensive tests (plan-parser: 50, task-extractor: 56, progress-matcher: 39, progress-computer: 13).

**API Endpoint**: `GET /api/sessions/:id/tasks` returns extracted tasks with summary (total, completed, percentage).

**GUI Display**: GUI shows task count as `X/Y` format with checkmark when all complete. PlanViewer shows collapsible task list.

## Cache Module (`core/src/cache/`)

Lightweight session indexing for fast startup and GUI loading. Uses a **two-phase catalog-first strategy**:

1. **Fast path**: Read `.jacques/index.json` (pre-extracted catalog metadata)
2. **Slow path**: Parse JSONL only for uncataloged/stale sessions

Split into 7 focused submodules (previously a single 1,390-line `session-index.ts`):

| File | Responsibility |
|------|----------------|
| `types.ts` | Interfaces (`SessionEntry`, `SessionIndex`, `DiscoveredProject`, `PlanRef`, etc.), constants, `getDefaultSessionIndex()` |
| `persistence.ts` | Index file I/O (`readSessionIndex`, `writeSessionIndex`), `getSessionIndex()` with build deduplication |
| `metadata-extractor.ts` | JSONL → `SessionEntry` conversion, `buildSessionIndex()`, `listAllProjects()`, catalog-first loading |
| `mode-detector.ts` | `detectModeAndPlans()` — planning vs execution mode, plan reference extraction |
| `project-discovery.ts` | `discoverProjects()`, `getSessionEntry()`, `getSessionsByProject()`, `getIndexStats()` |
| `git-utils.ts` | `detectGitInfo()` (filesystem), `readGitBranchFromJsonl()` (JSONL fallback) |
| `hidden-projects.ts` | `getHiddenProjects()`, `hideProject()`, `unhideProject()` |
| `index.ts` | Barrel re-export — all public API flows through this |

**Key functions:**
- `getSessionIndex(options)` — Get all sessions with caching (default 5-min freshness). Deduplicates concurrent calls: if multiple callers trigger a rebuild simultaneously (e.g., `/api/sessions/by-project` and `/api/projects` on first GUI load), only one `buildSessionIndex()` runs and all callers share the result.
- `buildSessionIndex()` — Rebuild index from all projects
- `getSessionEntry(id)` — Single session lookup by ID
- `getSessionsByProject()` — Group sessions by git repo root
- `discoverProjects()` — Discover all projects from `~/.claude/projects/`, grouped by git repo root. Merges git worktrees into single project entries. Recovers `gitBranch` from JSONL for deleted worktrees and merges them into matching git projects. Filters hidden projects (`~/.jacques/hidden-projects.json`). Returns `DiscoveredProject[]` with name, gitRepoRoot, projectPaths, sessionCount, lastActivity.
- `hideProject(name)` / `unhideProject(name)` — Manage the hidden projects list.
- `detectModeAndPlans(entries)` — Detect planning vs execution mode

**SessionEntry contains:**
- `id`, `title`, `startedAt`, `endedAt`
- `gitBranch`, `gitWorktree`, `gitRepoRoot`
- `tokens.input`, `tokens.output` (total usage)
- `messageCount`, `toolCallCount`
- `planCount`, `planRefs`, `subagentIds`
- `mode` — 'planning' or 'execution'

**Used by:**
- `server/src/process-scanner.ts` — Startup session metadata (title, git, tokens)
- CLI TUI — Session list and filtering
- Plan progress display — Task extraction

**Additional features:**
- Filters out internal agents (auto-compact, prompt_suggestion) from counts
- Sets `hadAutoCompact: true` flag when auto-compact agent detected
- Circular dependency between `persistence.ts` and `metadata-extractor.ts` resolved via dynamic `import()`
