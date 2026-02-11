#!/usr/bin/env python3
"""
jacques-register-session.py

Register Claude Code session with Jacques server.
Called on SessionStart hook.

Extracts:
- Session metadata from stdin JSON
- Terminal identity from environment
- Session title from transcript (if available)

Skip: Set JACQUES_SKIP=1 or create ~/.jacques/skip
"""
import json
import sys
import os
import socket
import subprocess
import time
from pathlib import Path

# Skip if running as subprocess, JACQUES_SKIP=1, or ~/.jacques/skip exists
if os.environ.get('JACQUES_SUBPROCESS') == '1' or os.environ.get('JACQUES_SKIP') == '1' or Path.home().joinpath('.jacques/skip').exists():
    sys.exit(0)


def extract_session_title(transcript_path: str) -> str | None:
    """
    Extract a meaningful title from the Claude Code session transcript.
    
    Priority:
    1. Explicit 'title' field (if Claude Code adds one)
    2. 'summary' type entries (auto-generated session summaries)
    3. First user message (truncated to 80 chars)
    """
    if not transcript_path:
        return None
    
    path = Path(transcript_path)
    if not path.exists():
        return None
    
    title = None
    first_user_message = None
    summary_text = None
    
    try:
        with open(path, 'r') as f:
            for line in f:
                try:
                    entry = json.loads(line.strip())
                    
                    # Check for explicit title
                    if 'title' in entry:
                        title = entry['title']
                        break
                    
                    # Check for summary type
                    if entry.get('type') == 'summary':
                        summary_content = entry.get('summary', '')
                        if summary_content:
                            summary_text = summary_content.split('.')[0][:80]
                    
                    # Track first REAL user message (skip internal Claude Code messages)
                    if entry.get('type') == 'user' and not first_user_message:
                        msg = entry.get('message', {})
                        content = msg.get('content', '') if isinstance(msg, dict) else ''
                        if isinstance(content, str) and content:
                            # Skip internal Claude Code XML tags
                            skip_prefixes = ('<local-command', '<command-name>', '<system-', '<user-prompt-')
                            if not any(content.startswith(p) for p in skip_prefixes) and not content.startswith('['):
                                first_user_message = content.strip()[:80]
                                if len(content) > 80:
                                    first_user_message += '...'
                    
                except json.JSONDecodeError:
                    continue
    except Exception as e:
        # Log error for debugging
        print(f"[jacques] Error reading transcript: {e}", file=sys.stderr)
    
    return title or summary_text or first_user_message


def get_terminal_identity() -> dict:
    """Get terminal-specific identifiers from environment and system."""
    tty = None
    
    # Try to get TTY
    try:
        if sys.stdin.isatty():
            tty = os.ttyname(sys.stdin.fileno())
    except:
        pass
    
    if not tty:
        try:
            result = os.popen("tty 2>/dev/null").read().strip()
            if result and result != "not a tty":
                tty = result
        except:
            pass
    
    return {
        "tty": tty,
        "terminal_pid": os.getppid(),
        "term_program": os.environ.get("TERM_PROGRAM"),
        "iterm_session_id": os.environ.get("ITERM_SESSION_ID"),
        "term_session_id": os.environ.get("TERM_SESSION_ID"),
        "kitty_window_id": os.environ.get("KITTY_WINDOW_ID"),
        "wezterm_pane": os.environ.get("WEZTERM_PANE"),
        "vscode_injection": os.environ.get("VSCODE_INJECTION"),
        "windowid": os.environ.get("WINDOWID"),
        "term": os.environ.get("TERM"),
    }


def build_terminal_key(terminal: dict) -> str:
    """Build a unique key for this terminal instance."""
    # Priority: iTerm session ID > Kitty > WezTerm > TTY > PID
    if terminal.get("iterm_session_id"):
        return f"ITERM:{terminal['iterm_session_id']}"
    if terminal.get("kitty_window_id"):
        return f"KITTY:{terminal['kitty_window_id']}"
    if terminal.get("wezterm_pane"):
        return f"WEZTERM:{terminal['wezterm_pane']}"
    if terminal.get("tty"):
        return f"TTY:{terminal['tty']}"
    if terminal.get("terminal_pid"):
        return f"PID:{terminal['terminal_pid']}"
    return f"UNKNOWN:{time.time()}"


