#!/usr/bin/env python3
"""
test_adapters.py - Unit tests for Jacques Source Adapters

Run with:
  python3 -m pytest hooks/adapters/test_adapters.py -v
  
Or simply:
  python3 hooks/adapters/test_adapters.py
"""
import json
import os
import sys
import tempfile
import socket
import threading
import time
from pathlib import Path
from io import StringIO
from unittest.mock import patch, MagicMock

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from adapters.base import BaseAdapter
from adapters.claude_code import ClaudeCodeAdapter
from adapters.cursor import CursorAdapter


# ============================================================================
# Test Base Adapter
# ============================================================================

class TestBaseAdapter:
    """Tests for BaseAdapter base class."""
    
    def test_build_base_payload(self):
        """Test that build_base_payload creates correct structure."""
        adapter = ClaudeCodeAdapter()  # Use concrete class
        
        payload = adapter.build_base_payload(
            event='test_event',
            session_id='test-123',
            extra_field='extra_value'
        )
        
        assert payload['event'] == 'test_event'
        assert payload['session_id'] == 'test-123'
        assert payload['source'] == 'claude_code'
        assert payload['extra_field'] == 'extra_value'
        assert 'timestamp' in payload
        assert isinstance(payload['timestamp'], (int, float))
    
    def test_extract_project_info_with_project_path(self):
        """Test project info extraction when project path is available."""
        adapter = ClaudeCodeAdapter()
        
        input_data = {
            'workspace': {'project_dir': '/Users/test/my-project'},
            'cwd': '/Users/test/my-project/src'
        }
        
        info = adapter.extract_project_info(input_data)
        
        assert info['project'] == 'my-project'
        assert info['project_path'] == '/Users/test/my-project'
        assert info['cwd'] == '/Users/test/my-project/src'
    
    def test_extract_project_info_fallback_to_cwd(self):
        """Test project info falls back to cwd when project_dir not available."""
        adapter = ClaudeCodeAdapter()
        
        input_data = {
            'cwd': '/Users/test/another-project'
        }
        
        info = adapter.extract_project_info(input_data)
        
        assert info['project'] == 'another-project'
        assert info['cwd'] == '/Users/test/another-project'
    
    def test_generate_fallback_title(self):
        """Test fallback title generation."""
        adapter = ClaudeCodeAdapter()
        
        title = adapter.generate_fallback_title('my-project')
        
        assert title == 'Session in my-project'
    
    def test_extract_session_title_empty_path(self):
        """Test that extract_session_title returns None for empty path."""
        adapter = ClaudeCodeAdapter()
        
        assert adapter.extract_session_title(None) is None
        assert adapter.extract_session_title('') is None
    
    def test_extract_session_title_from_transcript(self):
        """Test extracting session title from transcript file."""
        adapter = ClaudeCodeAdapter()
        
        # Create a temporary transcript file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.jsonl', delete=False) as f:
            f.write('{"type": "human", "message": {"content": "Help me build a web app"}}\n')
            f.write('{"type": "assistant", "message": {"content": "Sure!"}}\n')
            transcript_path = f.name
        
        try:
            title = adapter.extract_session_title(transcript_path)
            assert title == 'Help me build a web app'
        finally:
            os.unlink(transcript_path)
    
    def test_extract_session_title_with_summary(self):
        """Test extracting session title from summary entry."""
        adapter = ClaudeCodeAdapter()
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.jsonl', delete=False) as f:
            f.write('{"type": "human", "message": {"content": "Original message"}}\n')
            f.write('{"type": "summary", "summary": "Building a React dashboard. With charts."}\n')
            transcript_path = f.name
        
        try:
            title = adapter.extract_session_title(transcript_path)
            assert title == 'Building a React dashboard'  # Truncated at first period
        finally:
            os.unlink(transcript_path)
    
    def test_build_terminal_key_iterm(self):
        """Test terminal key generation for iTerm."""
        adapter = ClaudeCodeAdapter()
        
        terminal = {'iterm_session_id': 'abc123', 'tty': '/dev/ttys001'}
        key = adapter.build_terminal_key(terminal)
        
        assert key == 'ITERM:abc123'
    
    def test_build_terminal_key_tty(self):
        """Test terminal key generation fallback to TTY."""
        adapter = ClaudeCodeAdapter()
        
        terminal = {'tty': '/dev/ttys001', 'terminal_pid': 12345}
        key = adapter.build_terminal_key(terminal)
        
        assert key == 'TTY:/dev/ttys001'
    
    def test_send_to_server_connection_refused(self):
        """Test send_to_server returns False when connection refused."""
        adapter = ClaudeCodeAdapter()
        
        # Use a path that doesn't exist
        result = adapter.send_to_server(
            {'test': 'data'},
            socket_path='/tmp/nonexistent_socket.sock',
            timeout=0.1
        )
        
        assert result is False


