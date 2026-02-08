#!/usr/bin/env python3
"""
base.py - Base Adapter for Jacques Source Integration

Provides shared functionality for all source adapters:
- Unix socket communication with Jacques server
- JSON input parsing with error handling
- Common payload building
- Session title extraction from transcripts
- Fallback file writing when server unavailable

All source-specific adapters (ClaudeCodeAdapter, CursorAdapter, etc.)
should extend this base class.
"""
import json
import sys
import os
import socket
import time
import platform
import tempfile
from pathlib import Path
from typing import Optional, Any
from abc import ABC, abstractmethod


class BaseAdapter(ABC):
    """
    Abstract base class for Jacques source adapters.
    
    Provides common functionality for:
    - Sending events to the Jacques server via Unix socket
    - Parsing JSON input from stdin
    - Building normalized event payloads
    - Extracting session titles from transcripts
    
    Subclasses must implement:
    - source: str property identifying the source (e.g., 'claude_code', 'cursor')
    - get_session_id(input_data): Extract session ID from tool-specific input
    - get_project_path(input_data): Extract project path from tool-specific input
    """
    
    DEFAULT_SOCKET_PATH = (
        r'\\.\pipe\jacques' if platform.system() == 'Windows'
        else os.environ.get('JACQUES_SOCKET_PATH', '/tmp/jacques.sock')
    )
    DEFAULT_TIMEOUT = 1.0
    FALLBACK_PATH = Path.home() / '.jacques' / 'pending-events.jsonl'
    
    @property
    @abstractmethod
    def source(self) -> str:
        """Unique identifier for this source (e.g., 'claude_code', 'cursor')."""
        pass
    
    @abstractmethod
    def get_session_id(self, input_data: dict) -> Optional[str]:
        """Extract session ID from tool-specific input format."""
        pass
    
    @abstractmethod
    def get_project_path(self, input_data: dict) -> Optional[str]:
        """Extract project path from tool-specific input format."""
        pass
    
    # =========================================================================
    # Input Parsing
    # =========================================================================
    
    def parse_input(self) -> Optional[dict]:
        """
        Parse JSON input from stdin with error handling.
        
        Returns:
            Parsed dict if successful, None if parsing fails.
        """
        try:
            return json.load(sys.stdin)
        except json.JSONDecodeError as e:
            self._log_error(f"Invalid JSON input: {e}")
            return None
        except Exception as e:
            self._log_error(f"Error reading input: {e}")
            return None
    
    def validate_session_id(self, input_data: dict) -> Optional[str]:
        """
        Extract and validate session ID from input data.
        
        Returns:
            Session ID string if valid, None otherwise.
        """
        session_id = self.get_session_id(input_data)
        if not session_id:
            self._log_error("No session_id in input")
            return None
        return session_id
    
    # =========================================================================
    # Server Communication
    # =========================================================================
    
    def send_to_server(
        self,
        payload: dict,
        socket_path: str = None,
        timeout: float = None
    ) -> bool:
        """
        Send payload to Jacques server via IPC.

        Uses Unix socket on macOS/Linux, Named Pipe on Windows.

        Args:
            payload: Dict to send as JSON
            socket_path: Path to IPC socket (default: platform-specific)
            timeout: Socket timeout in seconds (default: 1.0)

        Returns:
            True if sent successfully, False otherwise.
        """
        socket_path = socket_path or self.DEFAULT_SOCKET_PATH
        timeout = timeout or self.DEFAULT_TIMEOUT
        data = json.dumps(payload).encode() + b'\n'

        try:
            if platform.system() == 'Windows':
                # Windows: write directly to Named Pipe as a file
                with open(socket_path, 'wb') as pipe:
                    pipe.write(data)
            else:
                # Unix: use AF_UNIX socket
                sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                sock.settimeout(timeout)
                sock.connect(socket_path)
                sock.sendall(data)
                sock.close()
            return True
        except Exception as e:
            self._log_error(f"Failed to send to server: {e}")
            return False
    
    def write_fallback(self, payload: dict) -> bool:
        """
        Write payload to fallback file when server is unavailable.
        
        The fallback file stores events as newline-delimited JSON (JSONL).
        These can be replayed when the server comes back online.
        
        Args:
            payload: Dict to write as JSON
            
        Returns:
            True if written successfully, False otherwise.
        """
        try:
            self.FALLBACK_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(self.FALLBACK_PATH, 'a') as f:
                f.write(json.dumps(payload) + '\n')
            return True
        except Exception as e:
            self._log_error(f"Failed to write fallback: {e}")
            return False
    
    def send_event(self, payload: dict, use_fallback: bool = True) -> bool:
        """
        Send event to server with optional fallback.
        
        Args:
            payload: Event payload to send
            use_fallback: If True, write to fallback file on failure
            
        Returns:
            True if sent or written to fallback successfully.
        """
        if self.send_to_server(payload):
            return True
        if use_fallback:
            return self.write_fallback(payload)
        return False
    
    # =========================================================================
    # Payload Building
    # =========================================================================
    
    def build_base_payload(
        self,
        event: str,
        session_id: str,
        **extra_fields
    ) -> dict:
        """
        Build base payload structure for any event type.
        
        Args:
            event: Event type (session_start, activity, idle, session_end, context_update)
            session_id: Session identifier
            **extra_fields: Additional fields to include
            
        Returns:
            Dict with base event structure plus extra fields.
        """
        payload = {
            "event": event,
            "timestamp": int(time.time() * 1000),  # Convert to milliseconds
            "session_id": session_id,
            "source": self.source,
        }
        payload.update(extra_fields)
        return payload
    
    # =========================================================================
    # Project Info Extraction
    # =========================================================================
    
    def extract_project_info(self, input_data: dict) -> dict:
        """
        Extract project name and path from input data.
        
        Returns dict with:
            - project: Project name (basename of path)
            - project_path: Full path to project
            - cwd: Current working directory
        """
        project_path = self.get_project_path(input_data) or ''
        cwd = input_data.get('cwd', os.getcwd())
        
        if project_path:
            project_name = os.path.basename(project_path)
        elif cwd:
            project_name = os.path.basename(cwd)
        else:
            project_name = 'Unknown'
        
        return {
            'project': project_name,
            'project_path': project_path,
            'cwd': cwd,
        }
    
    # =========================================================================
    # Session Title Extraction
    # =========================================================================
    
    def extract_session_title(self, transcript_path: Optional[str]) -> Optional[str]:
        """
        Extract session title from Claude Code transcript file.
        
        Checks for (in priority order):
        1. Explicit 'title' field
        2. 'summary' type entries
        3. First user message (truncated to 80 chars)
        
        Args:
            transcript_path: Path to the transcript JSONL file
            
        Returns:
            Extracted title string, or None if not found.
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
                lines = f.readlines()
            
            # Check recent lines first for updated title/summary
            recent_lines = lines[-100:] if len(lines) > 100 else lines
            
            for line in recent_lines:
                try:
                    entry = json.loads(line.strip())
                    
                    # Check for explicit title
                    if 'title' in entry:
                        title = entry['title']
                    
                    # Check for summary type
                    if entry.get('type') == 'summary':
                        summary_content = entry.get('summary', '')
                        if summary_content:
                            summary_text = summary_content.split('.')[0][:80]
                            
                except json.JSONDecodeError:
                    continue
            
            # Check first user message if no title found
            if not title and not summary_text:
                for line in lines[:20]:
                    try:
                        entry = json.loads(line.strip())
                        if entry.get('type') == 'human':
                            msg = entry.get('message', {})
                            content = msg.get('content', '') if isinstance(msg, dict) else ''
                            if isinstance(content, str) and content:
                                first_user_message = content.strip()[:80]
                                if len(content) > 80:
                                    first_user_message += '...'
                                break
                    except:
                        continue
                        
        except Exception as e:
            self._log_error(f"Error reading transcript: {e}")
        
        return title or summary_text or first_user_message
    
    def generate_fallback_title(self, project_name: str) -> str:
        """Generate a fallback title when transcript is empty/unavailable."""
        return f"Session in {project_name}"
    
    # =========================================================================
    # Terminal Identity
    # =========================================================================
    
    def get_terminal_identity(self) -> dict:
        """
        Get terminal-specific identifiers from environment and system.

        Returns dict with terminal identification info for session tracking.
        Cross-platform: TTY detection skipped on Windows (no TTY concept).
        """
        tty = None

        # Try to get TTY (Unix only — Windows has no TTY concept)
        if platform.system() != 'Windows':
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
            "wt_session": os.environ.get("WT_SESSION"),
            "vscode_injection": os.environ.get("VSCODE_INJECTION"),
            "windowid": os.environ.get("WINDOWID"),
            "term": os.environ.get("TERM"),
        }
    
    def build_terminal_key(self, terminal: dict) -> str:
        """
        Build a unique key for this terminal instance.

        Priority: iTerm > Kitty > WezTerm > Windows Terminal > TTY > PID
        """
        if terminal.get("iterm_session_id"):
            return f"ITERM:{terminal['iterm_session_id']}"
        if terminal.get("kitty_window_id"):
            return f"KITTY:{terminal['kitty_window_id']}"
        if terminal.get("wezterm_pane"):
            return f"WEZTERM:{terminal['wezterm_pane']}"
        if terminal.get("wt_session"):
            return f"WT:{terminal['wt_session']}"
        if terminal.get("tty"):
            return f"TTY:{terminal['tty']}"
        if terminal.get("terminal_pid"):
            return f"PID:{terminal['terminal_pid']}"
        return f"UNKNOWN:{time.time()}"
    
    # =========================================================================
    # Git Detection
    # =========================================================================

    def detect_git_info(self, project_path: str) -> dict:
        """
        Detect git branch, worktree, and repo root from project directory.

        Uses hooks/git-detect.sh as single source of truth.
        Falls back to inline detection if script not found.

        Returns dict with:
            - git_branch: Current branch name (empty string if not a git repo)
            - git_worktree: Worktree name if in a worktree (empty string otherwise)
            - git_repo_root: Main worktree root path (empty string if not a git repo)
        """
        result = {'git_branch': '', 'git_worktree': '', 'git_repo_root': ''}
        if not project_path or not os.path.isdir(project_path):
            return result
        try:
            import subprocess
            # Try git-detect.sh first (single source of truth)
            script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            script_path = os.path.join(script_dir, 'git-detect.sh')
            if os.path.isfile(script_path) and os.access(script_path, os.X_OK):
                proc = subprocess.run(
                    [script_path, project_path],
                    capture_output=True, text=True, timeout=5
                )
                if proc.returncode == 0:
                    lines = proc.stdout.split('\n')
                    result['git_branch'] = lines[0] if len(lines) > 0 else ''
                    result['git_worktree'] = lines[1] if len(lines) > 1 else ''
                    result['git_repo_root'] = lines[2] if len(lines) > 2 else ''
                    return result

            # Fallback: inline detection (same algorithm as git-detect.sh)
            proc = subprocess.run(
                ['git', '-C', project_path, 'rev-parse', '--abbrev-ref', 'HEAD', '--git-common-dir'],
                capture_output=True, text=True, timeout=5
            )
            if proc.returncode == 0:
                lines = proc.stdout.strip().split('\n')
                if len(lines) >= 2:
                    result['git_branch'] = lines[0]
                    common = lines[1]
                    if common == '.git':
                        result['git_repo_root'] = os.path.realpath(project_path)
                    elif common:
                        result['git_repo_root'] = os.path.dirname(common)
                        result['git_worktree'] = os.path.basename(project_path)
        except Exception:
            pass
        return result

    # =========================================================================
    # Debug Logging
    # =========================================================================
    
    def log_debug(self, input_data: dict, hook_name: str) -> None:
        """
        Log input data for debugging purposes.

        Writes to {tempdir}/jacques-hook-debug.log
        """
        try:
            log_path = os.path.join(tempfile.gettempdir(), 'jacques-hook-debug.log')
            with open(log_path, 'a') as f:
                f.write(f"\n=== {hook_name} [{self.source}] {time.strftime('%Y-%m-%d %H:%M:%S')} ===\n")
                f.write(json.dumps(input_data, indent=2))
                f.write("\n")
        except:
            pass
    
    def _log_error(self, message: str) -> None:
        """Log error message to stderr."""
        print(f"[jacques:{self.source}] {message}", file=sys.stderr)
