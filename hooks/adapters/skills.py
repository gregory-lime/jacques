#!/usr/bin/env python3
"""
skills.py - Cursor Agent Skills Detection for Jacques

Scans for installed Cursor agent skills and estimates their token overhead.

IMPORTANT: Cursor does NOT inject full SKILL.md files into context!
It only injects skill METADATA (name, description, path) - about 150-200 tokens per skill.

Skill locations:
- ~/.cursor/skills-cursor/*/SKILL.md - User-installed Cursor skills
- ~/.claude/plugins/cache/**/SKILL.md - Claude plugins (superpowers, etc.)

Typical overhead (CORRECTED):
- 21 skills × ~200 tokens metadata = ~4,200 tokens
- System prompts: ~2,000 tokens
- Total: ~6,000-8,000 tokens (~3-4% on 176k context)
"""
import os
import re
from pathlib import Path
from typing import List, Tuple

# Known skill directories
SKILL_DIRECTORIES = [
    Path.home() / '.cursor' / 'skills-cursor',
    Path.home() / '.claude' / 'plugins' / 'cache',
]

# Tokens per skill METADATA (not full content!)
# Cursor uses dynamic context discovery - only name + short description
# are included statically. Full skill content loaded on-demand.
# Estimated: ~5-10 tokens for name + ~30-50 tokens for description
TOKENS_PER_SKILL_METADATA = 50

# Base system prompt overhead (Cursor's internal prompts, tools, etc.)
# Includes: tool definitions, system instructions, user rules
SYSTEM_PROMPT_TOKENS = 2500

# Cache for skill data (computed once per process)
_skills_cache = None


def find_skill_files() -> List[Path]:
    """
    Find all SKILL.md files in known locations.
    
    Returns:
        List of paths to skill files.
    """
    skill_files = []
    
    for skill_dir in SKILL_DIRECTORIES:
        if not skill_dir.exists():
            continue
        
        # Recursively find all SKILL.md files
        for skill_file in skill_dir.rglob('SKILL.md'):
            skill_files.append(skill_file)
    
    return skill_files


def extract_skill_description(skill_file: Path) -> str:
    """
    Extract the description from a SKILL.md file's frontmatter.
    
    Returns:
        Description string, or empty if not found.
    """
    try:
        content = skill_file.read_text(encoding='utf-8')
        # Look for description in YAML frontmatter
        match = re.search(r'^---\s*\n.*?description:\s*(.+?)\n.*?^---', content, re.MULTILINE | re.DOTALL)
        if match:
            return match.group(1).strip()
    except Exception:
        pass
    return ""


def estimate_skill_tokens() -> Tuple[int, int]:
    """
    Estimate total token overhead from installed skills.
    
    IMPORTANT: Cursor only injects skill METADATA, not full content!
    Each skill adds ~200 tokens of metadata (name, description, path).
    
    Returns:
        Tuple of (skill_count, estimated_tokens)
    """
    global _skills_cache
    
    if _skills_cache is not None:
        return _skills_cache
    
    skill_files = find_skill_files()
    skill_count = len(skill_files)
    
    # Cursor injects metadata only, not full skill content
    # ~200 tokens per skill for the <agent_skill> tag with path and description
    estimated_tokens = skill_count * TOKENS_PER_SKILL_METADATA
    
    _skills_cache = (skill_count, estimated_tokens)
    return _skills_cache


def get_initial_context_estimate(model: str = None) -> dict:
    """
    Get initial context estimate including skill metadata overhead.
    
    This provides a more accurate starting point than 0%.
    
    Args:
        model: Model name for context window lookup
        
    Returns:
        Dict with skill_count, estimated_tokens, and context metrics.
    """
    from . import tokenizer
    
    skill_count, skill_tokens = estimate_skill_tokens()
    
    # Total = skill metadata + system prompts
    total_initial_tokens = skill_tokens + SYSTEM_PROMPT_TOKENS
    
    # Calculate context metrics
    context_window = tokenizer.get_context_window(model)
    used_percentage = tokenizer.calculate_context_percentage(total_initial_tokens, context_window)
    
    return {
        'skill_count': skill_count,
        'skill_tokens': skill_tokens,
        'system_prompt_tokens': SYSTEM_PROMPT_TOKENS,
        'total_initial_tokens': total_initial_tokens,
        'used_percentage': round(used_percentage, 1),
        'remaining_percentage': round(100 - used_percentage, 1),
        'context_window_size': context_window,
    }


def get_skills_summary() -> str:
    """
    Get a human-readable summary of installed skills.
    
    Returns:
        Summary string for logging/debugging.
    """
    skill_count, estimated_tokens = estimate_skill_tokens()
    
    return (
        f"{skill_count} skills installed, "
        f"~{estimated_tokens:,} tokens overhead"
    )


def clear_cache() -> None:
    """Clear the skills cache (useful for testing or when skills change)."""
    global _skills_cache
    _skills_cache = None
