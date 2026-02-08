#!/usr/bin/env python3
"""
pre-compact.py - Receive Cursor context metrics and calibrate estimates

Called on Cursor's preCompact hook.
This is the KEY hook that provides context usage metrics for Cursor!

The preCompact event fires when Cursor is about to compact the context,
and contains valuable information about current context window usage.

Additionally, this hook calibrates token estimation by comparing
actual metrics with previous estimates.
"""
import sys
from pathlib import Path

# Add parent directory to path for adapter imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from adapters.cursor import CursorAdapter
from adapters import calibration


def main():
    adapter = CursorAdapter()
    
    # Parse input from stdin
    input_data = adapter.parse_input()
    if not input_data:
        sys.exit(0)
    
    # Debug logging (important for understanding Cursor's data format)
    adapter.log_debug(input_data, 'preCompact')
    
    # Get session ID and actual token count for calibration
    session_id = input_data.get('conversation_id')
    actual_tokens = input_data.get('context_tokens', 0)
    
    if session_id and actual_tokens > 0:
        # Calibrate: compare actual vs estimated
        factor = calibration.calibrate_from_actual(session_id, actual_tokens)
        
        if factor:
            # Log calibration for debugging
            try:
                with open('/tmp/jacques-hook-debug.log', 'a') as f:
                    f.write(f"[calibration] session={session_id[:8]}... ")
                    f.write(f"actual={actual_tokens} factor={factor:.2f}\n")
            except:
                pass
    
    # Build and send context_update payload (with actual values)
    payload = adapter.build_pre_compact_payload(input_data)
    if payload:
        # Mark this as actual (not estimate) by ensuring is_estimate is False/absent
        payload['is_estimate'] = False
        adapter.send_event(payload, use_fallback=False)


if __name__ == '__main__':
    main()
