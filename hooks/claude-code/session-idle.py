#!/usr/bin/env python3
"""
session-idle.py - Mark Claude Code session as idle

Called on Stop hook.
Marks session as idle (waiting for user input).
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
    
    # Build and send idle payload
    payload = adapter.build_idle_payload(input_data)
    if payload:
        adapter.send_event(payload, use_fallback=False)


if __name__ == '__main__':
    main()
