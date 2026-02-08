#!/usr/bin/env python3
"""
test_skills.py - Unit tests for skills detection module

Run with:
  python3 hooks/adapters/test_skills.py
"""
import sys
import tempfile
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from adapters import skills


def test_find_skill_files():
    """Test that skill files can be found."""
    skill_files = skills.find_skill_files()
    
    # Should find some skills (user has skills installed)
    assert isinstance(skill_files, list)
    # All should be Path objects
    for f in skill_files:
        assert isinstance(f, Path)


def test_estimate_skill_tokens():
    """Test skill token estimation."""
    skills.clear_cache()
    skill_count, estimated_tokens = skills.estimate_skill_tokens()
    
    assert isinstance(skill_count, int)
    assert isinstance(estimated_tokens, int)
    assert skill_count >= 0
    assert estimated_tokens >= 0
    
    # If skills are found, tokens should be positive
    if skill_count > 0:
        assert estimated_tokens > 0


def test_estimate_skill_tokens_caching():
    """Test that skill estimation is cached."""
    skills.clear_cache()
    
    # First call
    count1, tokens1 = skills.estimate_skill_tokens()
    
    # Second call should return same values (cached)
    count2, tokens2 = skills.estimate_skill_tokens()
    
    assert count1 == count2
    assert tokens1 == tokens2


def test_get_initial_context_estimate():
    """Test initial context estimate calculation."""
    skills.clear_cache()
    estimate = skills.get_initial_context_estimate('claude-4.5-sonnet')
    
    # Should have all required fields
    assert 'skill_count' in estimate
    assert 'skill_tokens' in estimate
    assert 'system_prompt_tokens' in estimate
    assert 'total_initial_tokens' in estimate
    assert 'used_percentage' in estimate
    assert 'remaining_percentage' in estimate
    assert 'context_window_size' in estimate
    
    # Context window should be 176k for Claude in Cursor
    assert estimate['context_window_size'] == 176_000
    
    # Percentages should add to 100
    assert round(estimate['used_percentage'] + estimate['remaining_percentage'], 1) == 100.0


def test_get_initial_context_estimate_different_models():
    """Test initial estimate with different model context windows."""
    skills.clear_cache()
    
    claude_estimate = skills.get_initial_context_estimate('claude-4.5-sonnet')
    gpt_estimate = skills.get_initial_context_estimate('gpt-4o')
    
    # Same skill count
    assert claude_estimate['skill_count'] == gpt_estimate['skill_count']
    
    # Different context windows (Claude in Cursor uses 176k)
    assert claude_estimate['context_window_size'] == 176_000
    assert gpt_estimate['context_window_size'] == 128_000
    
    # GPT should have higher percentage (smaller window)
    assert gpt_estimate['used_percentage'] > claude_estimate['used_percentage']


def test_get_skills_summary():
    """Test skills summary string generation."""
    skills.clear_cache()
    summary = skills.get_skills_summary()
    
    assert isinstance(summary, str)
    assert 'skills' in summary.lower()
    assert 'tokens' in summary.lower()


def test_clear_cache():
    """Test cache clearing."""
    skills.clear_cache()
    
    # Get initial values
    count1, tokens1 = skills.estimate_skill_tokens()
    
    # Clear and get again (should recompute, same values)
    skills.clear_cache()
    count2, tokens2 = skills.estimate_skill_tokens()
    
    assert count1 == count2
    assert tokens1 == tokens2


def run_tests():
    """Run all tests without pytest."""
    import traceback
    
    tests = [
        test_find_skill_files,
        test_estimate_skill_tokens,
        test_estimate_skill_tokens_caching,
        test_get_initial_context_estimate,
        test_get_initial_context_estimate_different_models,
        test_get_skills_summary,
        test_clear_cache,
    ]
    
    passed = 0
    failed = 0
    
    print("=" * 60)
    print("Running Skills Detection Tests")
    print("=" * 60)
    
    for test in tests:
        try:
            test()
            print(f"  ✓ {test.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  ✗ {test.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ✗ {test.__name__}: {type(e).__name__}: {e}")
            traceback.print_exc()
            failed += 1
    
    print(f"\nResults: {passed}/{passed + failed} passed, {failed} failed")
    return failed == 0


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
