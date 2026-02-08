#!/usr/bin/env python3
"""
test_tokenizer.py - Unit tests for tokenizer module

Run with:
  python3 hooks/adapters/test_tokenizer.py
"""
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from adapters import tokenizer


def test_estimate_tokens_empty_string():
    """Test that empty string returns 0 tokens."""
    assert tokenizer.estimate_tokens('') == 0
    assert tokenizer.estimate_tokens(None) == 0


def test_estimate_tokens_basic():
    """Test basic token estimation."""
    # A simple sentence should return some tokens
    text = "Hello, this is a test."
    tokens = tokenizer.estimate_tokens(text)
    assert tokens > 0
    assert tokens < 100  # Should be reasonable


def test_estimate_tokens_longer_text():
    """Test that longer text produces more tokens."""
    short_text = "Hello"
    long_text = "Hello " * 100
    
    short_tokens = tokenizer.estimate_tokens(short_text)
    long_tokens = tokenizer.estimate_tokens(long_text)
    
    assert long_tokens > short_tokens


def test_get_context_window_claude():
    """Test context window lookup for Claude models (Cursor uses 176k)."""
    assert tokenizer.get_context_window('claude-4.5-sonnet') == 176_000
    assert tokenizer.get_context_window('claude-3-opus') == 176_000
    assert tokenizer.get_context_window('claude-3.5-sonnet') == 176_000


def test_get_context_window_gpt():
    """Test context window lookup for GPT models."""
    assert tokenizer.get_context_window('gpt-4o') == 128_000
    assert tokenizer.get_context_window('gpt-4') == 8_192


def test_get_context_window_gemini():
    """Test context window lookup for Gemini models."""
    assert tokenizer.get_context_window('gemini-2.5-pro') == 1_000_000
    assert tokenizer.get_context_window('gemini-1.5-pro') == 2_000_000


def test_get_context_window_unknown():
    """Test context window lookup for unknown models uses default (176k for Cursor)."""
    assert tokenizer.get_context_window('unknown-model') == 176_000
    assert tokenizer.get_context_window('') == 176_000
    assert tokenizer.get_context_window(None) == 176_000


def test_get_context_window_partial_match():
    """Test context window lookup with partial model names."""
    # Should match based on partial string
    assert tokenizer.get_context_window('my-claude-4.5-sonnet-tuned') == 176_000
    assert tokenizer.get_context_window('fine-tuned-gpt-4o') == 128_000


def test_calculate_context_percentage():
    """Test context percentage calculation."""
    assert tokenizer.calculate_context_percentage(50_000, 200_000) == 25.0
    assert tokenizer.calculate_context_percentage(100_000, 200_000) == 50.0
    assert tokenizer.calculate_context_percentage(200_000, 200_000) == 100.0


def test_calculate_context_percentage_over_100():
    """Test that percentage is capped at 100%."""
    assert tokenizer.calculate_context_percentage(250_000, 200_000) == 100.0


def test_calculate_context_percentage_zero_window():
    """Test that zero window returns 0%."""
    assert tokenizer.calculate_context_percentage(50_000, 0) == 0.0


def test_calculate_context_metrics():
    """Test full context metrics calculation."""
    metrics = tokenizer.calculate_context_metrics(44_000, 'claude-4.5-sonnet')
    
    # 44,000 / 176,000 = 25%
    assert metrics['used_percentage'] == 25.0
    assert metrics['remaining_percentage'] == 75.0
    assert metrics['context_window_size'] == 176_000
    assert metrics['estimated_tokens'] == 44_000


def test_calculate_context_metrics_different_model():
    """Test context metrics with different model."""
    metrics = tokenizer.calculate_context_metrics(64_000, 'gpt-4o')
    
    assert metrics['used_percentage'] == 50.0
    assert metrics['context_window_size'] == 128_000


def run_tests():
    """Run all tests without pytest."""
    import traceback
    
    tests = [
        test_estimate_tokens_empty_string,
        test_estimate_tokens_basic,
        test_estimate_tokens_longer_text,
        test_get_context_window_claude,
        test_get_context_window_gpt,
        test_get_context_window_gemini,
        test_get_context_window_unknown,
        test_get_context_window_partial_match,
        test_calculate_context_percentage,
        test_calculate_context_percentage_over_100,
        test_calculate_context_percentage_zero_window,
        test_calculate_context_metrics,
        test_calculate_context_metrics_different_model,
    ]
    
    passed = 0
    failed = 0
    
    print("=" * 60)
    print("Running Tokenizer Tests")
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
