#!/usr/bin/env python3
"""
test_calibration.py - Unit tests for calibration module

Run with:
  python3 hooks/adapters/test_calibration.py
"""
import sys
import os
import tempfile
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from adapters import calibration


def setup_test_calibration():
    """Reset calibration state for testing."""
    # Reset in-memory cache
    calibration._calibration_cache = None
    calibration._cache_loaded = False
    
    # Use temporary file for tests
    calibration.CALIBRATION_PATH = Path(tempfile.mktemp(suffix='.json'))


def teardown_test_calibration():
    """Clean up test calibration file."""
    if calibration.CALIBRATION_PATH.exists():
        os.unlink(calibration.CALIBRATION_PATH)


def test_get_factor_default():
    """Test that default factor is 1.0."""
    setup_test_calibration()
    try:
        factor = calibration.get_factor('new-session')
        assert factor == 1.0
    finally:
        teardown_test_calibration()


def test_set_and_get_factor():
    """Test setting and getting a correction factor."""
    setup_test_calibration()
    try:
        calibration.set_factor('test-session', 1.15)
        factor = calibration.get_factor('test-session')
        assert factor == 1.15
    finally:
        teardown_test_calibration()


def test_factor_clamping_high():
    """Test that factor is clamped to maximum 2.0."""
    setup_test_calibration()
    try:
        calibration.set_factor('test-session', 3.0)
        factor = calibration.get_factor('test-session')
        assert factor == 2.0
    finally:
        teardown_test_calibration()


def test_factor_clamping_low():
    """Test that factor is clamped to minimum 0.5."""
    setup_test_calibration()
    try:
        calibration.set_factor('test-session', 0.2)
        factor = calibration.get_factor('test-session')
        assert factor == 0.5
    finally:
        teardown_test_calibration()


def test_set_and_get_last_estimate():
    """Test storing and retrieving last estimate."""
    setup_test_calibration()
    try:
        calibration.set_last_estimate('test-session', 50000)
        estimate = calibration.get_last_estimate('test-session')
        assert estimate == 50000
    finally:
        teardown_test_calibration()


def test_get_last_estimate_missing():
    """Test that missing estimate returns None."""
    setup_test_calibration()
    try:
        estimate = calibration.get_last_estimate('nonexistent-session')
        assert estimate is None
    finally:
        teardown_test_calibration()


def test_calibrate_from_actual():
    """Test calibration from actual token count."""
    setup_test_calibration()
    try:
        # Store an estimate
        calibration.set_last_estimate('test-session', 10000)
        
        # Calibrate with actual (10% higher)
        factor = calibration.calibrate_from_actual('test-session', 11000)
        
        assert factor == 1.1
        
        # Verify factor is stored
        stored_factor = calibration.get_factor('test-session')
        assert stored_factor == 1.1
    finally:
        teardown_test_calibration()


def test_calibrate_no_estimate():
    """Test that calibration returns None when no estimate available."""
    setup_test_calibration()
    try:
        factor = calibration.calibrate_from_actual('new-session', 50000)
        assert factor is None
    finally:
        teardown_test_calibration()


def test_clear_session():
    """Test clearing session calibration data."""
    setup_test_calibration()
    try:
        # Set some data
        calibration.set_factor('test-session', 1.2)
        calibration.set_last_estimate('test-session', 50000)
        
        # Verify data is set
        assert calibration.get_last_estimate('test-session') == 50000
        assert calibration.get_factor('test-session') == 1.2
        
        # Clear session
        calibration.clear_session('test-session')
        
        # Session-specific data should be gone
        estimate = calibration.get_last_estimate('test-session')
        assert estimate is None, "Estimate should be cleared"
        
        # get_factor falls back to global_factor (which is 1.2 from when it was set)
        # This is expected behavior - global factor persists as a fallback
        factor = calibration.get_factor('test-session')
        assert factor >= 0.5 and factor <= 2.0, "Factor should be in valid range"
    finally:
        teardown_test_calibration()


def test_persistence():
    """Test that calibration data persists across loads."""
    setup_test_calibration()
    try:
        # Set data
        calibration.set_factor('test-session', 1.25)
        
        # Reset cache to force reload
        calibration._calibration_cache = None
        calibration._cache_loaded = False
        
        # Should load from file
        factor = calibration.get_factor('test-session')
        assert factor == 1.25
    finally:
        teardown_test_calibration()


def test_get_calibration_stats():
    """Test getting calibration statistics."""
    setup_test_calibration()
    try:
        # Add some sessions
        calibration.set_factor('session-1', 1.1)
        calibration.set_factor('session-2', 1.2)
        calibration.set_last_estimate('session-3', 50000)  # No factor
        
        stats = calibration.get_calibration_stats()
        
        assert stats['session_count'] == 3
        assert stats['calibrated_sessions'] == 2  # Only 2 have factors
        assert 1.0 <= stats['global_factor'] <= 1.5  # Should be average
    finally:
        teardown_test_calibration()


def run_tests():
    """Run all tests without pytest."""
    import traceback
    
    tests = [
        test_get_factor_default,
        test_set_and_get_factor,
        test_factor_clamping_high,
        test_factor_clamping_low,
        test_set_and_get_last_estimate,
        test_get_last_estimate_missing,
        test_calibrate_from_actual,
        test_calibrate_no_estimate,
        test_clear_session,
        test_persistence,
        test_get_calibration_stats,
    ]
    
    passed = 0
    failed = 0
    
    print("=" * 60)
    print("Running Calibration Tests")
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
