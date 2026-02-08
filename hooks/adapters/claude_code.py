#!/usr/bin/env python3
"""
claude_code.py - Claude Code CLI Adapter for Jacques

Handles events from Claude Code CLI (standalone or in Cursor terminal).

Field Mappings:
- session_id: direct from input
- project_path: workspace.project_dir
- transcript_path: direct from input
- model: direct from input

Hook Events:
- SessionStart → session_start
- PostToolUse → activity
- Stop → idle
- SessionEnd → session_end
- statusLine → context_update (handled by statusline.sh)
"""
import json
import os
from pathlib import Path
from typing import Optional
from .base import BaseAdapter


class ClaudeCodeAdapter(BaseAdapter):
    """
    Adapter for Claude Code CLI sessions.
    
    Claude Code provides session data via hooks configured in
    ~/.claude/settings.json
    """
    
    SETTINGS_PATH = Path.home() / '.claude' / 'settings.json'
    
    @property
    def source(self) -> str:
        return 'claude_code'
    
    # =========================================================================
    # Auto-Compact Settings
    # =========================================================================
    
    def get_autocompact_settings(self) -> dict:
        """
        Read auto-compact settings from Claude Code config.
        
        Checks:
        1. ~/.claude/settings.json for autoCompact field
        2. CLAUDE_AUTOCOMPACT_PCT_OVERRIDE env var for custom threshold
        
        Returns:
            Dict with enabled, threshold, and bug_threshold fields.
        
        Known Bug (Issue #18264):
            Even with autoCompact: false, compaction still triggers at ~78%.
        """
        enabled = True  # Default is enabled
        threshold = 95  # Default threshold
        bug_threshold = None
        
        # Check settings.json
        if self.SETTINGS_PATH.exists():
            try:
                with open(self.SETTINGS_PATH) as f:
                    settings = json.load(f)
                    if 'autoCompact' in settings:
                        enabled = settings['autoCompact']
                        # If disabled, bug may trigger at ~78%
                        if not enabled:
                            bug_threshold = 78
            except (json.JSONDecodeError, IOError):
                pass
        
        # Check env var for custom threshold
        threshold_override = os.environ.get('CLAUDE_AUTOCOMPACT_PCT_OVERRIDE')
        if threshold_override:
            try:
                threshold = int(threshold_override)
            except ValueError:
                pass
        
        return {
            'enabled': enabled,
            'threshold': threshold,
            'bug_threshold': bug_threshold,
        }
    
    def set_autocompact(self, enabled: bool) -> bool:
        """
        Set auto-compact setting in ~/.claude/settings.json.
        
        Args:
            enabled: Whether to enable auto-compact
            
        Returns:
            True if successful, False otherwise.
        """
        try:
            settings = {}
            if self.SETTINGS_PATH.exists():
                try:
                    with open(self.SETTINGS_PATH) as f:
                        settings = json.load(f)
                except (json.JSONDecodeError, IOError):
                    pass
            
            settings['autoCompact'] = enabled
            
            # Ensure parent directory exists
            self.SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
            
            with open(self.SETTINGS_PATH, 'w') as f:
                json.dump(settings, f, indent=2)
            
            return True
        except IOError as e:
            self._log_error(f"Failed to write settings.json: {e}")
            return False
    
    def toggle_autocompact(self) -> dict:
        """
        Toggle auto-compact setting and return new status.
        
        Returns:
            Dict with enabled, threshold, bug_threshold, and warning.
        """
        current = self.get_autocompact_settings()
        new_enabled = not current['enabled']
        
        if self.set_autocompact(new_enabled):
            return {
                'enabled': new_enabled,
                'threshold': current['threshold'],
                'bug_threshold': 78 if not new_enabled else None,
                'warning': 'Known bug: may still trigger at ~78%' if not new_enabled else None,
            }
        
        return current
    
    def get_session_id(self, input_data: dict) -> Optional[str]:
        """Extract session_id directly from Claude Code input."""
        return input_data.get('session_id')
    
    def get_project_path(self, input_data: dict) -> Optional[str]:
        """
        Extract project path from workspace.project_dir.
        
        Claude Code provides workspace info with:
        - workspace.project_dir: The actual project directory
        - workspace.current_dir: Current working directory (may be subdirectory)
        """
        workspace = input_data.get('workspace', {})
        if isinstance(workspace, dict):
            return workspace.get('project_dir', '')
        return ''
    
    def get_cwd(self, input_data: dict) -> str:
        """Get current working directory from input."""
        workspace = input_data.get('workspace', {})
        if isinstance(workspace, dict):
            return workspace.get('current_dir', input_data.get('cwd', ''))
        return input_data.get('cwd', '')
    
    # =========================================================================
    # Session Start Payload
    # =========================================================================
    
    def build_session_start_payload(self, input_data: dict) -> Optional[dict]:
        """
        Build payload for session_start event.
        
        Called from SessionStart hook (register-session.py).
        """
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None
        
        # Extract project info
        project_info = self.extract_project_info(input_data)
        
        # Extract transcript path and session title
        transcript_path = input_data.get('transcript_path')
        session_title = self.extract_session_title(transcript_path)
        
        # Fallback title if transcript empty
        if not session_title:
            session_title = self.generate_fallback_title(project_info['project'])
        
        # Get terminal identity
        terminal = self.get_terminal_identity()
        terminal_key = self.build_terminal_key(terminal)
        
        # Get auto-compact settings
        autocompact = self.get_autocompact_settings()

        # Detect git branch and worktree
        git_info = self.detect_git_info(project_info['project_path'])

        return self.build_base_payload(
            event='session_start',
            session_id=session_id,
            session_title=session_title,
            transcript_path=transcript_path,
            cwd=project_info['cwd'] or self.get_cwd(input_data),
            project=project_info['project'],
            project_dir=project_info['project_path'],
            model=input_data.get('model'),
            hook_source=input_data.get('source', 'startup'),  # startup/resume/clear/compact
            terminal=terminal,
            terminal_key=terminal_key,
            autocompact=autocompact,
            git_branch=git_info['git_branch'],
            git_worktree=git_info['git_worktree'],
            git_repo_root=git_info['git_repo_root'],
            permission_mode=input_data.get('permission_mode'),
        )
    
    # =========================================================================
    # Activity Payload
    # =========================================================================
    
    def build_activity_payload(self, input_data: dict) -> Optional[dict]:
        """
        Build payload for activity event.
        
        Called from PostToolUse hook (report-activity.py).
        """
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None
        
        # Extract project info for fallback title
        project_info = self.extract_project_info(input_data)
        
        # Extract updated session title
        transcript_path = input_data.get('transcript_path')
        session_title = self.extract_session_title(transcript_path)
        
        if not session_title:
            session_title = self.generate_fallback_title(project_info['project'])
        
        tool_name = input_data.get('tool_name', 'unknown')
        
        return self.build_base_payload(
            event='activity',
            session_id=session_id,
            session_title=session_title,
            tool_name=tool_name,
            terminal_pid=self.get_terminal_identity()['terminal_pid'],
            permission_mode=input_data.get('permission_mode'),
        )
    
    # =========================================================================
    # Idle Payload
    # =========================================================================
    
    def build_idle_payload(self, input_data: dict) -> Optional[dict]:
        """
        Build payload for idle event.
        
        Called from Stop hook (session-idle.py).
        """
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None
        
        return self.build_base_payload(
            event='idle',
            session_id=session_id,
            terminal_pid=self.get_terminal_identity()['terminal_pid'],
            permission_mode=input_data.get('permission_mode'),
        )
    
    # =========================================================================
    # Pre-Tool-Use Payload
    # =========================================================================

    def build_pre_tool_use_payload(self, input_data: dict) -> Optional[dict]:
        """
        Build payload for pre_tool_use event.

        Called from PreToolUse hook (pre-tool-use.py).
        """
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None

        return self.build_base_payload(
            event='pre_tool_use',
            session_id=session_id,
            tool_name=input_data.get('tool_name', 'unknown'),
            terminal_pid=self.get_terminal_identity()['terminal_pid'],
            permission_mode=input_data.get('permission_mode'),
        )

    # =========================================================================
    # Session End Payload
    # =========================================================================
    
    def build_session_end_payload(self, input_data: dict) -> Optional[dict]:
        """
        Build payload for session_end event.
        
        Called from SessionEnd hook (unregister-session.py).
        """
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None
        
        return self.build_base_payload(
            event='session_end',
            session_id=session_id,
            terminal_pid=self.get_terminal_identity()['terminal_pid'],
        )
