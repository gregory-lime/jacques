#!/usr/bin/env python3
"""
pre-tool-use.py - Report pre-tool-use to Jacques

Called on PreToolUse hook.
Sends tool name to server so it can detect when Claude is waiting
for user approval (edit acceptance, command approval, etc.).
"""
import sys
from pathlib import Path

# Add parent directory to path for adapter imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from adapters.claude_code import ClaudeCodeAdapter


def main():
    adapter = ClaudeCodeAdapter()

    # Parse input from stdin
    input_data = adapter.parse_input()
    if not input_data:
        sys.exit(0)

    # Log for debugging (verify permission_mode presence)
    adapter.log_debug(input_data, 'PreToolUse')

    # Build and send pre_tool_use payload (no fallback - transient event)
    payload = adapter.build_pre_tool_use_payload(input_data)
    if payload:
        adapter.send_event(payload, use_fallback=False)


if __name__ == '__main__':
    main()
