#!/usr/bin/env python3
"""
jacques-session-idle.py

Mark Claude Code session as idle (waiting for user input).
Called on Stop hook.

Skip: Set JACQUES_SKIP=1 or create ~/.jacques/skip
"""
import json
import sys
import os
import socket
import time
from pathlib import Path

# Skip if running as subprocess, JACQUES_SKIP=1, or ~/.jacques/skip exists
if os.environ.get('JACQUES_SUBPROCESS') == '1' or os.environ.get('JACQUES_SKIP') == '1' or Path.home().joinpath('.jacques/skip').exists():
    sys.exit(0)


def send_to_server(payload: dict, socket_path: str = '/tmp/jacques.sock') -> bool:
    """Send payload to Jacques server via Unix socket."""
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(1.0)
        sock.connect(socket_path)
        sock.sendall(json.dumps(payload).encode() + b'\n')
        sock.close()
        return True
    except:
        return False


def main():
    try:
        input_data = json.load(sys.stdin)
    except:
        sys.exit(0)
    
    session_id = input_data.get('session_id')
    if not session_id:
        sys.exit(0)
    
    # Build idle event payload
    idle_event = {
        "event": "idle",
        "timestamp": int(time.time() * 1000),
        "session_id": session_id,
        "terminal_pid": os.getppid(),
    }
    
    send_to_server(idle_event)


if __name__ == '__main__':
    main()
