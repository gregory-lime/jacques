#!/usr/bin/env python3
"""
context_parser.py - Parse Claude Code /context command output

Parses the visual output of the /context command to extract:
- Model and total context usage
- Category breakdown (system prompt, tools, MCP, memory, skills, messages)
- Individual items within each category
"""
import re
from dataclasses import dataclass, field
from typing import List, Optional, Dict


@dataclass
class ContextItem:
    """Individual item in a category (e.g., a specific MCP tool or skill)."""
    name: str
    tokens: int


@dataclass
class ContextCategory:
    """A category in the context breakdown."""
    name: str
    tokens: int
    percentage: float
    items: List[ContextItem] = field(default_factory=list)


@dataclass
class ContextBreakdown:
    """Full context breakdown from /context command."""
    model: str
    total_tokens: int
    max_tokens: int
    used_percentage: float
    
    # Categories
    system_prompt: Optional[ContextCategory] = None
    system_tools: Optional[ContextCategory] = None
    mcp_tools: Optional[ContextCategory] = None
    custom_agents: Optional[ContextCategory] = None
    memory_files: Optional[ContextCategory] = None
    skills: Optional[ContextCategory] = None
    messages: Optional[ContextCategory] = None
    free_space: Optional[ContextCategory] = None
    autocompact_buffer: Optional[ContextCategory] = None
    
    # Raw data for debugging
    raw_output: str = ""


def parse_context_output(output: str) -> Optional[ContextBreakdown]:
    """
    Parse the output of Claude Code's /context command.
    
    Args:
        output: Raw text output from /context command
        
    Returns:
        ContextBreakdown object, or None if parsing fails
    """
    # Check if this looks like /context output
    if "Context Usage" not in output:
        return None
    
    breakdown = ContextBreakdown(
        model="",
        total_tokens=0,
        max_tokens=0,
        used_percentage=0.0,
        raw_output=output
    )
    
    # Parse header: "claude-sonnet-4-5-20250929 · 48k/200k tokens (24%)"
    header_match = re.search(
        r'([\w-]+)\s*·\s*([\d.]+)k?\s*/\s*([\d.]+)k?\s*tokens\s*\((\d+(?:\.\d+)?)\s*%\)',
        output
    )
    if header_match:
        breakdown.model = header_match.group(1)
        # Handle k suffix
        total_str = header_match.group(2)
        max_str = header_match.group(3)
        breakdown.total_tokens = int(float(total_str) * 1000) if 'k' in output[header_match.start():header_match.end()] else int(float(total_str) * 1000)
        breakdown.max_tokens = int(float(max_str) * 1000)
        breakdown.used_percentage = float(header_match.group(4))
    
    # Parse category lines: "⛁ System prompt: 2.5k tokens (1.3%)"
    # Note: some values have 'k' suffix (e.g., "2.5k tokens"), some don't (e.g., "247 tokens")
    category_pattern = re.compile(
        r'[⛁⛀⛶⛝]\s+([\w\s]+):\s*([\d.]+)(k)?\s*tokens\s*\(([\d.]+)\s*%\)'
    )
    
    for match in category_pattern.finditer(output):
        name = match.group(1).strip().lower()
        token_value = float(match.group(2))
        has_k_suffix = match.group(3) == 'k'
        tokens = int(token_value * 1000) if has_k_suffix else int(token_value)
        percentage = float(match.group(4))
        
        category = ContextCategory(
            name=match.group(1).strip(),
            tokens=tokens,
            percentage=percentage
        )
        
        # Map to appropriate field
        if 'system prompt' in name:
            breakdown.system_prompt = category
        elif 'system tools' in name:
            breakdown.system_tools = category
        elif 'mcp tools' in name:
            breakdown.mcp_tools = category
        elif 'custom agents' in name or 'agents' in name:
            breakdown.custom_agents = category
        elif 'memory' in name:
            breakdown.memory_files = category
        elif 'skills' in name:
            breakdown.skills = category
        elif 'messages' in name:
            breakdown.messages = category
        elif 'free' in name:
            breakdown.free_space = category
        elif 'autocompact' in name or 'buffer' in name:
            breakdown.autocompact_buffer = category
    
    # Parse individual items within sections
    # MCP tools section: "└ mcp__tool_name: 589 tokens"
    item_pattern = re.compile(r'[└├─]\s*([\w_-]+):\s*(\d+)\s*tokens')
    
    # Find section boundaries and parse items
    sections = {
        'MCP tools': breakdown.mcp_tools,
        'Custom agents': breakdown.custom_agents,
        'Memory files': breakdown.memory_files,
        'Skills': breakdown.skills,
    }
    
    for section_name, category in sections.items():
        if category is None:
            continue
        
        # Find the section in output
        section_start = output.find(f'{section_name} ·')
        if section_start == -1:
            section_start = output.find(section_name)
        if section_start == -1:
            continue
        
        # Find the next section or end
        next_section = len(output)
        for other_name in sections.keys():
            if other_name != section_name:
                pos = output.find(other_name, section_start + len(section_name))
                if pos != -1 and pos < next_section:
                    next_section = pos
        
        section_text = output[section_start:next_section]
        
        # Parse items in this section
        for item_match in item_pattern.finditer(section_text):
            item = ContextItem(
                name=item_match.group(1),
                tokens=int(item_match.group(2))
            )
            category.items.append(item)
    
    return breakdown