# ============================================================================
# Test Claude Code Adapter
# ============================================================================

class TestClaudeCodeAdapter:
    """Tests for ClaudeCodeAdapter."""
    
    def test_source_is_claude_code(self):
        """Test that source property returns 'claude_code'."""
        adapter = ClaudeCodeAdapter()
        assert adapter.source == 'claude_code'
    
    def test_get_session_id(self):
        """Test session ID extraction from Claude Code input."""
        adapter = ClaudeCodeAdapter()
        
        input_data = {'session_id': 'claude-session-123'}
        session_id = adapter.get_session_id(input_data)
        
        assert session_id == 'claude-session-123'
    
    def test_get_session_id_missing(self):
        """Test get_session_id returns None when missing."""
        adapter = ClaudeCodeAdapter()
        
        session_id = adapter.get_session_id({})
        
        assert session_id is None
    
    def test_get_project_path(self):
        """Test project path extraction from Claude Code input."""
        adapter = ClaudeCodeAdapter()
        
        input_data = {
            'workspace': {
                'project_dir': '/Users/test/my-project',
                'current_dir': '/Users/test/my-project/src'
            }
        }
        
        project_path = adapter.get_project_path(input_data)
        
        assert project_path == '/Users/test/my-project'
    
    def test_build_session_start_payload(self):
        """Test building session_start payload."""
        adapter = ClaudeCodeAdapter()
        
        input_data = {
            'session_id': 'claude-123',
            'workspace': {'project_dir': '/Users/test/my-project'},
            'cwd': '/Users/test/my-project',
            'model': 'claude-3-5-sonnet',
            'source': 'startup',
        }
        
        payload = adapter.build_session_start_payload(input_data)
        
        assert payload['event'] == 'session_start'
        assert payload['session_id'] == 'claude-123'
        assert payload['source'] == 'claude_code'
        assert payload['project'] == 'my-project'
        assert payload['model'] == 'claude-3-5-sonnet'
        assert 'terminal' in payload
        assert 'terminal_key' in payload
    
    def test_build_session_start_payload_missing_session_id(self):
        """Test that build_session_start_payload returns None without session_id."""
        adapter = ClaudeCodeAdapter()
        
        payload = adapter.build_session_start_payload({})
        
        assert payload is None
    
    def test_build_activity_payload(self):
        """Test building activity payload."""
        adapter = ClaudeCodeAdapter()
        
        input_data = {
            'session_id': 'claude-123',
            'tool_name': 'write_file',
            'workspace': {'project_dir': '/Users/test/my-project'},
        }
        
        payload = adapter.build_activity_payload(input_data)
        
        assert payload['event'] == 'activity'
        assert payload['session_id'] == 'claude-123'
        assert payload['tool_name'] == 'write_file'
        assert payload['source'] == 'claude_code'
    
    def test_build_idle_payload(self):
        """Test building idle payload."""
        adapter = ClaudeCodeAdapter()
        
        input_data = {'session_id': 'claude-123'}
        payload = adapter.build_idle_payload(input_data)
        
        assert payload['event'] == 'idle'
        assert payload['session_id'] == 'claude-123'
        assert payload['source'] == 'claude_code'
    
    def test_build_session_end_payload(self):
        """Test building session_end payload."""
        adapter = ClaudeCodeAdapter()
        
        input_data = {'session_id': 'claude-123'}
        payload = adapter.build_session_end_payload(input_data)
        
        assert payload['event'] == 'session_end'
        assert payload['session_id'] == 'claude-123'
        assert payload['source'] == 'claude_code'


