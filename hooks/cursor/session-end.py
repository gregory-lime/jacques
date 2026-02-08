#!/usr/bin/env python3
"""
session-end.py - Unregister Cursor session from Jacques

Called on Cursor's sessionEnd hook.
Removes Cursor session from Jacques server.
"""
import sys
from pathlib import Path

# Add parent directory to path for adapter imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from adapters.cursor import CursorAdapter


def main():
    adapter = CursorAdapter()
    
    # Parse input from stdin
    input_data = adapter.parse_input()
    if not input_data:
        sys.exit(0)
    
    # Build and send session_end payload
    payload = adapter.build_session_end_payload(input_data)
    if payload:
        adapter.send_event(payload, use_fallback=False)


if __name__ == '__main__':
    main()
