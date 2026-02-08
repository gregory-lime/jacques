#!/usr/bin/env python3
"""
template.py - Template Adapter for New Jacques Sources

=============================================================================
HOW TO ADD A NEW AI TOOL TO JACQUES
=============================================================================

This template shows how to create an adapter for a new AI tool.
Follow these steps to add support for a new source:

1. COPY this file and rename it (e.g., 'vscode.py')
2. UPDATE the class name and source property
3. IMPLEMENT the required methods:
   - get_session_id(): Map your tool's session identifier field
   - get_project_path(): Map your tool's project path field
4. CREATE hook scripts in hooks/{your-source}/
5. UPDATE hooks/adapters/__init__.py to export your adapter
6. ADD installation support in hooks/install.py

=============================================================================
FIELD MAPPING REFERENCE
=============================================================================

Different AI tools use different field names. Here's how existing tools map:

| Concept         | Claude Code CLI      | Cursor Native         | Your Tool     |
|-----------------|---------------------|----------------------|---------------|
| Session ID      | session_id          | conversation_id      | ???           |
| Project Path    | workspace.project_dir| workspace_roots[0]  | ???           |
| Model Name      | model               | model_name           | ???           |
| Transcript      | transcript_path     | (none)               | ???           |
| Context %       | statusLine event    | preCompact event     | ???           |

=============================================================================
"""
from typing import Optional
from .base import BaseAdapter


