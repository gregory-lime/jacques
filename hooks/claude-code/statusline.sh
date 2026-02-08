#!/bin/bash
#
# Jacques statusLine Script
#
# Receives JSON from Claude Code's statusLine feature via stdin.
# Extracts session_id and context_window data.
# Sends context update to Jacques server via Unix socket.
# Displays abbreviated status for Claude Code's status bar.
#

# DEBUG: Log that the script started (helps debug Cursor issues)
echo "$(date '+%Y-%m-%d %H:%M:%S') SCRIPT_START" >> /tmp/jacques-statusline-debug.log

# Read all input from stdin
input=$(cat)

# Exit if no input
if [ -z "$input" ]; then
  exit 0
fi

# DEBUG: Log the raw JSON input to help diagnose field path issues
# Remove this line after debugging is complete
echo "$(date '+%Y-%m-%d %H:%M:%S') $input" >> /tmp/jacques-statusline-debug.log

# Extract key fields using jq
# Note: Claude Code sends null for percentages at session start, we need to handle this
session_id=$(echo "$input" | jq -r '.session_id // empty')

# Handle null values explicitly - jq outputs "null" string for null values even with // fallback in some cases
used_pct_raw=$(echo "$input" | jq -r '.context_window.used_percentage')
remaining_pct_raw=$(echo "$input" | jq -r '.context_window.remaining_percentage')

# Convert null/empty to 0 for used_percentage
if [ "$used_pct_raw" = "null" ] || [ -z "$used_pct_raw" ]; then
  used_pct=0
else
  used_pct=$used_pct_raw
fi

# Convert null/empty to 100 for remaining_percentage  
if [ "$remaining_pct_raw" = "null" ] || [ -z "$remaining_pct_raw" ]; then
  remaining_pct=100
else
  remaining_pct=$remaining_pct_raw
fi

ctx_size=$(echo "$input" | jq -r '.context_window.context_window_size // 0')
total_input=$(echo "$input" | jq -r '.context_window.total_input_tokens // 0')
total_output=$(echo "$input" | jq -r '.context_window.total_output_tokens // 0')
model=$(echo "$input" | jq -r '.model.id // "unknown"')
model_display=$(echo "$input" | jq -r '.model.display_name // "Unknown"')
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
project_dir=$(echo "$input" | jq -r '.workspace.project_dir // ""')

# Only proceed if we have a session_id
if [ -z "$session_id" ]; then
  # No session_id, just show basic status
  printf "ctx:?%%"
  exit 0
fi

# Send to Jacques server (if socket exists and server is running)
if [ -S /tmp/jacques.sock ]; then
  # Build JSON payload
  timestamp=$(( $(date +%s) * 1000 ))
  payload=$(cat <<EOF
{"event":"context_update","session_id":"$session_id","used_percentage":$used_pct,"remaining_percentage":$remaining_pct,"context_window_size":$ctx_size,"total_input_tokens":$total_input,"total_output_tokens":$total_output,"model":"$model","model_display_name":"$model_display","cwd":"$cwd","project_dir":"$project_dir","timestamp":$timestamp}
EOF
)
  
  # Send to socket (non-blocking, ignore errors)
  echo "$payload" | nc -U /tmp/jacques.sock 2>/dev/null &
fi

# Display abbreviated status in Claude Code status bar
# Format: [Model] ctx:XX%
# Round percentage for display
used_int=${used_pct%.*}
if [ -z "$used_int" ]; then
  used_int="0"
fi

# Add warning indicator if context is high
if [ "$used_int" -ge 80 ]; then
  printf "[%s] ctx:%s%% ⚠️" "$model_display" "$used_int"
elif [ "$used_int" -ge 60 ]; then
  printf "[%s] ctx:%s%%" "$model_display" "$used_int"
else
  printf "[%s] ctx:%s%%" "$model_display" "$used_int"
fi
