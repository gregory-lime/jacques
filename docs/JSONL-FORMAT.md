# Claude Code JSONL Format

Reference for parsing Claude Code JSONL transcript files. Important discoveries from Phase 7 parser implementation.

## Entry Types

| Type                    | Subtype                   | Description                        |
| ----------------------- | ------------------------- | ---------------------------------- |
| `user`                  | -                         | User messages                      |
| `assistant`             | -                         | Claude responses + thinking        |
| `progress`              | `hook_progress`           | Hook execution logs                |
| `progress`              | `agent_progress`          | Subagent/explore agent calls       |
| `progress`              | `bash_progress`           | Bash command streaming output      |
| `progress`              | `mcp_progress`            | MCP tool executions                |
| `progress`              | `query_update`            | Web search queries                 |
| `progress`              | `search_results_received` | Web search results                 |
| `system`                | `turn_duration`           | Turn timing metrics                |
| `system`                | `stop_hook_summary`       | Hook summary                       |
| `summary`               | -                         | Session title                      |
| `queue-operation`       | -                         | Queue management (usually skip)    |
| `file-history-snapshot` | -                         | File tracking (skip)               |

## Filtered User Messages

User messages starting with these prefixes are **internal CLI messages** and should be hidden from archive display:

| Prefix | Description |
|--------|-------------|
| `<local-command-caveat>` | Warning before local command output |
| `<command-name>` | CLI command name (e.g., `/clear`, `/help`) |
| `<command-message>` | CLI command description |
| `<command-args>` | CLI command arguments |
| `<local-command-stdout>` | CLI command output |

These are generated when users run slash commands in the CLI and don't represent actual user questions.

## Progress Entry Structures

**agent_progress** (subagent/explore calls):
```json
{
  "type": "progress",
  "data": {
    "type": "agent_progress",
    "prompt": "Task given to the agent",
    "agentId": "a6047be",
    "message": {
      "type": "user" | "assistant",
      "message": { "role": "...", "content": [...] }
    }
  }
}
```

**bash_progress** (command streaming):
```json
{
  "type": "progress",
  "data": {
    "type": "bash_progress",
    "output": "recent output",
    "fullOutput": "complete output",
    "elapsedTimeSeconds": 2,
    "totalLines": 100
  }
}
```

**mcp_progress** (MCP tool calls):
```json
{
  "type": "progress",
  "data": {
    "type": "mcp_progress",
    "status": "started" | "completed",
    "serverName": "deepwiki",
    "toolName": "ask_question"
  }
}
```

**web search** (query_update / search_results_received):
```json
{
  "type": "progress",
  "data": {
    "type": "query_update" | "search_results_received",
    "query": "search terms",
    "resultCount": 10
  }
}
```

## Assistant Message Content

`assistant` entries contain `message.content[]` array with:
- `type: "text"` - Actual response text
- `type: "thinking"` - Extended thinking/reasoning
- `type: "tool_use"` - Tool calls (Bash, Read, Write, etc.)

## Token Usage Data

`assistant` entries include token usage in `message.usage`:
```json
{
  "usage": {
    "input_tokens": 15000,
    "output_tokens": 2500,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 12000
  }
}
```

**WARNING: `output_tokens` is INACCURATE!** Claude Code JSONL always shows 1-9 tokens regardless of actual output. Jacques uses tiktoken to estimate actual output tokens from text content. See `docs/PITFALLS.md` for full details.

**Token calculation for display:**
- **Input tokens** = `input_tokens + cache_read_input_tokens` (fresh + cached)
- **Output tokens** = Estimated via tiktoken from actual text content (NOT from `output_tokens` field)
- Note: `cache_creation_input_tokens` is a SUBSET of `input_tokens`, not additional tokens

## Path Encoding

Transcript paths use dash encoding: `/Users/gole/Desktop/project` → `-Users-gole-Desktop-project`
**Critical**: Keep the leading dash!

## Parsing Example

See `cli/src/session/parser.ts` for reference implementation.

## Subagent File Structure

Subagent conversations are stored in `{session-id}/subagents/agent-{agentId}.jsonl`:

```
~/.claude/projects/{encoded-path}/
├── {session-id}.jsonl              # Main conversation (has agent_progress for user agents)
└── {session-id}/
    └── subagents/
        ├── agent-a6047be.jsonl     # User-triggered Task agent
        ├── agent-acompact-83efcb.jsonl  # Internal: auto-compact (no agent_progress)
        └── agent-aprompt_suggestion-4e4eb6.jsonl  # Internal: prompt suggestion (no agent_progress)
```

**Important**: The number of subagent files may exceed the count of `agent_progress` entries in the main JSONL because internal agents don't create progress entries.
