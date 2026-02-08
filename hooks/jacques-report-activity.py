#!/usr/bin/env python3
"""
jacques-report-activity.py

Report Claude Code activity to Jacques server.
Called on PostToolUse hook.

Updates session activity timestamp and optionally refreshes session title.

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


def extract_session_title(transcript_path: str) -> str | None:
    """
    Extract session title from transcript (optimized for recent changes).
    Checks recent lines first for updated title/summary.
    """
    if not transcript_path:
        return None
    
    path = Path(transcript_path)
    if not path.exists():
        return None
    
    title = None
    summary_text = None
    first_user_message = None
    
    try:
        with open(path, 'r') as f:
            lines = f.readlines()
        
        # Check recent lines first for updated title/summary
        recent_lines = lines[-100:] if len(lines) > 100 else lines
        
        for line in recent_lines:
            try:
                entry = json.loads(line.strip())
                if 'title' in entry:
                    title = entry['title']
                if entry.get('type') == 'summary':
                    summary_content = entry.get('summary', '')
                    if summary_content:
                        summary_text = summary_content.split('.')[0][:80]
            except json.JSONDecodeError:
                continue
        
        # Check first REAL user message if no title found (skip internal messages)
        if not title and not summary_text:
            for line in lines[:20]:
                try:
                    entry = json.loads(line.strip())
                    if entry.get('type') == 'user':
                        msg = entry.get('message', {})
                        content = msg.get('content', '') if isinstance(msg, dict) else ''
                        if isinstance(content, str) and content:
                            # Skip internal Claude Code XML tags
                            skip_prefixes = ('<local-command', '<command-name>', '<system-', '<user-prompt-')
                            if not any(content.startswith(p) for p in skip_prefixes) and not content.startswith('['):
                                first_user_message = content.strip()[:80]
                                if len(content) > 80:
                                    first_user_message += '...'
                                break
                except:
                    continue
                    
    except Exception as e:
        print(f"[jacques] Error reading transcript: {e}", file=sys.stderr)
    
    return title or summary_text or first_user_message


def send_to_server(payload: dict, socket_path: str = '/tmp/jacques.sock') -> bool:
    """Send payload to Jacques server via Unix socket."""
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(0.5)  # Short timeout for activity updates
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
    
    transcript_path = input_data.get('transcript_path')
    tool_name = input_data.get('tool_name', 'unknown')
    cwd = input_data.get('cwd', '')
    
    # Get workspace info for fallback title
    workspace = input_data.get('workspace', {})
    project_dir = workspace.get('project_dir', '') if isinstance(workspace, dict) else ''
    
    # Determine project name for fallback
    if project_dir:
        project_name = os.path.basename(project_dir)
    elif cwd:
        project_name = os.path.basename(cwd)
    else:
        project_name = 'Unknown'
    
    # Extract updated session title from transcript
    session_title = extract_session_title(transcript_path)
    
    # Fallback title if transcript has no extractable title
    if not session_title:
        session_title = f"Session in {project_name}"
    
    # Build activity payload
    activity = {
        "event": "activity",
        "timestamp": int(time.time() * 1000),
        "session_id": session_id,
        "session_title": session_title,
        "tool_name": tool_name,
        "terminal_pid": os.getppid(),
    }
    
    # Non-blocking send - don't write fallback for activity events
    send_to_server(activity)


if __name__ == '__main__':
    main()