def find_context_in_terminal(terminal_output: str) -> Optional[str]:
    """
    Find /context command output in terminal text.
    
    Looks for the characteristic pattern of /context output.
    
    Args:
        terminal_output: Raw terminal output text
        
    Returns:
        The /context output section, or None if not found
    """
    # Look for the /context command and its output
    # Pattern: "/context" followed by "Context Usage" block
    
    # Find start marker
    start_markers = [
        'Context Usage',
        '⛁ ⛁ ⛁',  # The visual token indicator
    ]
    
    start_idx = -1
    for marker in start_markers:
        idx = terminal_output.rfind(marker)  # Find most recent
        if idx != -1 and (start_idx == -1 or idx > start_idx):
            start_idx = idx
    
    if start_idx == -1:
        return None
    
    # Find end marker (next command prompt or significant break)
    end_markers = [
        '\n❯ ',  # Claude Code prompt
        '\n> ',   # Generic prompt
        '\n$ ',   # Shell prompt
        '\n─────',  # Separator
    ]
    
    # Look for end within reasonable distance (context output is ~50-100 lines)
    search_end = min(start_idx + 5000, len(terminal_output))
    end_idx = search_end
    
    # Go back a bit to capture from section start
    start_idx = max(0, start_idx - 200)
    
    return terminal_output[start_idx:end_idx]


def to_dict(breakdown: ContextBreakdown) -> Dict:
    """Convert ContextBreakdown to a dictionary for JSON serialization."""
    def category_to_dict(cat: Optional[ContextCategory]) -> Optional[Dict]:
        if cat is None:
            return None
        return {
            'name': cat.name,
            'tokens': cat.tokens,
            'percentage': cat.percentage,
            'items': [{'name': i.name, 'tokens': i.tokens} for i in cat.items]
        }
    
    return {
        'model': breakdown.model,
        'total_tokens': breakdown.total_tokens,
        'max_tokens': breakdown.max_tokens,
        'used_percentage': breakdown.used_percentage,
        'categories': {
            'system_prompt': category_to_dict(breakdown.system_prompt),
            'system_tools': category_to_dict(breakdown.system_tools),
            'mcp_tools': category_to_dict(breakdown.mcp_tools),
            'custom_agents': category_to_dict(breakdown.custom_agents),
            'memory_files': category_to_dict(breakdown.memory_files),
            'skills': category_to_dict(breakdown.skills),
            'messages': category_to_dict(breakdown.messages),
            'free_space': category_to_dict(breakdown.free_space),
            'autocompact_buffer': category_to_dict(breakdown.autocompact_buffer),
        }
    }


# Example usage and testing
if __name__ == '__main__':
    # Sample /context output for testing
    sample_output = """
  ⎿  Context Usage
     ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛀   claude-sonnet-4-5-20250929 · 48k/200k tokens (24%)
     ⛁ ⛀ ⛀ ⛀ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁
     ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛶ ⛶ ⛶   Estimated usage by category
     ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ System prompt: 2.5k tokens (1.3%)
     ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ System tools: 17.2k tokens (8.6%)
     ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ MCP tools: 2.2k tokens (1.1%)
     ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ Custom agents: 247 tokens (0.1%)
     ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ Memory files: 843 tokens (0.4%)
     ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ Skills: 687 tokens (0.3%)
     ⛶ ⛝ ⛝ ⛝ ⛝ ⛝ ⛝ ⛝ ⛝ ⛝   ⛁ Messages: 25.5k tokens (12.8%)
                           ⛶ Free space: 118k (58.9%)
                           ⛝ Autocompact buffer: 33.0k tokens (16.5%)

     MCP tools · /mcp
     └ mcp__youtube-transcript__get_youtube_transcript: 589 tokens
     └ mcp__youtube-transcript__get_video_info: 318 tokens
     └ mcp__deepwiki__read_wiki_structure: 123 tokens

     Memory files · /memory
     └ CLAUDE.md: 843 tokens

     Skills · /skills
     └ frontend-design: 67 tokens
     └ receiving-code-review: 67 tokens
"""
    
    import json
    breakdown = parse_context_output(sample_output)
    if breakdown:
        print(json.dumps(to_dict(breakdown), indent=2))
    else:
        print("Failed to parse")