class TemplateAdapter(BaseAdapter):
    """
    Template adapter for a new AI tool.
    
    Replace 'template' with your tool name (e.g., 'vscode', 'windsurf').
    """
    
    @property
    def source(self) -> str:
        """
        REQUIRED: Unique identifier for this source.
        
        This appears in the Jacques dashboard and is used for filtering.
        Examples: 'claude_code', 'cursor', 'vscode', 'windsurf'
        """
        return 'template'  # TODO: Change this!
    
    def get_session_id(self, input_data: dict) -> Optional[str]:
        """
        REQUIRED: Extract session ID from your tool's input format.
        
        Find out what field your tool uses for the session/conversation ID
        and extract it here.
        
        Examples:
        - Claude Code: input_data.get('session_id')
        - Cursor: input_data.get('conversation_id')
        """
        # TODO: Implement for your tool
        return input_data.get('session_id')
    
    def get_project_path(self, input_data: dict) -> Optional[str]:
        """
        REQUIRED: Extract project path from your tool's input format.
        
        Find out what field your tool uses for the workspace/project path
        and extract it here.
        
        Examples:
        - Claude Code: input_data.get('workspace', {}).get('project_dir')
        - Cursor: input_data.get('workspace_roots', [])[0]
        """
        # TODO: Implement for your tool
        return input_data.get('project_path', '')
    
    # =========================================================================
    # HOOK METHODS - Implement based on your tool's available hooks
    # =========================================================================
    
    def build_session_start_payload(self, input_data: dict) -> Optional[dict]:
        """
        Build payload for session_start event.
        
        This is called when a new AI session begins.
        
        Typical hook names:
        - Claude Code: SessionStart
        - Cursor: sessionStart
        """
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None
        
        project_info = self.extract_project_info(input_data)
        
        # Try to extract session title (if your tool supports transcripts)
        transcript_path = input_data.get('transcript_path')
        session_title = self.extract_session_title(transcript_path)
        if not session_title:
            session_title = self.generate_fallback_title(project_info['project'])
        
        terminal = self.get_terminal_identity()
        terminal_key = self.build_terminal_key(terminal)
        
        return self.build_base_payload(
            event='session_start',
            session_id=session_id,
            session_title=session_title,
            transcript_path=transcript_path,
            cwd=project_info['cwd'],
            project=project_info['project'],
            project_dir=project_info['project_path'],
            model=input_data.get('model'),
            hook_source='startup',
            terminal=terminal,
            terminal_key=terminal_key,
        )
    
    def build_activity_payload(self, input_data: dict) -> Optional[dict]:
        """
        Build payload for activity event.
        
        This is called when the AI uses a tool or takes an action.
        
        Typical hook names:
        - Claude Code: PostToolUse
        - Cursor: postToolUse
        """
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None
        
        project_info = self.extract_project_info(input_data)
        session_title = self.generate_fallback_title(project_info['project'])
        
        return self.build_base_payload(
            event='activity',
            session_id=session_id,
            session_title=session_title,
            tool_name=input_data.get('tool_name', 'unknown'),
            terminal_pid=self.get_terminal_identity()['terminal_pid'],
        )
    
    def build_idle_payload(self, input_data: dict) -> Optional[dict]:
        """
        Build payload for idle event.
        
        This is called when the AI is waiting for user input.
        
        Typical hook names:
        - Claude Code: Stop
        - Cursor: (may not have equivalent)
        """
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None
        
        return self.build_base_payload(
            event='idle',
            session_id=session_id,
            terminal_pid=self.get_terminal_identity()['terminal_pid'],
        )
    
    def build_session_end_payload(self, input_data: dict) -> Optional[dict]:
        """
        Build payload for session_end event.
        
        This is called when an AI session ends.
        
        Typical hook names:
        - Claude Code: SessionEnd
        - Cursor: sessionEnd
        """
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None
        
        return self.build_base_payload(
            event='session_end',
            session_id=session_id,
            terminal_pid=self.get_terminal_identity()['terminal_pid'],
        )
    
    def build_context_update_payload(self, input_data: dict) -> Optional[dict]:
        """
        Build payload for context_update event.
        
        OPTIONAL: Only implement if your tool provides context metrics.
        
        This provides real-time context window usage data.
        
        Typical sources:
        - Claude Code: statusLine (shell script, not Python hook)
        - Cursor: preCompact event
        
        If your tool doesn't provide context metrics, Jacques will show
        "N/A" for context percentage, which is fine.
        """
        session_id = self.validate_session_id(input_data)
        if not session_id:
            return None
        
        # TODO: Map your tool's context metric fields
        # Example fields you might find:
        # - context_usage_percent / used_percentage
        # - context_tokens / total_tokens
        # - context_window_size / max_tokens
        
        used_percentage = input_data.get('used_percentage', 0)
        remaining_percentage = 100 - used_percentage
        
        project_info = self.extract_project_info(input_data)
        
        return self.build_base_payload(
            event='context_update',
            session_id=session_id,
            used_percentage=used_percentage,
            remaining_percentage=remaining_percentage,
            context_window_size=input_data.get('context_window_size', 0),
            total_input_tokens=input_data.get('total_input_tokens', 0),
            total_output_tokens=input_data.get('total_output_tokens', 0),
            model=input_data.get('model', 'unknown'),
            model_display_name=input_data.get('model_display_name', 'Unknown'),
            cwd=project_info['cwd'],
            project_dir=project_info['project_path'],
        )


# =============================================================================
# EXAMPLE HOOK SCRIPT
# =============================================================================
#
# Create a file in hooks/{your-source}/session-start.py:
#
#     #!/usr/bin/env python3
#     """Session start hook for {YourTool}."""
#     import sys
#     sys.path.insert(0, str(Path(__file__).parent.parent))
#     from adapters.template import TemplateAdapter  # Change to your adapter
#
#     def main():
#         adapter = TemplateAdapter()  # Change to your adapter
#         input_data = adapter.parse_input()
#         if not input_data:
#             sys.exit(0)
#         
#         adapter.log_debug(input_data, 'session-start')
#         payload = adapter.build_session_start_payload(input_data)
#         if payload:
#             adapter.send_event(payload, use_fallback=True)
#
#     if __name__ == '__main__':
#         main()
#
# =============================================================================
# TESTING YOUR ADAPTER
# =============================================================================
#
# 1. Start Jacques server:
#    cd server && npm run start
#
# 2. Test with sample input:
#    echo '{"session_id": "test-123", "project_path": "/my/project"}' | \
#    python3 hooks/{your-source}/session-start.py
#
# 3. Check server logs or dashboard for the session
#
# 4. Run unit tests:
#    python3 -m pytest hooks/adapters/test_adapters.py -v
#
# =============================================================================