# ============================================================================
# Test Cursor Adapter
# ============================================================================

class TestCursorAdapter:
    """Tests for CursorAdapter."""
    
    def test_source_is_cursor(self):
        """Test that source property returns 'cursor'."""
        adapter = CursorAdapter()
        assert adapter.source == 'cursor'
    
    def test_get_session_id(self):
        """Test session ID extraction from Cursor input (conversation_id)."""
        adapter = CursorAdapter()
        
        input_data = {'conversation_id': 'cursor-conv-456'}
        session_id = adapter.get_session_id(input_data)
        
        assert session_id == 'cursor-conv-456'
    
    def test_get_session_id_missing(self):
        """Test get_session_id returns None when conversation_id missing."""
        adapter = CursorAdapter()
        
        session_id = adapter.get_session_id({'session_id': 'wrong-field'})
        
        assert session_id is None
    
    def test_get_project_path(self):
        """Test project path extraction from Cursor input (workspace_roots)."""
        adapter = CursorAdapter()
        
        input_data = {
            'workspace_roots': ['/Users/test/cursor-project', '/Users/test/other']
        }
        
        project_path = adapter.get_project_path(input_data)
        
        assert project_path == '/Users/test/cursor-project'
    
    def test_get_project_path_empty_roots(self):
        """Test get_project_path returns empty string for empty workspace_roots."""
        adapter = CursorAdapter()
        
        project_path = adapter.get_project_path({'workspace_roots': []})
        
        assert project_path == ''
    
    def test_build_session_start_payload(self):
        """Test building session_start payload for Cursor."""
        adapter = CursorAdapter()
        
        input_data = {
            'conversation_id': 'cursor-456',
            'workspace_roots': ['/Users/test/cursor-project'],
            'model_name': 'gpt-4',
        }
        
        payload = adapter.build_session_start_payload(input_data)
        
        assert payload['event'] == 'session_start'
        assert payload['session_id'] == 'cursor-456'
        assert payload['source'] == 'cursor'
        assert payload['project'] == 'cursor-project'
        assert payload['workspace_roots'] == ['/Users/test/cursor-project']
    
    def test_build_pre_compact_payload(self):
        """Test building context_update payload from preCompact event."""
        adapter = CursorAdapter()
        
        input_data = {
            'conversation_id': 'cursor-456',
            'context_usage_percent': 75.5,
            'context_tokens': 96000,
            'context_window_size': 128000,
            'workspace_roots': ['/Users/test/cursor-project'],
        }
        
        payload = adapter.build_pre_compact_payload(input_data)
        
        assert payload['event'] == 'context_update'
        assert payload['session_id'] == 'cursor-456'
        assert payload['source'] == 'cursor'
        assert payload['used_percentage'] == 75.5
        assert payload['remaining_percentage'] == 24.5
        assert payload['context_window_size'] == 128000
        assert payload['total_input_tokens'] == 96000
    
    def test_build_pre_compact_payload_missing_metrics(self):
        """Test preCompact payload with missing metrics uses defaults."""
        adapter = CursorAdapter()
        
        input_data = {'conversation_id': 'cursor-456'}
        payload = adapter.build_pre_compact_payload(input_data)
        
        assert payload['used_percentage'] == 0
        assert payload['remaining_percentage'] == 100
        assert payload['context_window_size'] == 0
    
    def test_build_activity_payload(self):
        """Test building activity payload for Cursor."""
        adapter = CursorAdapter()
        
        input_data = {
            'conversation_id': 'cursor-456',
            'tool_name': 'read_file',
            'workspace_roots': ['/Users/test/cursor-project'],
        }
        
        payload = adapter.build_activity_payload(input_data)
        
        assert payload['event'] == 'activity'
        assert payload['session_id'] == 'cursor-456'
        assert payload['tool_name'] == 'read_file'
        assert payload['source'] == 'cursor'
    
    def test_build_session_end_payload(self):
        """Test building session_end payload for Cursor."""
        adapter = CursorAdapter()
        
        input_data = {'conversation_id': 'cursor-456'}
        payload = adapter.build_session_end_payload(input_data)
        
        assert payload['event'] == 'session_end'
        assert payload['session_id'] == 'cursor-456'
        assert payload['source'] == 'cursor'


