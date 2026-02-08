#!/usr/bin/env python3
"""
tokenizer.py - Token Estimation Module for Jacques

Uses tiktoken's cl100k_base encoding to estimate token counts.
This encoding is used by OpenAI models and is reasonably close (~90%)
to Claude's actual tokenizer.

Provides:
- Token count estimation from text
- Model context window lookup
- Context percentage calculation
"""
import sys

# Cache encoder instance for performance
_encoder = None


def get_encoder():
    """
    Get cached tiktoken encoder.
    
    Uses cl100k_base encoding which is closest to Claude's tokenizer.
    Encoder is cached for performance (~150k tokens/sec).
    
    Returns:
        tiktoken.Encoding instance, or None if tiktoken not installed.
    """
    global _encoder
    if _encoder is None:
        try:
            import tiktoken
            _encoder = tiktoken.get_encoding("cl100k_base")
        except ImportError:
            print("[jacques:tokenizer] tiktoken not installed. Run: pip install tiktoken", file=sys.stderr)
            return None
    return _encoder


def estimate_tokens(text: str) -> int:
    """
    Estimate token count for given text.
    
    Args:
        text: Text to tokenize
        
    Returns:
        Estimated token count, or character-based fallback if tiktoken unavailable.
    """
    if not text:
        return 0
    
    encoder = get_encoder()
    if encoder:
        return len(encoder.encode(text))
    
    # Fallback: rough estimate of ~4 characters per token
    return len(text) // 4


# Model context windows (in tokens)
# Source: Official documentation + Cursor UI observations
MODEL_CONTEXT_WINDOWS = {
    # Claude models (Cursor uses 176k for Claude in agent mode)
    "claude-4.5-opus": 176_000,  # Cursor-specific limit
    "claude-4.5-sonnet": 176_000,
    "claude-4-opus": 176_000,
    "claude-4-sonnet": 176_000,
    "claude-3.5-sonnet": 176_000,
    "claude-3-opus": 176_000,
    "claude-3-sonnet": 176_000,
    "claude-3-haiku": 176_000,
    
    # OpenAI models
    "gpt-4o": 128_000,
    "gpt-4-turbo": 128_000,
    "gpt-4": 8_192,
    "gpt-3.5-turbo": 16_385,
    
    # Google models
    "gemini-2.5-pro": 1_000_000,
    "gemini-2.5-flash": 1_000_000,
    "gemini-1.5-pro": 2_000_000,
    "gemini-1.5-flash": 1_000_000,
    
    # Default for unknown models (use Cursor's typical limit)
    "default": 176_000,
}


def get_context_window(model: str) -> int:
    """
    Get context window size for a model.
    
    Args:
        model: Model name/identifier
        
    Returns:
        Context window size in tokens.
    """
    if not model:
        return MODEL_CONTEXT_WINDOWS["default"]
    
    model_lower = model.lower()
    
    # Try exact match first
    if model_lower in MODEL_CONTEXT_WINDOWS:
        return MODEL_CONTEXT_WINDOWS[model_lower]
    
    # Try partial match
    for key, window in MODEL_CONTEXT_WINDOWS.items():
        if key != "default" and key in model_lower:
            return window
    
    return MODEL_CONTEXT_WINDOWS["default"]


def calculate_context_percentage(tokens: int, context_window: int) -> float:
    """
    Calculate context usage percentage.
    
    Args:
        tokens: Current token count
        context_window: Maximum context window size
        
    Returns:
        Percentage of context used (0.0 to 100.0).
    """
    if context_window <= 0:
        return 0.0
    
    percentage = (tokens / context_window) * 100
    return min(percentage, 100.0)  # Cap at 100%


def calculate_context_metrics(tokens: int, model: str) -> dict:
    """
    Calculate full context metrics for a given token count.
    
    Args:
        tokens: Estimated token count
        model: Model name for context window lookup
        
    Returns:
        Dict with used_percentage, remaining_percentage, context_window_size.
    """
    context_window = get_context_window(model)
    used_percentage = calculate_context_percentage(tokens, context_window)
    
    return {
        "used_percentage": round(used_percentage, 1),
        "remaining_percentage": round(100 - used_percentage, 1),
        "context_window_size": context_window,
        "estimated_tokens": tokens,
    }


# Thinking multipliers for extended thinking models
# These models have internal "thinking" that's NOT in the transcript
# but IS counted in the context. Empirically observed: ~4-6x for high-thinking.
THINKING_MULTIPLIERS = {
    "high-thinking": 5.0,  # Based on observed calibration factor of 5.68
    "thinking": 3.0,       # Regular thinking models
    "max": 2.0,            # Max mode may include more reasoning
}


def get_thinking_multiplier(model: str) -> float:
    """
    Get thinking multiplier for models with extended thinking.
    
    Extended thinking models have internal reasoning that doesn't
    appear in the transcript but IS counted in Cursor's context.
    
    Args:
        model: Model name/identifier
        
    Returns:
        Multiplier to apply to transcript tokens (1.0 for non-thinking models).
    """
    if not model:
        return 1.0
    
    model_lower = model.lower()
    
    # Check for thinking mode indicators
    for mode, multiplier in THINKING_MULTIPLIERS.items():
        if mode in model_lower:
            return multiplier
    
    return 1.0