def detect_git_info(project_dir: str) -> dict:
    """Detect git branch, worktree name, and repo root using git-detect.sh."""
    result = {'git_branch': '', 'git_worktree': '', 'git_repo_root': ''}
    if not project_dir or not os.path.isdir(project_dir):
        return result

    script_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(script_dir, 'git-detect.sh')

    if os.path.isfile(script_path) and os.access(script_path, os.X_OK):
        try:
            proc = subprocess.run(
                [script_path, project_dir],
                capture_output=True, text=True, timeout=5
            )
            if proc.returncode == 0:
                lines = proc.stdout.split('\n')
                result['git_branch'] = lines[0] if len(lines) > 0 else ''
                result['git_worktree'] = lines[1] if len(lines) > 1 else ''
                result['git_repo_root'] = lines[2] if len(lines) > 2 else ''
                return result
        except Exception:
            pass

    # Fallback: inline git detection
    try:
        proc = subprocess.run(
            ['git', '-C', project_dir, 'rev-parse', '--abbrev-ref', 'HEAD', '--git-common-dir'],
            capture_output=True, text=True, timeout=5
        )
        if proc.returncode == 0 and proc.stdout.strip():
            lines = proc.stdout.strip().split('\n')
            result['git_branch'] = lines[0] if len(lines) > 0 else ''
            if len(lines) > 1:
                common = lines[1]
                if common == '.git':
                    result['git_repo_root'] = os.path.abspath(project_dir)
                else:
                    result['git_repo_root'] = os.path.dirname(common)
                    result['git_worktree'] = os.path.basename(project_dir)
    except Exception:
        pass

    return result


def send_to_server(payload: dict, socket_path: str = '/tmp/jacques.sock') -> bool:
    """Send payload to Jacques server via Unix socket."""
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(1.0)
        sock.connect(socket_path)
        sock.sendall(json.dumps(payload).encode() + b'\n')
        sock.close()
        return True
    except Exception as e:
        # Log for debugging
        print(f"[jacques] Failed to send to server: {e}", file=sys.stderr)
        return False


def write_fallback(payload: dict):
    """Write to fallback file when server is unavailable."""
    fallback_path = Path.home() / '.jacques' / 'pending-events.jsonl'
    fallback_path.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        with open(fallback_path, 'a') as f:
            f.write(json.dumps(payload) + '\n')
    except Exception as e:
        print(f"[jacques] Failed to write fallback: {e}", file=sys.stderr)


def main():
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"[jacques] Invalid JSON input: {e}", file=sys.stderr)
        sys.exit(0)
    except Exception as e:
        print(f"[jacques] Error reading input: {e}", file=sys.stderr)
        sys.exit(0)
    
    # DEBUG: Log the full input to help understand what Cursor sends vs CLI
    try:
        with open('/tmp/jacques-hook-debug.log', 'a') as f:
            f.write(f"\n=== SessionStart {time.strftime('%Y-%m-%d %H:%M:%S')} ===\n")
            f.write(json.dumps(input_data, indent=2))
            f.write("\n")
    except:
        pass
    
    session_id = input_data.get('session_id')
    if not session_id:
        print("[jacques] No session_id in input", file=sys.stderr)
        sys.exit(0)
    
    transcript_path = input_data.get('transcript_path')
    cwd = input_data.get('cwd', os.getcwd())
    
    # Get workspace info - prefer project_dir over cwd for project name
    workspace = input_data.get('workspace', {})
    project_dir = workspace.get('project_dir', '') if isinstance(workspace, dict) else ''
    current_dir = workspace.get('current_dir', cwd) if isinstance(workspace, dict) else cwd
    
    # Determine project name: prefer project_dir, fall back to cwd
    if project_dir:
        project_name = os.path.basename(project_dir)
    else:
        project_name = os.path.basename(cwd) if cwd else 'Unknown'
    
    # Extract session title from transcript
    session_title = extract_session_title(transcript_path)
    
    # Fallback title if transcript is empty or doesn't exist yet
    if not session_title:
        session_title = f"Session in {project_name}"
    
    # Get terminal identity
    terminal = get_terminal_identity()
    terminal_key = build_terminal_key(terminal)

    # Detect git info from project directory
    git_dir = project_dir or current_dir or cwd
    git_info = detect_git_info(git_dir)

    # Build registration payload
    registration = {
        "event": "session_start",
        "timestamp": int(time.time() * 1000),
        "session_id": session_id,
        "session_title": session_title,
        "transcript_path": transcript_path,
        "cwd": current_dir or cwd,
        "project": project_name,
        "project_dir": project_dir,
        "model": input_data.get('model'),
        "source": input_data.get('source', 'startup'),
        "terminal": terminal,
        "terminal_key": terminal_key,
        "git_branch": git_info.get('git_branch', ''),
        "git_worktree": git_info.get('git_worktree', ''),
        "git_repo_root": git_info.get('git_repo_root', ''),
    }
    
    # Send to server, fallback to file if unavailable
    if not send_to_server(registration):
        write_fallback(registration)


if __name__ == '__main__':
    main()
