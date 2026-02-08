#!/usr/bin/env python3
"""
Jacques statusLine Script (Cross-Platform)

Receives JSON from Claude Code's statusLine feature via stdin.
Extracts session_id and context_window data.
Sends context update to Jacques server via IPC.
Displays abbreviated status for Claude Code's status bar.

Replaces statusline.sh — works on macOS, Linux, and Windows.
"""
import json
import os
import sys
import time
import platform
import tempfile
import subprocess

# Add adapters directory to path for base.py imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from adapters.base import BaseAdapter


# ============================================================
# Cache Utilities
# ============================================================

TMPDIR = tempfile.gettempdir()


def cache_path(prefix: str, key: str) -> str:
    """Build a cache file path in the temp directory."""
    safe_key = key.replace('/', '-').replace('\\', '-').replace(':', '-')
    return os.path.join(TMPDIR, f'jacques-{prefix}-{safe_key}.cache')


def read_cache(path: str, max_age_seconds: float) -> str | None:
    """Read a cache file if it exists and is fresh enough."""
    try:
        if not os.path.isfile(path):
            return None
        mtime = os.path.getmtime(path)
        age = time.time() - mtime
        if age > max_age_seconds:
            return None
        with open(path, 'r') as f:
            return f.read()
    except Exception:
        return None


def write_cache(path: str, content: str) -> None:
    """Write content to a cache file."""
    try:
        with open(path, 'w') as f:
            f.write(content)
    except Exception:
        pass


# ============================================================
# Git Detection (with 60s cache)
# ============================================================

def detect_git_info(project_dir: str) -> dict:
    """
    Detect git branch, worktree name, and repo root.
    Uses git-detect.sh if available, falls back to inline git commands.
    Results cached for 60 seconds.
    """
    result = {'git_branch': '', 'git_worktree': '', 'git_repo_root': ''}

    if not project_dir or not os.path.isdir(project_dir):
        return result

    # Check cache
    cp = cache_path('git', project_dir)
    cached = read_cache(cp, 60)
    if cached is not None:
        lines = cached.split('\n')
        result['git_branch'] = lines[0] if len(lines) > 0 else ''
        result['git_worktree'] = lines[1] if len(lines) > 1 else ''
        result['git_repo_root'] = lines[2] if len(lines) > 2 else ''
        return result

    # Try git-detect.sh first (Unix only)
    if platform.system() != 'Windows':
        script_path = os.path.join(SCRIPT_DIR, 'git-detect.sh')
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
                    write_cache(cp, f"{result['git_branch']}\n{result['git_worktree']}\n{result['git_repo_root']}")
                    return result
            except Exception:
                pass

    # Fallback: inline git detection (cross-platform)
    try:
        proc = subprocess.run(
            ['git', '-C', project_dir, 'rev-parse', '--abbrev-ref', 'HEAD', '--git-common-dir'],
            capture_output=True, text=True, timeout=5
        )
        if proc.returncode == 0:
            lines = proc.stdout.strip().split('\n')
            if len(lines) >= 2:
                result['git_branch'] = lines[0]
                common = lines[1]
                if common == '.git':
                    result['git_repo_root'] = os.path.realpath(project_dir)
                elif common:
                    result['git_repo_root'] = os.path.dirname(os.path.realpath(
                        os.path.join(project_dir, common)
                    ))
                    result['git_worktree'] = os.path.basename(project_dir)
    except Exception:
        pass

    write_cache(cp, f"{result['git_branch']}\n{result['git_worktree']}\n{result['git_repo_root']}")
    return result


# ============================================================
# Session Title Extraction (with 5-min cache)
# ============================================================

