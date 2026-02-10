# Competitive Analysis: Jacques vs Claude-Workspace vs Continue

Research into two open-source projects that interact with AI coding assistants, compared against Jacques' current architecture. Goal: find inspiration, identify improvements, and understand what they do better.

**Date**: February 2026
**Repos analyzed**:
- [Claude-Workspace/claude-ws](https://github.com/Claude-Workspace/claude-ws) — Web IDE wrapping Claude Code via Agent SDK
- [continuedev/continue](https://github.com/continuedev/continue) — Open-source AI coding assistant (31.3k stars)

---

## Table of Contents

- [Comparison Overview](#comparison-overview)
- [Claude-Workspace (claude-ws)](#claude-workspace-claude-ws)
- [Continue](#continue)
- [Jacques — Current State](#jacques--current-state)
- [Ideas & Improvements](#ideas--improvements)
- [Deep Dive: Claude Agent SDK](#deep-dive-claude-agent-sdk)
- [What They Do Better](#what-they-do-better)
- [What Jacques Does Better](#what-jacques-does-better)
- [Recommended Priority](#recommended-priority)

---

## Comparison Overview

| Aspect | Jacques | claude-ws | Continue |
|--------|---------|-----------|----------|
| **Integration method** | Passive observation (hooks + JSONL parsing) | Active control via Claude Agent SDK | LLM abstraction layer (40+ providers) |
| **Real-time data** | statusLine hook (every few seconds) | SDK streaming (Socket.io, real-time) | Direct API streaming |
| **Session control** | None (monitor only) | Full (launch, pause, checkpoint, rewind) | Full (chat, edit, agent, plan modes) |
| **Token accuracy** | Inaccurate output tokens (must estimate via tiktoken) | Accurate (SDK provides real counts) | Accurate (direct API) |
| **Architecture** | Hooks → Server → CLI/GUI | Next.js + SDK + SQLite | IDE Extension + Core + Storage |
| **Tech stack** | Node.js, TypeScript, Ink/React, Vite | Next.js 16, React 19, Drizzle ORM, Socket.io | TypeScript, React, Redux, LanceDB |
| **Stars** | — | — | 31.3k |

**Key insight**: Jacques is the only one that's purely observational. Both claude-ws and Continue can _control_ sessions, not just watch them.

---

## Claude-Workspace (claude-ws)

### What It Is

A visual web-based IDE and project management interface for Claude Code. Transforms the CLI experience into a full-featured development environment with task management, real-time streaming, and integrated development tools.

### Tech Stack

Next.js 16, React 19, SQLite + Drizzle ORM, Socket.io, Tailwind CSS 4, Radix UI, Zustand

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Web UI (React/Next.js)                │
│  - Kanban Board, Code Editor, Git Panel, File Browser   │
└─────────────────────────┬───────────────────────────────┘
                          │ Socket.io + HTTP REST
┌─────────────────────────┴───────────────────────────────┐
│              Node.js Server (server.ts)                  │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Core Managers                                    │    │
│  │ - AgentManager (SDK orchestration, singleton)   │    │
│  │ - SessionManager (conversation continuity)      │    │
│  │ - CheckpointManager (state snapshots)           │    │
│  │ - ShellManager (background processes)           │    │
│  │ - WorkflowTracker (subagent monitoring)         │    │
│  │ - InlineEditManager (AI code suggestions)       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Database (SQLite + Drizzle ORM)                 │    │
│  │ projects → tasks → attempts → attempt_logs      │    │
│  │ checkpoints, shells, agent_factory_plugins      │    │
│  └─────────────────────────────────────────────────┘    │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────┐
│        @anthropic-ai/claude-agent-sdk (v0.2.29)         │
│        Spawns Claude Code CLI as subprocess              │
└─────────────────────────────────────────────────────────┘
```

### How It Connects to Claude Code

**Primary**: Uses `@anthropic-ai/claude-agent-sdk` (v0.2.29). The `AgentManager` singleton orchestrates SDK `query()` calls, intercepts tool calls (`AskUserQuestion`, `Bash`, `Task`), manages streaming output, and handles checkpointing.

**CLI detection**: Searches for Claude CLI in priority order:
1. `CLAUDE_PATH` environment variable
2. Common paths: `~/.local/bin/claude`, `/usr/local/bin/claude`, `/opt/homebrew/bin/claude`

**Session files**: Reads JSONL from `~/.claude/projects/{project}/`, tracks session IDs in database linked to attempts and tasks.

**Authentication priority chain**:
1. `~/.claude/settings.json` (`env.ANTHROPIC_AUTH_TOKEN`) — highest priority
2. Project `.env` (`ANTHROPIC_AUTH_TOKEN` or `API_KEY`)
3. `~/.claude.json` (`primaryApiKey`)
4. `~/.claude/.credentials.json` (OAuth — **blocked for third-party as of Jan 2026**)

### Key Features

**Task Management**:
- Kanban board with drag-and-drop (todo/in_progress/done)
- Multiple attempts per task with auto-resume from last valid session
- Task search/filter by status, project, keywords

**Checkpoint System** (dual-state):
- **Conversation state**: Captured via SDK's `checkpointUuid` (first user message UUID)
- **File system state**: SDK's `rewindFiles()` restores files to checkpoint
- Database stores checkpoints with session ID and SDK checkpoint UUID
- Rewind flow: truncate conversation → set rewind IDs → restore files → resume

**Session Corruption Auto-Fix**:
1. Validate session file exists and is non-empty
2. Check for valid JSON structure
3. Scan for API errors at end of file
4. If corrupted: rewind to last good assistant message
5. If invalid: don't resume, start fresh
6. On failed attempt: clear `session_id` in database

**Socket.io Room-Based Architecture**:
- Each task/shell/session gets dedicated room (`attempt:{id}`, `shell:{id}`)
- Clients subscribe via events, prevents message leaking
- Event categories: lifecycle (`attempt:*`), streaming (`output:*`), questions (`question:*`), background (`shell:*`, `inline-edit:*`)

**Workflow Tracker** (subagents):
- Intercepts `Task` tool calls via `canUseTool` callback
- Tracks `SubagentNode` status: in_progress → completed/failed
- Emits `subagent-start/end` and `workflow-update` events
- Enables subagent execution visualization in UI

**Other Features**:
- Code editor: Tabbed CodeMirror with 20+ language support
- Inline AI editing: Ctrl/Cmd+I for suggestions with live diff preview (uses Sonnet for speed)
- Git integration: status, staging, commits, diffs, visual graph, AI-generated commit messages
- File browser with upload, download, archive extraction
- Agent Factory: plugin system scanning `~/.claude/skills`, `~/.claude/commands`
- MCP config merging from 3 tiers (global → per-project CLI → project `.mcp.json`)
- Background shell management: spawns detached processes, tracks PIDs, streams output

### Anthropic Proxy Pattern

claude-ws wraps `process.env` with a JavaScript `Proxy` to intercept writes to `ANTHROPIC_BASE_URL`, routing all API calls through a local proxy. This enables request monitoring, logging, and debugging. Original URL saved to `ANTHROPIC_PROXIED_BASE_URL`.

---

## Continue

### What It Is

An open-source AI coding assistant platform (31.3k stars, 450+ contributors) providing IDE extensions for VS Code and JetBrains, a CLI with TUI, and a cloud platform (Mission Control). Built primarily in TypeScript (84%) with Kotlin and Python.

### Architecture

```
┌─────────────────────────────────────────┐
│         IDE Extensions Layer            │
│  (VS Code / JetBrains with React GUI)   │
└────────────┬────────────────────────────┘
             │ Strongly-Typed Message Protocol
┌────────────┴────────────────────────────┐
│         Core Orchestrator               │
│  (TypeScript - Session/Context/LLM)     │
└────────────┬────────────────────────────┘
             │ Storage & Indexing
┌────────────┴────────────────────────────┐
│         Storage Layer                   │
│   (LanceDB, SQLite, File System)        │
└─────────────────────────────────────────┘
```

### Strongly-Typed Message Protocol

Four TypeScript interfaces define all message contracts:
- `ToCoreProtocol` — Requests Core can handle
- `FromCoreProtocol` — Notifications Core can send
- `ToIdeFromWebviewProtocol` — GUI → IDE requests
- `ToWebviewFromIdeProtocol` — IDE → GUI messages

Pass-through system (`WEBVIEW_TO_CORE_PASS_THROUGH`, `CORE_TO_WEBVIEW_PASS_THROUGH`) auto-forwards common messages without custom handling.

### IDE Integration

**VS Code**: `VsCodeMessenger` routes between webview, Core, and VS Code APIs. `InProcessMessenger` for Core communication. GUI rendered by `ContinueGUIWebviewViewProvider`.

**IntelliJ**: Core runs as a **separate Node.js binary**, communicates via **stdin/stdout** (TCP for debugging). Can connect to VS Code-launched Core binary for cross-IDE debugging. GUI embedded via JCEF.

### Context Provider Plugin System

Modular `IContextProvider` interface for gathering context from different sources:

| Provider | Description |
|----------|-------------|
| `@File` | Reference any workspace file |
| `@Codebase` | Semantic search via embeddings |
| `@Terminal` | Last command and output |
| `@Http` | Custom HTTP server context |
| `@MCP` | Model Context Protocol resources |
| `@Docs` | Documentation sites |

Providers are configured in `config.yaml` under `contextProviders`, loaded dynamically by `ConfigHandler`.

### Codebase Indexing

`CodebaseIndexer` class manages local semantic indexing:

- **LanceDB** for vector storage
- **transformers.js** for local embeddings (`all-MiniLM-L6-v2` model — no API calls needed)
- **SQLite** for metadata (cache keys, file paths)
- 10+ embeddings providers: Voyage AI, Ollama, HuggingFace TEI, OpenAI, Cohere, etc.
- Process: config loading → provider selection → file walking → batch processing → progress reporting

### Operation Modes

| Mode | Description | Tool Access |
|------|-------------|-------------|
| **Chat** | Interactive analysis, no file modifications | Read-only |
| **Edit** | Quick targeted modifications in current file | Current file |
| **Agent** | Autonomous multi-step tasks | Full |
| **Plan** | Read-only exploration and planning | Read-only |
| **Autocomplete** | Single/multi-line predictions with "Next Edit" | N/A |

### Tool Permission System

Three-tier model configured in `~/.continue/permissions.yaml`:
- **allow** — Automatic execution
- **ask** — User approval required
- **exclude** — Tool unavailable

Default: allow read-only, ask for writes/terminal.

### Session Management

- `SessionManager` singleton holds current session in memory
- Each session saved as JSON: `[sessionId].json` in sessions folder
- Index file `sessions.json` stores metadata
- `ChatHistoryService` is single source of truth for chat history
- `compactConversation()` summarizes older parts to reduce token count

### Configuration System

- Primary format: `config.yaml` (stored in `~/.continue/config.yaml`)
- YAML blocks: `models`, `context`, `rules`, `docs`, `prompts`, `mcpServers`, `data`
- Local blocks in `.continue/models`, `.continue/rules`, etc.
- Hub blocks from community via `uses` syntax (`owner/item-name`)
- Composition via `unrollAssistant()` + `mergeUnrolledAssistants()`
- Validation with Zod schemas
- Remote configs from team server/Continue Hub

### LLM Abstraction

All providers implement `ILLM` interface → `BaseLLM` abstract class → provider-specific extensions. Supports 40+ LLM providers including Anthropic (Claude), OpenAI, Google Gemini, Ollama, etc. Automatic capability detection (image support, tool use, reasoning).

---

## Jacques — Current State

### How Jacques Connects to Claude Code

Jacques uses **three independent detection mechanisms**:

**1. Hook-Based Registration (primary, real-time)**:
- `SessionStart` → registers session with terminal identity
- `PostToolUse` → tracks tool usage, activity timestamp
- `PreToolUse` → detects user approval waiting
- `Stop` → marks idle
- `SessionEnd` → unregisters, triggers catalog extraction
- `statusLine` → sends real-time context metrics every few seconds

**2. Process Scanning (startup discovery)**:
- `pgrep -x claude` → `ps` (TTY) → `lsof` (CWD) on macOS/Linux
- PowerShell on Windows
- Matches processes to JSONL files by CWD and recency
- Registers as `DISCOVERED:` sessions

**3. Auto-Registration (statusLine first)**:
- Handles timing race when `statusLine` fires before `SessionStart`
- Creates temporary `AUTO:session-uuid` key, upgrades on `SessionStart`

### Data Jacques Can Access

**Real-time** (hooks + statusLine):
- Context metrics: used/remaining %, total input/output tokens, context window size
- Session metadata: ID, model, CWD, project, transcript path
- Terminal identity: type, session ID, TTY, PID
- Activity: last timestamp, tool name, status (active/working/idle/awaiting)
- Git info: branch, worktree, repo root
- Permission mode: plan/acceptEdits/default (updates real-time on Shift+Tab)
- Auto-compact settings
- Bypass flag (`--dangerously-skip-permissions`)

**Historical** (JSONL parsing):
- Full conversation content (user, assistant, thinking, tool use)
- Token usage (input accurate, output inaccurate — always 1-9 tokens)
- Session titles (3-tier priority: sessions-index → JSONL summary → first user message)
- Plans (markdown with task lists, progress tracking)
- Subagent transcripts
- Web searches, MCP tool executions, bash output, file operations

### Current Limitations

1. **Inaccurate output tokens** — must estimate via tiktoken
2. **No direct API access** — all data from hooks or JSONL parsing
3. **No session control** — observe only, cannot launch/pause/rewind
4. **Bypass mode detection issues** — always reports `permission_mode: "acceptEdits"`
5. **Platform-limited features** — focus tracking macOS only (AppleScript)
6. **Process detection gaps** — `pgrep` doesn't find all Claude processes
7. **Auto-compact bug** — even disabled, Claude compacts at ~78%
8. **Hook timing races** — `statusLine` before `SessionStart`, concurrent sessions
9. **Stale session cleanup** — relies on 30s process verification interval
10. **JSONL-only access** — no in-memory state, pending requests, or queue

---

## Ideas & Improvements

### 1. Claude Agent SDK Integration (from claude-ws) — PARADIGM SHIFT

**What they do**: claude-ws uses `@anthropic-ai/claude-agent-sdk` to launch, stream, checkpoint, and rewind sessions. SDK provides: `query()` for streaming, `canUseTool` for interception, `rewindFiles()` for checkpoints, accurate `modelUsage` counts.

**What this means for Jacques**: Instead of just monitoring, Jacques could _orchestrate_ sessions:
- Launch sessions with specific prompts (extend terminal launcher)
- Get real-time streaming conversation data (not periodic statusLine)
- Intercept tool calls (security monitoring)
- Implement checkpoint/rewind
- Get accurate token counts

**Trade-off**: Major architectural addition. Jacques' strength is being lightweight. SDK sessions would be a separate "managed" mode alongside hook-based monitoring.

**See [Deep Dive: Claude Agent SDK](#deep-dive-claude-agent-sdk) for authentication and billing details.**

### 2. Vector-Based Archive Search (from Continue)

**What they do**: LanceDB + transformers.js (`all-MiniLM-L6-v2`) for semantic search. Local embeddings, no API calls, 10+ providers, SQLite for metadata.

**What this means for Jacques**: Semantic archive search:
- "When did I work on authentication?" (finds sessions even without the word "auth")
- "Show me sessions where I debugged memory issues" (semantic match)
- Local embeddings via transformers.js — no API cost

**Trade-off**: Adds LanceDB + model dependency. Storage overhead. But huge quality improvement for users with hundreds of sessions.

### 3. Context Provider Plugin System (from Continue)

**What they do**: `IContextProvider` interface with dynamic loading. Built-in: `@File`, `@Codebase`, `@Terminal`, `@Http`, `@MCP`.

**What this means for Jacques**: Formalize the existing "sources" concept (Obsidian adapter) into a plugin system:
- Jira/Linear issues
- Notion pages, Slack threads
- Custom HTTP endpoints
- Any MCP resource
- Auto-inject into handoffs or context indexes

### 4. Session Corruption Detection & Auto-Fix (from claude-ws)

**What they do**: `SessionManager` validates JSONL and auto-fixes: check exists → validate JSON → scan for API errors → rewind to last good message → clear failed sessions.

**What this means for Jacques**: During catalog extraction, malformed JSONL files (Ctrl+C kills, race conditions) could be:
- Detected (truncated/corrupted entries)
- Skipped gracefully instead of failing
- Reported to user in GUI
- Significantly improves archive reliability

### 5. Room-Based WebSocket Architecture (from claude-ws)

**What they do**: Socket.io rooms per task/shell/session. Clients subscribe to specific rooms. Prevents message leaking.

**What this means for Jacques**: Currently broadcasts all updates over single WebSocket. With rooms:
- GUI subscribes to only displayed sessions
- CLI gets updates for focused session only
- Reduced bandwidth for multi-session monitoring
- Enables per-session streaming with SDK

### 6. Workflow/Subagent Visualization (from claude-ws)

**What they do**: `WorkflowTracker` intercepts `Task` tool calls, tracks `SubagentNode` status, emits real-time events for visual subagent tree.

**What this means for Jacques**: Already extracts subagent data for archive. Real-time visualization could show:
- Live subagent tree as Claude spawns agents
- Running vs. completed status
- Time per subagent
- Richer than current GUI plans page

### 7. Anthropic Proxy Pattern for Accurate Tokens (from claude-ws)

**What they do**: Wrap `process.env` with Proxy to intercept `ANTHROPIC_BASE_URL`, route API calls through local proxy.

**What this means for Jacques**: Solve the #1 data accuracy problem — exact token counts from API responses. No more tiktoken estimation.

**Trade-off**: Requires modifying Claude Code's environment. More invasive. Could break on updates.

### 8. Multi-Mode Awareness (from Continue)

**What they do**: Distinct modes (chat/edit/agent/plan/autocomplete) with different tool access, UI, and behavior.

**What this means for Jacques**: Already detects `permission_mode`. Could:
- Show different monitoring dashboards per mode
- Track mode transitions over time
- Suggest mode switches based on context usage
- Display mode-specific metrics

### 9. Configuration Composition (from both)

**What they do**:
- claude-ws: Three-tier priority (settings.json → .env → .claude.json → OAuth)
- Continue: YAML blocks with local/remote merging, hub blocks, Zod validation

**What this means for Jacques**: Structured config system:
- Global: `~/.jacques/config.yaml`
- Per-project: `.jacques/config.yaml`
- Clear priority chain with validation
- Shareable between team members

### 10. Smart Handoff Summaries (from Continue)

**What they do**: `compactConversation()` summarizes older conversation parts, preserving key decisions while reducing tokens.

**What this means for Jacques**: Smarter handoffs:
- AI-powered summarization (not just extraction)
- Automatic importance ranking
- Context-aware compression
- Progressive detail (summary + expandable sections)

---

## Deep Dive: Claude Agent SDK

### What It Is

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is a framework built on the same agent harness that powers Claude Code CLI. Gives programmatic access to everything Claude Code can do: file operations, code execution, tool interception, streaming, checkpointing, MCP, and more.

**Key relationship**: Claude Code CLI is _built on_ the Agent SDK. The SDK is the engine underneath.

Available in both TypeScript and Python. claude-ws uses TypeScript v0.2.29.

### How It Works Under the Hood

The SDK **spawns the Claude Code CLI binary** as a subprocess:
```
node /path/to/cli.js --output-format stream-json --verbose --input-format stream-json
```

Communication happens via stdin/stdout with streaming JSON. **The SDK never makes direct API calls** — the CLI subprocess handles all authentication.

### Authentication: The Full Picture

#### January 2026 OAuth Crackdown

On January 9, 2026, Anthropic deployed client fingerprinting that blocks **direct OAuth token spoofing**:
- Third-party tools extracting tokens from `~/.claude/.credentials.json` and making raw API calls got blocked
- Error: _"This credential is only authorized for use with Claude Code and cannot be used for other API requests"_
- Affected: OpenCode (90k+ stars), Clawdbot, others
- OpenCode's response: launched OpenCode Black ($200/month) enterprise gateway

#### What Was NOT Blocked

The **CLI subprocess approach** was not blocked. Since the Agent SDK spawns the official CLI, and the CLI is the authorized client, it authenticates via the user's subscription.

#### Three Ways to Use Claude Code Programmatically

| Method | Auth | Cost | Status |
|--------|------|------|--------|
| **Agent SDK** (spawns CLI subprocess) | CLI inherits user's OAuth | Subscription | Works. Anthropic says "use API keys" for third-party products |
| **CLI `--print` mode** (`claude -p "prompt"`) | Prefers API key, falls back to OAuth | Subscription (if no API key set) | Works |
| **Direct OAuth token use** (extract tokens, raw API calls) | Stolen OAuth token | Subscription | **BLOCKED** |

#### Authentication Priority

When Claude Code CLI runs (whether interactive or via SDK subprocess):
1. `ANTHROPIC_API_KEY` — if set, uses API billing (highest priority)
2. `CLAUDE_CODE_OAUTH_TOKEN` — explicit OAuth token
3. `~/.claude/.credentials.json` — subscription OAuth (lowest priority)

To use subscription: ensure `ANTHROPIC_API_KEY` is **not** set.

#### `claude setup-token`

Generates an OAuth token for CLI use. Community repo `claude_agent_sdk_oauth_demo` demonstrates using this with the SDK via `CLAUDE_CODE_OAUTH_TOKEN` environment variable.

#### Anthropic's Stance vs. Reality

| | Official Docs | Technical Reality |
|---|---|---|
| **Position** | "Use API keys for third-party products" | SDK spawns CLI which uses subscription OAuth |
| **Target** | Products selling subscription access at scale | Tools like OpenCode routing many users through subscription |
| **Gray area** | — | Personal tools enhancing own Claude Code experience |

#### What This Means for Jacques

Jacques is a **personal monitoring tool**, not a redistributed service:
- **Violation**: Selling a product routing multiple users through subscription OAuth
- **Reasonable**: Personal tool enhancing own Claude Code sessions using own subscription
- **Safest**: Support both — subscription via CLI subprocess for personal use, API key for enterprise

### Billing: Two Separate Systems

| | Subscription (Pro/Max) | API Key | SDK (via CLI) |
|---|---|---|---|
| **Pricing** | $20-200/month flat | Pay per million tokens | Uses subscription (CLI subprocess) |
| **Context window** | 200K tokens | **1M tokens** (5x!) | Depends on auth method |
| **Who pays** | Your claude.ai plan | Console billing | Your claude.ai plan |
| **Risk level** | None | None | Gray area for third-party products |

**API token costs** (per million):
- Opus: $15 input / $75 output
- Sonnet: $3 input / $15 output
- Haiku: $0.80 input / $4 output

Heavy SDK usage with API keys: $500-1000+/month easily.

### SDK Capabilities

| Capability | Details |
|---|---|
| **Real-time streaming** | Character-by-character via `onMessage` callback, `content_block_delta` events |
| **Tool interception** | `canUseTool(toolName, input)` → `allow` or `deny` |
| **Checkpointing** | Save conversation + file state, rewind to any checkpoint |
| **Session forking** | Branch conversations via `fork_session` |
| **Accurate tokens** | `modelUsage`: `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `costUsd` |
| **MCP integration** | Connect to MCP servers, tool discovery, annotations (`readOnly`, `destructive`, `idempotent`, `openWorld`) |
| **Hooks** | Pre/post tool use interception points |
| **Permissions** | Deny/allow/ask rules, fine-grained tool control |
| **Subagents** | Specialized sub-agents as Markdown-defined skills |
| **Structured output** | Validated JSON matching schemas |
| **Extended context** | 1M tokens via `betas: ["context-1m-2025-08-07"]` |

### Viable Architecture for Jacques

- **Monitoring layer** (existing): Hooks + JSONL parsing. Free, lightweight, non-invasive. Keep as-is.
- **SDK layer** (new, optional): For launching managed sessions from GUI. Uses subscription via CLI subprocess. Adds: real-time streaming, accurate tokens, tool interception, checkpointing.
- **API key support** (optional): For enterprise/team users wanting guaranteed support and 1M context window.

### SDK API: How It Actually Works

#### Process Model

```
Your App (e.g., Jacques GUI)
    ↓ spawns subprocess via SDK
Claude Code CLI binary (uses YOUR subscription OAuth)
    ↓ stdin/stdout streaming NDJSON
    ↓ CLI makes API calls as the official client
Your App receives streaming responses + tool approval requests
```

The CLI is the official, authorized client. Anthropic can't distinguish between running `claude` in a terminal and the SDK spawning it — it's the same binary.

#### The `query()` Function

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Returns an AsyncGenerator<SDKMessage> — use for-await-of to consume
const q = query({
  prompt: "Fix the bug in auth.ts",            // string or async generator
  options: {
    cwd: "/path/to/project",                    // working directory
    model: "claude-opus-4-6",                    // model selection
    allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    permissionMode: "acceptEdits",               // default | acceptEdits | bypassPermissions | plan
    includePartialMessages: true,                // character-by-character streaming
    maxTurns: 50,                                // conversation turn limit
    resume: "session-id",                        // resume previous session
    forkSession: true,                           // branch from resume point
    mcpServers: { /* MCP config */ },            // MCP server definitions

    canUseTool: async (toolName, input) => {     // tool approval callback
      // Return { behavior: "allow", updatedInput } or { behavior: "deny", message }
    }
  }
});

// Query object has additional control methods:
await q.interrupt();                             // interrupt mid-stream
await q.setModel("claude-sonnet-4-5");           // change model during conversation
await q.setPermissionMode("plan");               // change permission mode
await q.rewindFiles("message-uuid");             // restore file state to checkpoint
```

#### Streaming: Two Levels

**Message-level** (default): Receive complete messages as they arrive.

**Token-level** (`includePartialMessages: true`): Character-by-character output.

```typescript
for await (const message of query({ prompt: "...", options: { includePartialMessages: true } })) {

  // Token-level streaming events
  if (message.type === "stream_event") {
    const event = message.event;
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text);    // live character-by-character output
    }
    if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
      console.log(`[Using ${event.content_block.name}...]`);
    }
  }

  // Complete assistant message
  if (message.type === "assistant") {
    console.log("Usage:", message.modelUsage);   // accurate token counts here
  }

  // Final result
  if (message.type === "result") {
    console.log(`Done: ${message.subtype}`);
  }
}
```

Stream event types: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`.

#### User Interaction: `canUseTool` Callback

When Claude wants to use a tool or ask the user a question, the SDK calls your `canUseTool` callback:

```typescript
canUseTool: async (toolName, input) => {
  // AskUserQuestion — Claude is asking the user something
  if (toolName === "AskUserQuestion") {
    // input.questions = [{ question, header, options, multiSelect }]
    const answers = await showQuestionDialogInGUI(input.questions);
    return {
      behavior: "allow",
      updatedInput: { questions: input.questions, answers }
    };
  }

  // Tool approval — user can approve, deny, or modify
  if (toolName === "Bash" && input.command.includes("rm -rf")) {
    return { behavior: "deny", message: "Blocked destructive command" };
  }

  // Can even modify tool inputs before allowing
  if (toolName === "Bash") {
    return {
      behavior: "allow",
      updatedInput: { ...input, command: input.command.replace("/tmp", "/tmp/sandbox") }
    };
  }

  return { behavior: "allow", updatedInput: input };
}
```

**Flow**: Claude calls tool → SDK pauses → your callback runs → you show UI to user → user decides → callback returns → SDK resumes Claude.

#### Multi-Turn Conversations (Streaming Input Mode)

For ongoing conversations, use an async generator:

```typescript
async function* generateMessages() {
  yield { type: "user", message: { role: "user", content: "Analyze this codebase" } };

  // Wait for user's next message (e.g., from GUI input)
  const userResponse = await waitForUserInput();

  yield { type: "user", message: { role: "user", content: userResponse } };
}

for await (const message of query({ prompt: generateMessages(), options: { ... } })) {
  // Process responses — CLI subprocess stays alive between messages
}
```

The CLI subprocess stays alive throughout, maintaining full conversation context.

#### Session Resume & Fork

```typescript
// Resume — continue the same conversation
query({ prompt: "Continue", options: { resume: sessionId } });

// Fork — branch from a checkpoint, original session unchanged
query({ prompt: "Try different approach", options: { resume: sessionId, forkSession: true } });
```

#### Available Tools

ALL Claude Code tools are available: `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebSearch`, `WebFetch`, `Task` (subagents), `AskUserQuestion`, `NotebookEdit`, `ListMcpResources`, `ReadMcpResource`, plus any MCP-provided tools.

Full feature parity: MCP servers, plan mode, permission modes, subagents, file checkpointing, hooks, custom tools, image uploads.

#### How claude-ws Implements This

```
Browser (React)
    ↓ Socket.io
Server (AgentManager singleton)
    ↓ SDK query()
Claude Code CLI subprocess
    ↓ stdin/stdout JSON
Anthropic API (via CLI's OAuth)
```

- **AgentManager** spawns SDK, maintains map of active agents by attemptId
- **Streaming**: SDK emits messages → AgentManager emits Socket.io events → browser updates live
- **Questions**: SDK pauses at `AskUserQuestion` → emits `question:ask` to browser → user answers in modal → answer flows back through `canUseTool` → SDK resumes
- **Cancellation**: `query.close()` for graceful shutdown, `AbortController` for force kill
- **Multiple concurrent sessions**: Each task gets its own SDK query instance and Socket.io room

### Risks

- Anthropic could tighten restrictions further (block CLI subprocess for third-party tools)
- The "personal tool" distinction is gray
- SDK is pre-1.0 (v0.2.x) — API may change
- OAuth crackdown shows Anthropic willing to break third-party integrations

---

## What They Do Better

| Area | Who | Why |
|------|-----|-----|
| **Real-time streaming** | claude-ws | SDK gives true streaming; Jacques gets periodic statusLine snapshots |
| **Token accuracy** | claude-ws | Direct SDK counts vs. Jacques' tiktoken estimation |
| **Semantic search** | Continue | Vector embeddings vs. Jacques' text grep |
| **Context plugins** | Continue | Formal `IContextProvider` system vs. Jacques' ad-hoc sources |
| **Session control** | claude-ws | Launch/pause/checkpoint/rewind vs. Jacques' observe-only |
| **IDE integration** | Continue | Deep VS Code/IntelliJ with webview GUI vs. Jacques' terminal-only |
| **Config management** | Continue | YAML composition with Zod validation vs. Jacques' scattered config |
| **Message protocol** | Continue | Strongly-typed `ToCoreProtocol`/`FromCoreProtocol` vs. Jacques' ad-hoc WebSocket |
| **Checkpoint/rewind** | claude-ws | Dual-state (conversation + files) vs. Jacques' handoffs (manual snapshots) |

## What Jacques Does Better

| Area | Why |
|------|-----|
| **Lightweight monitoring** | Non-invasive, doesn't change how Claude Code runs |
| **Cross-terminal support** | iTerm, Terminal.app, Kitty, WezTerm, Windows Terminal |
| **Session lifecycle** | Full tracking: start → active → idle → awaiting → end |
| **Archive/catalog** | Rich historical data extraction (plans, subagents, web searches) |
| **Process verification** | Detects dead sessions even without hooks (Ctrl+C kills) |
| **Focus tracking** | macOS AppleScript-based terminal focus detection |
| **No extra cost** | Works entirely within existing Claude subscription |
| **Terminal identity** | Unique key system (ITERM, TTY, PID, DISCOVERED, AUTO prefixes) |

---

## Recommended Priority

If pursuing improvements, suggested order:

1. **Session corruption detection** (#4) — Low effort, high reliability gain
2. **Workflow visualization** (#6) — Builds on existing subagent data
3. **Multi-mode awareness** (#8) — Already have the data, just need UI
4. **Vector search** (#2) — High impact for power users with large archives
5. **SDK integration** (#1) — Biggest paradigm shift, highest effort
6. **Room-based WebSocket** (#5) — Good for scale, moderate effort
7. **Context plugins** (#3) — Formalize existing sources system
8. **Config composition** (#9) — Quality of life improvement
9. **Proxy pattern** (#7) — Solves token accuracy but invasive
10. **Smart handoffs** (#10) — Nice to have, depends on AI availability

---

## Key Conclusion: Hooks vs SDK for Monitoring

**Hooks are the right approach for monitoring. The SDK cannot replace them.**

The SDK can only control sessions **it launches**. It cannot attach to existing CLI sessions running in terminals. For monitoring behavior across all terminals (mode, action, context, notifications), hooks are the only viable approach.

| Capability | Hooks | SDK |
|------------|-------|-----|
| Monitor any terminal session | Yes | No — only SDK-launched |
| User workflow unchanged | Yes — just run `claude` | No — must launch via Jacques |
| Mode detection | `permission_mode` in every event | Only for managed sessions |
| Action tracking | PreToolUse/PostToolUse | Only for managed sessions |
| Notifications | Desktop + WebSocket | Only for managed sessions |
| Token accuracy | Estimated (tiktoken) | Exact (`modelUsage`) |
| Session control | None (observe-only) | Full (pause, checkpoint, rewind) |
| Real-time streaming | Periodic snapshots | Character-by-character |

**SDK adds value only as an additive layer** — launching managed sessions from the GUI with checkpointing, accurate tokens, and tool approval. Not as a replacement for hook-based monitoring.

The recommended architecture: keep hooks as the universal monitoring foundation, add SDK as an optional "power mode" for users who want managed sessions with premium features.
