#!/usr/bin/env python3
"""
after-agent-response.py - Estimate context usage after each AI response

Called on Cursor's afterAgentResponse hook.
Reads the transcript file to estimate current token usage.

This hook fires after EVERY AI response, allowing us to show
real-time context estimates instead of waiting for preCompact.

Flow:
1. Parse input (contains transcript_path)
2. Read transcript file content
3. Estimate tokens using tiktoken
4. Add skill overhead (not in transcript but always in context)
5. Apply calibration factor if available
6. Send context_update with estimated percentage
"""
import sys
from pathlib import Path

# Add parent directory to path for adapter imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from adapters.cursor import CursorAdapter
from adapters import tokenizer, calibration, skills


def main():
    adapter = CursorAdapter()
    
    # Parse input from stdin
    input_data = adapter.parse_input()
    if not input_data:
        sys.exit(0)
    
    # Debug logging
    adapter.log_debug(input_data, 'afterAgentResponse')
    
    # Get transcript path
    transcript_path = input_data.get('transcript_path')
    if not transcript_path:
        # No transcript available - can't estimate
        # Stay silent rather than guessing
        sys.exit(0)
    
    transcript_file = Path(transcript_path)
    if not transcript_file.exists():
        sys.exit(0)
    
    # Read transcript content
    try:
        content = transcript_file.read_text(encoding='utf-8')
    except Exception as e:
        print(f"[jacques:after-agent-response] Error reading transcript: {e}", file=sys.stderr)
        sys.exit(0)
    
    if not content:
        sys.exit(0)
    
    # Estimate tokens from transcript
    transcript_tokens = tokenizer.estimate_tokens(content)
    
    # Get model info
    model = adapter.get_model(input_data)
    
    # Apply thinking multiplier for extended thinking models
    # Thinking blocks are NOT in transcript but ARE in context
    thinking_multiplier = tokenizer.get_thinking_multiplier(model)
    adjusted_transcript_tokens = int(transcript_tokens * thinking_multiplier)
    
    # Add skill overhead (always in context but not in transcript)
    initial_estimate = skills.get_initial_context_estimate(model)
    skill_overhead = initial_estimate['total_initial_tokens']
    
    # Total = adjusted transcript + skills + system prompts
    total_tokens = adjusted_transcript_tokens + skill_overhead
    
    # Get session ID for calibration
    session_id = input_data.get('conversation_id')
    
    if session_id:
        # Apply calibration factor if available (further refinement)
        factor = calibration.get_factor(session_id)
        total_tokens = int(total_tokens * factor)
        
        # Store this estimate for future calibration
        calibration.set_last_estimate(session_id, total_tokens)
    
    # Build and send context estimate payload
    payload = adapter.build_context_estimate_payload(input_data, total_tokens, model)
    if payload:
        adapter.send_event(payload, use_fallback=False)


if __name__ == '__main__':
    main()
