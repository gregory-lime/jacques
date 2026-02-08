#!/usr/bin/env python3
"""
post-tool-use.py - Report Cursor activity to Jacques

Called on Cursor's postToolUse hook.
Updates session activity timestamp.
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
    
    # Build and send activity payload (no fallback for activity events)
    payload = adapter.build_activity_payload(input_data)
    if payload:
        adapter.send_event(payload, use_fallback=False)


if __name__ == '__main__':
    main()
