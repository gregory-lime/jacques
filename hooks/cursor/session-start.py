#!/usr/bin/env python3
"""
session-start.py - Register Cursor session with Jacques

Called on Cursor's sessionStart hook.
Registers new Cursor Native AI session with the Jacques server.

Also sends initial context estimate based on installed skills.
Cursor injects all agent_skills into every chat context, so we estimate
that overhead to show a realistic starting percentage instead of 0%.

Typical overhead:
- 21 skills ≈ 34,000 tokens
- On 200k context (Claude): ~17% used by skills alone
"""
import sys
from pathlib import Path

# Add parent directory to path for adapter imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from adapters.cursor import CursorAdapter
from adapters import skills


def main():
    adapter = CursorAdapter()
    
    # Parse input from stdin
    input_data = adapter.parse_input()
    if not input_data:
        sys.exit(0)
    
    # Debug logging
    adapter.log_debug(input_data, 'sessionStart')
    
    # Build and send session_start payload
    payload = adapter.build_session_start_payload(input_data)
    if payload:
        adapter.send_event(payload, use_fallback=True)
    
    # Estimate initial context from installed skills
    # Cursor injects all skills into context, so this is more accurate than 0%
    model = adapter.get_model(input_data)
    initial_estimate = skills.get_initial_context_estimate(model)
    
    # Log skill overhead for debugging
    try:
        with open('/tmp/jacques-hook-debug.log', 'a') as f:
            f.write(f"[session-start] Initial estimate: {skills.get_skills_summary()}\n")
            f.write(f"[session-start] Starting at {initial_estimate['used_percentage']}%\n")
    except:
        pass
    
    # Send initial context estimate (skills + system prompt overhead)
    context_payload = adapter.build_context_estimate_payload(
        input_data,
        estimated_tokens=initial_estimate['total_initial_tokens'],
        model=model,
    )
    if context_payload:
        adapter.send_event(context_payload, use_fallback=False)


if __name__ == '__main__':
    main()
