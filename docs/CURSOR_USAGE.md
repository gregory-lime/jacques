# Using Jacques with Cursor Native AI

## Overview

Jacques can monitor Cursor Native AI sessions, but with some differences compared to Claude Code CLI:

| Feature          | Claude Code CLI | Cursor Native AI      |
| ---------------- | --------------- | --------------------- |
| Session tracking | ✅ Real-time    | ✅ Real-time          |
| Project name     | ✅ Accurate     | ✅ Accurate           |
| Model display    | ✅ Real-time    | ⚠️ Session start only |
| Context metrics  | ✅ Continuous   | ⚠️ Event-based        |
| Source label     | `[claude_code]` | `[cursor]`            |

## Context Metrics in Cursor

Unlike Claude Code CLI which provides continuous context updates via `statusLine`, Cursor only provides context metrics during **compaction events** via the `preCompact` hook.

### When Context Metrics Update

Context metrics in Cursor sessions update in two scenarios:

1. **Automatic**: When context window reaches ~85% capacity, Cursor auto-compacts
2. **Manual**: When you type `/summarize` in the Cursor chat

### How to Get Context Metrics Manually

To see your current context usage in Jacques for Cursor sessions:

1. Open your Cursor chat/composer
2. Type `/summarize` and press Enter
3. Cursor will trigger context compaction
4. The `preCompact` hook fires with context metrics
5. Jacques dashboard updates with current context percentage

**Example:**

```
User: /summarize
Cursor: [Compacting context...]
Jacques: Updates to show "ctx:75%" for your Cursor session
```

## Installation

### 1. Install Hooks

```bash
cd /path/to/jacques-context-manager
python3 hooks/install.py --source cursor
```

### 2. Verify Installation

The installer will:

- Copy hook scripts to `~/.jacques/hooks/cursor/`
- Copy adapters to `~/.jacques/hooks/adapters/`
- Show instructions for enabling hooks in your project

### 3. Enable Hooks for Your Project

Copy the template to your project's `.cursor` directory:

```bash
mkdir -p /path/to/your/project/.cursor
cp hooks/cursor/hooks.json.template /path/to/your/project/.cursor/hooks.json
```

Or use the global Cursor hooks configuration (if supported by your Cursor version).

### 4. Restart Cursor

Close and reopen Cursor to load the new hooks configuration.

## Hooks Implemented

The following Cursor hooks are configured for Jacques:

| Hook           | Purpose              | Data Provided                   |
| -------------- | -------------------- | ------------------------------- |
| `sessionStart` | Register new session | Session ID, model, project path |
| `sessionEnd`   | Remove ended session | Session ID                      |
| `postToolUse`  | Track activity       | Tool name, timing               |
| `preCompact`   | **Context metrics**  | Usage %, tokens, window size    |

## Available Commands

### Check Context Manually

```
/summarize
```

Triggers Cursor's context compaction and updates Jacques with current metrics.

## Troubleshooting

### Context shows "ctx:?%"

This is normal! Cursor context metrics only update during compaction events.

**Solutions:**

1. Type `/summarize` to manually update metrics
2. Wait for automatic compaction (happens around 85% context usage)
3. Continue working - metrics will appear when context fills up

### Session not appearing in Jacques

1. Check hooks are installed:

   ```bash
   ls ~/.jacques/hooks/cursor/
   ```

2. Verify hooks.json exists in your project:

   ```bash
   cat /path/to/your/project/.cursor/hooks.json
   ```

3. Check debug log:

   ```bash
   tail -f /tmp/jacques-hook-debug.log
   ```

4. Restart Cursor after installing hooks

### Model changes don't update

This is a known limitation. Cursor's hooks don't fire on model changes.

**Workaround**: Start a new chat session to see the updated model in Jacques.

## Comparison with Claude Code CLI

**Advantages of Claude Code CLI:**

- ✅ Continuous, real-time context metrics via statusLine
- ✅ Real-time model updates
- ✅ More granular activity tracking

**Advantages of Cursor Native:**

- ✅ Integrated IDE experience
- ✅ Visual UI for AI interactions
- ✅ Can still track sessions and projects
- ✅ Manual `/summarize` provides on-demand metrics

## Future Improvements

Potential enhancements being considered:

1. Add a notification when context metrics haven't updated in a while
2. Provide a button in Jacques dashboard to trigger `/summarize` automatically
3. Investigate other Cursor events that might provide context data
4. Add support for tracking model changes through alternative methods

## Documentation

For more information about Cursor hooks:

- Official Cursor Hooks Documentation: https://cursor.com/docs/agent/hooks
- Jacques GitHub Repository: [link to repo]