def extract_session_title(session_id: str, transcript_path: str) -> str:
    """
    Extract session title from transcript.
    Sources (in priority order):
      1. sessions-index.json (Claude's resume list title)
      2. Last summary entry in transcript
      3. First real user message (truncated to 50 chars)
    Cached for 5 minutes.
    """
    if not session_id:
        return ''

    # Check cache
    cp = cache_path('title', session_id)
    cached = read_cache(cp, 300)
    if cached is not None:
        return cached

    title = ''

    # Source 1: sessions-index.json
    if transcript_path and session_id:
        transcript_dir = os.path.dirname(transcript_path)
        index_path = os.path.join(transcript_dir, 'sessions-index.json')
        if os.path.isfile(index_path):
            try:
                with open(index_path, 'r') as f:
                    index_data = json.load(f)
                for entry in index_data.get('entries', []):
                    if entry.get('sessionId') == session_id:
                        title = entry.get('summary', '')
                        break
            except Exception:
                pass

    # Source 2: Last summary entry in transcript
    if not title and transcript_path and os.path.isfile(transcript_path):
        try:
            with open(transcript_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if '"type":"summary"' in line or '"type": "summary"' in line:
                        try:
                            entry = json.loads(line)
                            s = entry.get('summary', '')
                            if s:
                                title = s
                        except json.JSONDecodeError:
                            pass
        except Exception:
            pass

    # Source 3: First real user message
    if not title and transcript_path and os.path.isfile(transcript_path):
        try:
            with open(transcript_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if '"type":"user"' not in line and '"type": "user"' not in line:
                        continue
                    try:
                        entry = json.loads(line)
                        content = ''
                        msg = entry.get('message', {})
                        if isinstance(msg, dict):
                            content = msg.get('content', '')
                        if not content or not isinstance(content, str):
                            continue
                        # Skip internal Claude Code messages
                        first_char = content.strip()[:1]
                        if first_char in ('<', '['):
                            continue
                        title = content.strip().replace('\n', ' ')[:50] + '...'
                        break
                    except json.JSONDecodeError:
                        continue
        except Exception:
            pass

    # Cache the result
    if title:
        write_cache(cp, title)

    return title


# ============================================================
# Auto-Compact Settings (with 5-min cache)
# ============================================================

def read_autocompact_settings() -> dict:
    """
    Read auto-compact settings from Claude's settings.json.
    Cached for 5 minutes.
    """
    settings = {
        'enabled': True,
        'threshold': int(os.environ.get('CLAUDE_AUTOCOMPACT_PCT_OVERRIDE', '95')),
        'bug_threshold': None,
    }

    cp = os.path.join(TMPDIR, 'jacques-settings.cache')
    cached = read_cache(cp, 300)
    if cached is not None:
        parts = cached.split('|')
        if len(parts) >= 3:
            settings['enabled'] = parts[0] == 'true'
            try:
                settings['threshold'] = int(parts[1])
            except ValueError:
                pass
            settings['bug_threshold'] = int(parts[2]) if parts[2] != 'null' else None
            return settings

    # Read from Claude settings.json
    # Try CLAUDE_CONFIG_DIR first, then default ~/.claude
    claude_dir = os.environ.get('CLAUDE_CONFIG_DIR', os.path.join(os.path.expanduser('~'), '.claude'))
    settings_path = os.path.join(claude_dir, 'settings.json')

    if os.path.isfile(settings_path):
        try:
            with open(settings_path, 'r') as f:
                data = json.load(f)
            ac = data.get('autoCompact')
            if ac is False:
                settings['enabled'] = False
                settings['bug_threshold'] = 78
        except Exception:
            pass

    # Cache
    enabled_str = 'true' if settings['enabled'] else 'false'
    bug_str = str(settings['bug_threshold']) if settings['bug_threshold'] is not None else 'null'
    write_cache(cp, f"{enabled_str}|{settings['threshold']}|{bug_str}")

    return settings


# ============================================================
# Terminal Key
# ============================================================

def build_terminal_key() -> str:
    """Build a terminal key from environment variables."""
    iterm = os.environ.get('ITERM_SESSION_ID', '')
    kitty = os.environ.get('KITTY_WINDOW_ID', '')
    wezterm = os.environ.get('WEZTERM_PANE', '')
    wt = os.environ.get('WT_SESSION', '')
    term_session = os.environ.get('TERM_SESSION_ID', '')

    if iterm:
        return f'ITERM:{iterm}'
    if kitty:
        return f'KITTY:{kitty}'
    if wezterm:
        return f'WEZTERM:{wezterm}'
    if wt:
        return f'WT:{wt}'
    if term_session:
        return f'TERM:{term_session}'
    return ''


# ============================================================
# IPC Send
# ============================================================

def send_to_server(payload: dict) -> bool:
    """Send payload to Jacques server via IPC (Unix socket or Windows Named Pipe)."""
    import socket as sock_mod

    is_windows = platform.system() == 'Windows'
    socket_path = os.environ.get('JACQUES_SOCKET_PATH',
        r'\\.\pipe\jacques' if is_windows else '/tmp/jacques.sock')

    try:
        data = json.dumps(payload).encode() + b'\n'
        if is_windows:
            with open(socket_path, 'wb') as pipe:
                pipe.write(data)
        else:
            # Check if socket exists before connecting
            if not os.path.exists(socket_path):
                return False
            s = sock_mod.socket(sock_mod.AF_UNIX, sock_mod.SOCK_STREAM)
            s.settimeout(1.0)
            s.connect(socket_path)
            s.sendall(data)
            s.close()
        return True
    except Exception:
        return False


# ============================================================
# Main
# ============================================================

def main():
    # Skip if running as subprocess or JACQUES_SKIP=1
    if os.environ.get('JACQUES_SUBPROCESS') == '1':
        return
    if os.environ.get('JACQUES_SKIP') == '1':
        return
    skip_file = os.path.join(os.path.expanduser('~'), '.jacques', 'skip')
    if os.path.isfile(skip_file):
        return

    # Read JSON from stdin
    try:
        input_data = json.load(sys.stdin)
    except (json.JSONDecodeError, Exception):
        return

    if not input_data:
        return

    # Timestamp in milliseconds
    now = int(time.time() * 1000)

    # Extract fields
    session_id = input_data.get('session_id', '')
    ctx = input_data.get('context_window', {})
    used_pct = ctx.get('used_percentage', 0)
    remaining_pct = ctx.get('remaining_percentage', 100)
    ctx_size = ctx.get('context_window_size', 0)
    total_input = ctx.get('total_input_tokens', 0)
    total_output = ctx.get('total_output_tokens', 0)

    model_data = input_data.get('model', {})
    model = model_data.get('id', 'unknown') if isinstance(model_data, dict) else 'unknown'
    model_display = model_data.get('display_name', 'Unknown') if isinstance(model_data, dict) else 'Unknown'

    workspace = input_data.get('workspace', {})
    cwd = workspace.get('current_dir', '') or input_data.get('cwd', '') if isinstance(workspace, dict) else input_data.get('cwd', '')
    project_dir = workspace.get('project_dir', '') if isinstance(workspace, dict) else ''
    transcript_path = input_data.get('transcript_path', '')

    # Git detection
    git_dir = project_dir or cwd
    git_info = detect_git_info(git_dir) if git_dir else {'git_branch': '', 'git_worktree': '', 'git_repo_root': ''}

    # Session title
    session_title = extract_session_title(session_id, transcript_path)

    # Auto-compact settings
    ac = read_autocompact_settings()

    # If no session_id, just output a placeholder
    if not session_id:
        sys.stdout.write('ctx:?%')
        return

    # Terminal key
    terminal_key = build_terminal_key()

    # Build payload
    payload = {
        'event': 'context_update',
        'session_id': session_id,
        'used_percentage': used_pct,
        'remaining_percentage': remaining_pct,
        'context_window_size': ctx_size,
        'total_input_tokens': total_input,
        'total_output_tokens': total_output,
        'model': model,
        'model_display_name': model_display,
        'cwd': cwd,
        'project_dir': project_dir,
        'timestamp': now,
        'autocompact': {
            'enabled': ac['enabled'],
            'threshold': ac['threshold'],
            'bug_threshold': ac['bug_threshold'],
        },
        'terminal_key': terminal_key,
        'session_title': session_title,
        'transcript_path': transcript_path,
        'git_branch': git_info['git_branch'],
        'git_worktree': git_info['git_worktree'],
        'git_repo_root': git_info['git_repo_root'],
    }

    # Send to server (non-blocking — don't block Claude Code)
    send_to_server(payload)

    # Output status line
    used_int = int(used_pct) if used_pct else 0

    git_part = f' @{git_info["git_branch"]}' if git_info['git_branch'] else ''

    if ac['enabled']:
        ac_part = f'ON@{ac["threshold"]}%'
    else:
        ac_part = 'OFF'

    sys.stdout.write(f'[{model_display}] ctx:{used_int}%{git_part} [AC:{ac_part}]')


if __name__ == '__main__':
    main()
