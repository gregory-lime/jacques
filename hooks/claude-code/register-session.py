#!/usr/bin/env python3
"""
register-session.py - Register Claude Code session with Jacques

Called on SessionStart hook.
Registers new Claude Code session with the Jacques server.
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
    
    # Debug logging (remove after debugging complete)
    adapter.log_debug(input_data, 'SessionStart')
    
    # Build and send session_start payload
    payload = adapter.build_session_start_payload(input_data)
    if payload:
        adapter.send_event(payload, use_fallback=True)


if __name__ == '__main__':
    main()
