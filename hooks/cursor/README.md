# Cursor Hooks for Jacques

This directory contains hooks for integrating Cursor Native AI with Jacques.

## Installation

### Option 1: Automatic (Recommended)

```bash
cd /path/to/jacques-context-manager
python3 hooks/install.py --source cursor
```

### Option 2: Manual

1. Copy the hooks to `~/.jacques/hooks/cursor/`:

   ```bash
   mkdir -p ~/.jacques/hooks/cursor
   cp hooks/cursor/*.py ~/.jacques/hooks/cursor/
   cp -r hooks/adapters ~/.jacques/hooks/
   ```

2. Copy `hooks.json.template` to your project's `.cursor/hooks.json`:

   ```bash
   cp hooks/cursor/hooks.json.template /path/to/your/project/.cursor/hooks.json
   ```

   Or for global configuration, copy to Cursor's config directory.

## Hooks

| Hook         | Event            | Description                               |
| ------------ | ---------------- | ----------------------------------------- |
| sessionStart | `session_start`  | Registers new Cursor session with Jacques |
| sessionEnd   | `session_end`    | Unregisters Cursor session from Jacques   |
| postToolUse  | `activity`       | Reports tool usage activity               |
| preCompact   | `context_update` | **Key hook!** Provides context metrics    |

## Context Metrics

The `preCompact` hook is special - it provides context window usage metrics,
allowing Jacques to display context percentage for Cursor sessions just like
Claude Code CLI sessions.

Expected fields from Cursor's preCompact event:

- `context_usage_percent`: Percentage of context used (0-100)
- `context_tokens`: Current token count
- `context_window_size`: Maximum context window size

## Debugging

Check the debug log for hook input data:

```bash
tail -f /tmp/jacques-hook-debug.log
```

This helps understand what data Cursor is sending to hooks.
