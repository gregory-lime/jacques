#!/usr/bin/env python3
"""
cursor.py - Cursor Native AI Adapter for Jacques

Handles events from Cursor's native AI (sidebar chat).

Field Mappings:
- session_id: conversation_id
- project_path: workspace_roots[0]
- context_metrics: from preCompact event

Hook Events (configured in .cursor/hooks.json):
- sessionStart → session_start
- sessionEnd → session_end
- postToolUse → activity
- preCompact → context_update (contains context metrics!)

Key Discovery:
Cursor's preCompact event provides context metrics that allow us to display
context usage percentage just like Claude Code CLI!
"""
import os
from typing import Optional
from .base import BaseAdapter


class CursorAdapter(BaseAdapter):
    """
    Adapter for Cursor Native AI sessions.
    
    Cursor provides session data via hooks configured in
    .cursor/hooks.json (per-project) or global Cursor settings.
    
    Note: Cursor uses different field names than Claude Code:
    - conversation_id instead of session_id
    - workspace_roots[] instead of workspace.project_dir
    """
    
    @property
    def source(self) -> str:
        return 'cursor'
    
    def get_session_id(self, input_data: dict) -> Optional[str]:
        """
        Extract session ID from Cursor input.
        
        Cursor uses 'conversation_id' as the session identifier.
        """
        return input_data.get('conversation_id')
    
    def get_project_path(self, input_data: dict) -> Optional[str]:
        """
        Extract project path from Cursor input.
        
        Cursor provides workspace_roots as an array of open workspace paths.
        We use the first one as the primary project path.
        """
        workspace_roots = input_data.get('workspace_roots', [])
        if workspace_roots and isinstance(workspace_roots, list):
            return workspace_roots[0]
        return ''
    
    def get_model(self, input_data: dict) -> Optional[str]:
        """Extract model name from Cursor input."""
        # Cursor may provide model info in different fields
        return input_data.get('model') or input_data.get('model_name')
    
    # =========================================================================
    # Session Start Payload
    # =========================================================================
    
    def build_session_start_payload(self, input_data: dict) -> Optional[dict]:
        """
        Build payload for session_start event.
        
        Called from sessionStart hook (session-start.py).
        """
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None
        
        # Extract project info
        project_info = self.extract_project_info(input_data)
        
        # Cursor doesn't have transcript files like Claude Code
        # Generate title from project name
        session_title = self.generate_fallback_title(project_info['project'])
        
        # Get terminal identity (useful for identification)
        terminal = self.get_terminal_identity()
        terminal_key = self.build_terminal_key(terminal)
        
        return self.build_base_payload(
            event='session_start',
            session_id=session_id,
            session_title=session_title,
            transcript_path=None,  # Cursor doesn't have transcripts
            cwd=project_info['cwd'],
            project=project_info['project'],
            project_dir=project_info['project_path'],
            model=self.get_model(input_data),
            hook_source='startup',
            terminal=terminal,
            terminal_key=terminal_key,
            # Cursor-specific fields
            workspace_roots=input_data.get('workspace_roots', []),
        )
    
    # =========================================================================
    # Context Estimate Payload (from token estimation)
    # =========================================================================
    
    def build_context_estimate_payload(
        self, 
        input_data: dict, 
        estimated_tokens: int,
        model: str = None
    ) -> Optional[dict]:
        """
        Build payload for context_update event from token estimation.
        
        Used by afterAgentResponse hook to send estimated context metrics.
        
        Args:
            input_data: Hook input data
            estimated_tokens: Token count estimated from transcript
            model: Model name (for context window lookup)
            
        Returns:
            context_update payload with is_estimate=True flag.
        """
        from . import tokenizer
        
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None
        
        # Get model from input or use provided
        if not model:
            model = self.get_model(input_data)
        
        # Calculate context metrics
        metrics = tokenizer.calculate_context_metrics(estimated_tokens, model)
        
        # Get project info
        project_info = self.extract_project_info(input_data)
        
        return self.build_base_payload(
            event='context_update',
            session_id=session_id,
            used_percentage=metrics['used_percentage'],
            remaining_percentage=metrics['remaining_percentage'],
            context_window_size=metrics['context_window_size'],
            total_input_tokens=estimated_tokens,
            total_output_tokens=0,
            is_estimate=True,  # Flag to indicate this is an estimate
            cwd=project_info['cwd'],
            project_dir=project_info['project_path'],
        )
    
    # =========================================================================
    # Pre-Compact Payload (Context Metrics!)
    # =========================================================================
    
    def build_pre_compact_payload(self, input_data: dict) -> Optional[dict]:
        """
        Build payload for context_update event from preCompact.
        
        This is the KEY event for Cursor that provides context metrics!
        
        Expected input fields from preCompact:
        - context_usage_percent: Percentage of context used (0-100)
        - context_tokens: Current token count
        - context_window_size: Maximum context window
        
        NOTE: The 'model' field in preCompact is the SUMMARIZATION model
        (typically gemini-2.5-flash), NOT the user's selected chat model.
        We don't update model here - it should come from sessionStart.
        """
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None
        
        # Extract context metrics
        used_percentage = input_data.get('context_usage_percent', 0)
        context_tokens = input_data.get('context_tokens', 0)
        context_window_size = input_data.get('context_window_size', 0)
        
        # Calculate remaining percentage
        remaining_percentage = 100 - used_percentage if used_percentage else 100
        
        # Get project info for cwd
        project_info = self.extract_project_info(input_data)
        
        # NOTE: Don't use model from preCompact - it's the summarization model
        # (gemini-2.5-flash), not the user's chat model. Leave model empty
        # so it doesn't overwrite the correct model from sessionStart.
        
        return self.build_base_payload(
            event='context_update',
            session_id=session_id,
            used_percentage=used_percentage,
            remaining_percentage=remaining_percentage,
            context_window_size=context_window_size,
            total_input_tokens=context_tokens,
            total_output_tokens=0,  # Cursor doesn't provide this
            # Don't include model - let sessionStart model persist
            cwd=project_info['cwd'],
            project_dir=project_info['project_path'],
        )
    
    # =========================================================================
    # Activity Payload
    # =========================================================================
    
    def build_activity_payload(self, input_data: dict) -> Optional[dict]:
        """
        Build payload for activity event.
        
        Called from postToolUse hook (post-tool-use.py).
        """
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None
        
        # Extract project info for session title
        project_info = self.extract_project_info(input_data)
        session_title = self.generate_fallback_title(project_info['project'])
        
        tool_name = input_data.get('tool_name', 'unknown')
        
        return self.build_base_payload(
            event='activity',
            session_id=session_id,
            session_title=session_title,
            tool_name=tool_name,
            terminal_pid=os.getppid(),
        )
    
    # =========================================================================
    # Session End Payload
    # =========================================================================
    
    def build_session_end_payload(self, input_data: dict) -> Optional[dict]:
        """
        Build payload for session_end event.
        
        Called from sessionEnd hook (session-end.py).
        """
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None
        
        return self.build_base_payload(
            event='session_end',
            session_id=session_id,
            terminal_pid=os.getppid(),
        )
