# Research: Tracking Context Changes After Each Message in Cursor

## Problem Statement

Currently, Jacques only gets context metrics when:

1. User manually types `/summarize`
2. Cursor auto-compacts (when context reaches ~85%)

**Goal**: Track context usage after EVERY message (user input + AI response).

## Available Cursor Hooks

### Hooks That Fire Per-Message

| Hook                 | When It Fires             | Has Context Metrics? |
| -------------------- | ------------------------- | -------------------- |
| `afterAgentResponse` | After EVERY AI response   | ❌ No                |
| `postToolUse`        | After each tool execution | ❌ No                |
| `preCompact`         | Before context compaction | ✅ Yes               |

### Common Fields (All Hooks)

```json
{
  "conversation_id": "string",
  "generation_id": "string", // Changes with every user message!
  "model": "string",
  "transcript_path": "string", // Path to conversation transcript
  "workspace_roots": ["<path>"],
  "cursor_version": "string"
}
```

### `afterAgentResponse` Hook (KEY!)

```json
// Input
{
  "text": "<assistant final text>"
  // + common fields
}
```

**This fires after EVERY AI response!** But it doesn't include context metrics.

### `preCompact` Hook (Only Source of Metrics)

```json
{
  "context_usage_percent": 85,
  "context_tokens": 120000,
  "context_window_size": 128000,
  "message_count": 45,
  "messages_to_compact": 30
}
```

## Solution Options

### Option A: Token Estimation via `afterAgentResponse` (Recommended)

**Approach**:

1. Implement `afterAgentResponse` hook
2. Read the transcript file (available via `transcript_path`)
3. Estimate tokens using a tokenizer (tiktoken for Claude models)
4. Send estimated context metrics to Jacques

**Pros**:

- Fires after every message
- Has access to transcript file for full conversation
- Can track context growth in real-time

**Cons**:

- Estimated tokens, not exact
- Need to install/bundle tokenizer
- Different models have different tokenizers

**Implementation**:

```python
# hooks/cursor/after-agent-response.py
import tiktoken  # or another tokenizer

def estimate_tokens(text: str, model: str) -> int:
    # Use appropriate tokenizer for model
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))

def main():
    adapter = CursorAdapter()
    input_data = adapter.parse_input()

    # Read transcript
    transcript_path = input_data.get('transcript_path')
    if transcript_path:
        with open(transcript_path, 'r') as f:
            transcript_content = f.read()

        # Estimate tokens
        estimated_tokens = estimate_tokens(transcript_content, input_data.get('model'))
        context_window = 200000  # Default, or lookup by model

        # Send to Jacques
        payload = {
            "event": "context_estimate",
            "session_id": input_data.get('conversation_id'),
            "estimated_tokens": estimated_tokens,
            "estimated_percentage": (estimated_tokens / context_window) * 100,
            "is_estimate": True  # Flag that this is estimated
        }
        adapter.send_event(payload)
```

### Option B: Cumulative Tracking

**Approach**:

1. Track tokens from each `afterAgentResponse` text
2. Add to running total
3. Reset on session start

**Pros**:

- Simple to implement
- No need to read transcript file

**Cons**:

- Doesn't account for system prompts (skills, etc.)
- Cumulative error over time
- Missing context from file attachments

### Option C: Transcript File Monitoring

**Approach**:

1. Watch the transcript file for changes
2. Parse and estimate tokens periodically
3. Send updates to Jacques

**Pros**:

- Captures full conversation
- Can detect file attachments

**Cons**:

- Requires file watching daemon
- More complex implementation

### Option D: Hybrid Approach (Best Accuracy)

**Approach**:

1. Use `afterAgentResponse` for real-time estimates
2. Calibrate estimates when `preCompact` fires (actual metrics)
3. Apply correction factor for future estimates

**Pros**:

- Real-time tracking
- Self-correcting accuracy
- Best of both worlds

**Implementation**:

```python
# Track correction factor
correction_factor = 1.0

def on_after_response(estimated_tokens):
    return estimated_tokens * correction_factor

def on_pre_compact(actual_tokens, estimated_tokens):
    global correction_factor
    correction_factor = actual_tokens / estimated_tokens
```

## Recommended Implementation Plan

### Phase 1: Basic Token Estimation

1. Add `afterAgentResponse` hook to Cursor hooks
2. Implement basic transcript parsing
3. Use tiktoken for token estimation
4. Send estimated context to Jacques
5. Flag estimates in UI (e.g., "ctx:~45%")

### Phase 2: Accuracy Improvement

1. Calibrate using `preCompact` actual values
2. Track correction factor per model
3. Account for system prompt size (one-time measurement)

### Phase 3: Enhanced Features

1. Show token breakdown (messages vs system prompts)
2. Track context growth rate
3. Warn when approaching context limit
4. Suggest disabling skills if context is tight

## Token Estimation Libraries

### For Python:

| Library         | Models         | Notes                     |
| --------------- | -------------- | ------------------------- |
| `tiktoken`      | OpenAI, Claude | Fast, accurate for Claude |
| `transformers`  | All            | Heavy dependency          |
| `anthropic` SDK | Claude only    | Requires API key          |

### Approximate Token Rules:

- English: ~4 characters per token
- Code: ~3 characters per token
- Markdown: ~3.5 characters per token

Simple estimation:

```python
def estimate_tokens_simple(text: str) -> int:
    return len(text) // 4  # Rough estimate
```

## Model Context Windows

| Model             | Context Window |
| ----------------- | -------------- |
| Claude 3.5 Sonnet | 200,000        |
| Claude 3 Opus     | 200,000        |
| GPT-4 Turbo       | 128,000        |
| Gemini 1.5 Pro    | 1,000,000      |
| Gemini 2.5 Flash  | 164,000        |

## Files to Create/Modify

1. `hooks/cursor/after-agent-response.py` - New hook
2. `hooks/cursor/hooks.json.template` - Add new hook
3. `hooks/adapters/cursor.py` - Add estimation methods
4. `server/src/types.ts` - Add `context_estimate` event
5. `cli/src/display.ts` - Show estimated vs actual

## Open Questions

1. Should we bundle tiktoken? (adds ~50MB to install)
2. How to handle multi-model context windows?
3. Should estimates be shown differently in UI?
4. How often to update estimates (every message vs throttled)?

## Next Steps

1. [ ] Decide on implementation approach (A, B, C, or D)
2. [ ] Prototype `afterAgentResponse` hook
3. [ ] Test token estimation accuracy
4. [ ] Update Jacques server for estimated context
5. [ ] Update CLI UI to show estimates
