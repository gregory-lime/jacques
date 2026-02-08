"""
Jacques Source Adapters

Provides a modular adapter architecture for integrating multiple AI tools
(Claude Code CLI, Cursor Native, future tools) with the Jacques server.

Each adapter normalizes tool-specific hook events into a common format.
"""

from .base import BaseAdapter
from .claude_code import ClaudeCodeAdapter
from .cursor import CursorAdapter
from . import tokenizer
from . import calibration
from . import skills

__all__ = ['BaseAdapter', 'ClaudeCodeAdapter', 'CursorAdapter', 'tokenizer', 'calibration', 'skills']