# ============================================================================
# Integration Tests
# ============================================================================

class TestIntegration:
    """Integration tests for adapter → server communication."""
    
    def test_send_to_mock_server(self):
        """Test sending payload to a mock Unix socket server."""
        adapter = ClaudeCodeAdapter()
        received_data = []
        
        # Create a temporary socket
        socket_path = f'/tmp/jacques_test_{os.getpid()}.sock'
        
        # Clean up any existing socket
        if os.path.exists(socket_path):
            os.unlink(socket_path)
        
        # Create server socket
        server_sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        server_sock.bind(socket_path)
        server_sock.listen(1)
        server_sock.settimeout(2.0)
        
        def accept_connection():
            try:
                conn, _ = server_sock.accept()
                data = conn.recv(4096)
                received_data.append(json.loads(data.decode().strip()))
                conn.close()
            except:
                pass
        
        # Start accepting thread
        accept_thread = threading.Thread(target=accept_connection)
        accept_thread.start()
        
        try:
            # Send payload
            payload = {'event': 'test', 'session_id': 'test-123'}
            result = adapter.send_to_server(payload, socket_path=socket_path)
            
            # Wait for server to receive
            accept_thread.join(timeout=2.0)
            
            assert result is True
            assert len(received_data) == 1
            assert received_data[0]['event'] == 'test'
            assert received_data[0]['session_id'] == 'test-123'
            
        finally:
            server_sock.close()
            if os.path.exists(socket_path):
                os.unlink(socket_path)


# ============================================================================
# Run Tests
# ============================================================================

def run_tests():
    """Run all tests without pytest."""
    import traceback
    
    test_classes = [
        TestBaseAdapter,
        TestClaudeCodeAdapter,
        TestCursorAdapter,
        TestIntegration,
    ]
    
    total = 0
    passed = 0
    failed = 0
    
    for test_class in test_classes:
        print(f"\n{'='*60}")
        print(f"Running {test_class.__name__}")
        print('='*60)
        
        instance = test_class()
        methods = [m for m in dir(instance) if m.startswith('test_')]
        
        for method_name in methods:
            total += 1
            try:
                getattr(instance, method_name)()
                print(f"  ✓ {method_name}")
                passed += 1
            except AssertionError as e:
                print(f"  ✗ {method_name}: {e}")
                failed += 1
            except Exception as e:
                print(f"  ✗ {method_name}: {type(e).__name__}: {e}")
                traceback.print_exc()
                failed += 1
    
    print(f"\n{'='*60}")
    print(f"Results: {passed}/{total} passed, {failed} failed")
    print('='*60)
    
    return failed == 0


if __name__ == '__main__':
    # Try to use pytest if available
    try:
        import pytest
        sys.exit(pytest.main([__file__, '-v']))
    except ImportError:
        # Fall back to basic test runner
        success = run_tests()
        sys.exit(0 if success else 1)
