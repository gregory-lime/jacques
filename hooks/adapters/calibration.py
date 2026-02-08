#!/usr/bin/env python3
"""
calibration.py - Token Estimation Calibration for Jacques

Stores and retrieves calibration factors to improve token estimation accuracy.
When preCompact provides actual token counts, we calculate a correction factor
that can be applied to future estimates for that session.

Calibration data is stored in ~/.jacques/calibration.json

Example calibration flow:
1. afterAgentResponse estimates 50,000 tokens
2. User runs /summarize, preCompact reports actual 55,000 tokens
3. Correction factor = 55000 / 50000 = 1.1
4. Future estimates are multiplied by 1.1 for better accuracy
"""
import json
import sys
import time
from pathlib import Path
from typing import Optional

# Calibration data file path
CALIBRATION_PATH = Path.home() / '.jacques' / 'calibration.json'

# In-memory cache for current session
_calibration_cache: dict = None
_cache_loaded = False


def _load_calibration() -> dict:
    """Load calibration data from file."""
    global _calibration_cache, _cache_loaded
    
    if _cache_loaded and _calibration_cache is not None:
        return _calibration_cache
    
    _calibration_cache = {
        "sessions": {},  # session_id -> {factor, last_estimate, last_actual, updated_at}
        "global_factor": 1.0,  # Weighted average across all sessions
    }
    
    try:
        if CALIBRATION_PATH.exists():
            with open(CALIBRATION_PATH, 'r') as f:
                data = json.load(f)
                _calibration_cache.update(data)
    except Exception as e:
        print(f"[jacques:calibration] Error loading calibration: {e}", file=sys.stderr)
    
    _cache_loaded = True
    return _calibration_cache


def _save_calibration() -> bool:
    """Save calibration data to file."""
    try:
        CALIBRATION_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(CALIBRATION_PATH, 'w') as f:
            json.dump(_calibration_cache, f, indent=2)
        return True
    except Exception as e:
        print(f"[jacques:calibration] Error saving calibration: {e}", file=sys.stderr)
        return False


def get_factor(session_id: str) -> float:
    """
    Get correction factor for a session.
    
    Only returns session-specific factors, NOT global factors.
    Global factors from old sessions with different estimation logic
    can cause wildly inaccurate results.
    
    Args:
        session_id: Session identifier
        
    Returns:
        Correction factor (default 1.0 if no calibration for this session).
    """
    data = _load_calibration()
    
    # Only use session-specific factor
    # Don't use global_factor - it may be from old sessions with wrong estimates
    session_data = data.get("sessions", {}).get(session_id)
    if session_data and "factor" in session_data:
        return session_data["factor"]
    
    # Default to 1.0 for new sessions - no adjustment until calibrated
    return 1.0


def set_factor(session_id: str, factor: float) -> None:
    """
    Set correction factor for a session.
    
    Also updates the global factor as a weighted average.
    
    Args:
        session_id: Session identifier
        factor: Correction factor (actual / estimated)
    """
    data = _load_calibration()
    
    if "sessions" not in data:
        data["sessions"] = {}
    
    # Clamp factor to reasonable range (0.5 to 2.0)
    factor = max(0.5, min(2.0, factor))
    
    data["sessions"][session_id] = {
        "factor": factor,
        "updated_at": time.time(),
    }
    
    # Update global factor as average of recent sessions
    recent_factors = [
        s.get("factor", 1.0) 
        for s in data["sessions"].values()
        if s.get("updated_at", 0) > time.time() - 86400  # Last 24 hours
    ]
    
    if recent_factors:
        data["global_factor"] = sum(recent_factors) / len(recent_factors)
    
    _save_calibration()


def get_last_estimate(session_id: str) -> Optional[int]:
    """
    Get the last token estimate for a session.
    
    Used when preCompact fires to calculate correction factor.
    
    Args:
        session_id: Session identifier
        
    Returns:
        Last estimated token count, or None if not available.
    """
    data = _load_calibration()
    session_data = data.get("sessions", {}).get(session_id)
    
    if session_data:
        return session_data.get("last_estimate")
    
    return None


def set_last_estimate(session_id: str, tokens: int) -> None:
    """
    Store the latest token estimate for a session.
    
    Called after each afterAgentResponse to track estimates.
    
    Args:
        session_id: Session identifier
        tokens: Estimated token count
    """
    data = _load_calibration()
    
    if "sessions" not in data:
        data["sessions"] = {}
    
    if session_id not in data["sessions"]:
        data["sessions"][session_id] = {}
    
    data["sessions"][session_id]["last_estimate"] = tokens
    data["sessions"][session_id]["estimate_time"] = time.time()
    
    _save_calibration()


def calibrate_from_actual(session_id: str, actual_tokens: int) -> Optional[float]:
    """
    Calculate and store correction factor from actual token count.
    
    Called when preCompact provides actual metrics.
    
    Args:
        session_id: Session identifier
        actual_tokens: Actual token count from preCompact
        
    Returns:
        Calculated correction factor, or None if no estimate available.
    """
    estimated = get_last_estimate(session_id)
    
    if not estimated or estimated <= 0:
        return None
    
    factor = actual_tokens / estimated
    set_factor(session_id, factor)
    
    # Store actual for reference
    data = _load_calibration()
    if session_id in data.get("sessions", {}):
        data["sessions"][session_id]["last_actual"] = actual_tokens
        data["sessions"][session_id]["calibrated_at"] = time.time()
        _save_calibration()
    
    return factor


def clear_session(session_id: str) -> None:
    """
    Clear calibration data for a session.
    
    Called when session ends.
    
    Args:
        session_id: Session identifier
    """
    data = _load_calibration()
    
    if session_id in data.get("sessions", {}):
        del data["sessions"][session_id]
        _save_calibration()


def get_calibration_stats() -> dict:
    """
    Get calibration statistics for debugging.
    
    Returns:
        Dict with session count, global factor, etc.
    """
    data = _load_calibration()
    
    sessions = data.get("sessions", {})
    
    return {
        "session_count": len(sessions),
        "global_factor": data.get("global_factor", 1.0),
        "calibrated_sessions": sum(1 for s in sessions.values() if "factor" in s),
    }
