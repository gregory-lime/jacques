#!/bin/bash
#
# Jacques statusLine Script
#
# Receives JSON from Claude Code's statusLine feature via stdin.
# Extracts session_id and context_window data.
# Sends context update to Jacques server via Unix socket.
# Displays abbreviated status for Claude Code's status bar.
#

# Skip if running as subprocess, JACQUES_SKIP=1, or ~/.jacques/skip exists
if [ "$JACQUES_SUBPROCESS" = "1" ] || [ "$JACQUES_SKIP" = "1" ] || [ -f "$HOME/.jacques/skip" ]; then
  exit 0
fi

# Read all input from stdin
input=$(cat)

# Exit if no input
if [ -z "$input" ]; then
  exit 0
fi

# Capture timestamp once, reuse everywhere (milliseconds to match Date.now())
now=$(( $(date +%s) * 1000 ))

# Extract all fields in a single jq invocation (saves ~20 forks)
IFS='§' read -r session_id used_pct remaining_pct ctx_size total_input total_output \
  model model_display cwd project_dir transcript_path <<< \
  "$(jq -r '[
    .session_id // "",
    (.context_window.used_percentage // 0 | tostring),
    (.context_window.remaining_percentage // 100 | tostring),
    (.context_window.context_window_size // 0 | tostring),
    (.context_window.total_input_tokens // 0 | tostring),
    (.context_window.total_output_tokens // 0 | tostring),
    .model.id // "unknown",
    .model.display_name // "Unknown",
    .workspace.current_dir // .cwd // "",
    .workspace.project_dir // "",
    .transcript_path // ""
  ] | join("§")' <<< "$input")"

# Detect git branch, worktree, and repo root from project directory (cached for 60s)
# Try cwd first (always a real filesystem path), then project_dir as fallback
git_branch=""
git_worktree=""
git_repo_root=""
git_dir="${project_dir:-$cwd}"
if [ -n "$git_dir" ] && [ -d "$git_dir" ]; then
  git_cache="/tmp/jacques-git-$(echo "$git_dir" | tr '/' '-').cache"
  cache_stale=1
  if [ -f "$git_cache" ]; then
    cache_age=$(( now - $(stat -f %m "$git_cache" 2>/dev/null || echo 0) ))
    [ "$cache_age" -lt 60 ] && cache_stale=0
  fi
  if [ "$cache_stale" = "1" ]; then
    # Use git-detect.sh as single source of truth
    script_dir="$(cd "$(dirname "$0")" && pwd)"
    if [ -x "$script_dir/git-detect.sh" ]; then
      git_output=$("$script_dir/git-detect.sh" "$git_dir")
      git_branch=$(echo "$git_output" | sed -n '1p')
      git_worktree=$(echo "$git_output" | sed -n '2p')
      git_repo_root=$(echo "$git_output" | sed -n '3p')
    fi
    printf '%s\n%s\n%s' "$git_branch" "$git_worktree" "$git_repo_root" > "$git_cache" 2>/dev/null
  else
    git_branch=$(sed -n '1p' "$git_cache" 2>/dev/null)
    git_worktree=$(sed -n '2p' "$git_cache" 2>/dev/null)
    git_repo_root=$(sed -n '3p' "$git_cache" 2>/dev/null)
  fi
fi

# Extract session title with 5-min cache
session_title=""
title_cache="/tmp/jacques-title-${session_id}.cache"
if [ -n "$session_id" ] && [ -f "$title_cache" ]; then
  cache_age=$(( now - $(stat -f %m "$title_cache" 2>/dev/null || echo 0) ))
  if [ "$cache_age" -lt 300 ]; then
    session_title=$(cat "$title_cache" 2>/dev/null)
  fi
fi

if [ -z "$session_title" ]; then
  # Source 1: Try sessions-index.json (has the dynamic title Claude shows in resume list)
  if [ -n "$transcript_path" ] && [ -n "$session_id" ]; then
    transcript_dir=$(dirname "$transcript_path")
    sessions_index="$transcript_dir/sessions-index.json"
    if [ -f "$sessions_index" ]; then
      session_title=$(jq -r --arg sid "$session_id" '.entries[] | select(.sessionId == $sid) | .summary // empty' "$sessions_index" 2>/dev/null)
    fi
  fi

  # Source 2: Try transcript summary entries (written during conversation)
  if [ -z "$session_title" ] && [ -n "$transcript_path" ] && [ -f "$transcript_path" ]; then
    session_title=$(grep '"type":"summary"' "$transcript_path" 2>/dev/null | tail -1 | jq -r '.summary // empty' 2>/dev/null)
  fi

  # Source 3: First REAL user message (skip internal Claude Code messages)
  # Always extract first user message — needed for plan trigger check even if Source 1/2 found a title
  first_user_msg=""
  if [ -n "$transcript_path" ] && [ -f "$transcript_path" ]; then
    first_user_msg=$(grep '"type":"user"' "$transcript_path" 2>/dev/null | while read -r line; do
      content=$(echo "$line" | jq -r '.message.content // empty' 2>/dev/null)
      [ -z "$content" ] && continue
      first_char="${content:0:1}"
      if [ "$first_char" = "<" ] || [ "$first_char" = "[" ]; then
        continue
      fi
      echo "$content" | head -c 200
      break
    done)
  fi

  # If first message is a plan trigger, prefer it over sessions-index summary
  # (display code needs the trigger + heading to extract plan title)
  if [ -n "$first_user_msg" ]; then
    is_plan=$(echo "$first_user_msg" | head -1 | grep -iE '^(implement the following plan|here is the plan|follow this plan)[: ]' 2>/dev/null)
    if [ -n "$is_plan" ]; then
      session_title="$first_user_msg"
    fi
  fi

  # Fallback: use first user message if no title found
  if [ -z "$session_title" ] && [ -n "$first_user_msg" ]; then
    session_title="$first_user_msg"
  fi

  # Cache the extracted title
  if [ -n "$session_id" ] && [ -n "$session_title" ]; then
    printf '%s' "$session_title" > "$title_cache" 2>/dev/null
  fi
fi


# Read auto-compact settings with 5-min cache
autocompact_enabled="true"
autocompact_threshold="${CLAUDE_AUTOCOMPACT_PCT_OVERRIDE:-95}"
autocompact_bug_threshold="null"

settings_cache="/tmp/jacques-settings.cache"
settings_valid=0
if [ -f "$settings_cache" ]; then
  cache_age=$(( now - $(stat -f %m "$settings_cache" 2>/dev/null || echo 0) ))
  if [ "$cache_age" -lt 300 ]; then
    IFS='|' read -r autocompact_enabled autocompact_threshold autocompact_bug_threshold < "$settings_cache"
    settings_valid=1
  fi
fi

if [ "$settings_valid" = "0" ] && [ -f "$HOME/.claude/settings.json" ]; then
  ac_setting=$(jq -r '.autoCompact // "null"' "$HOME/.claude/settings.json" 2>/dev/null)
  if [ "$ac_setting" = "false" ]; then
    autocompact_enabled="false"
    autocompact_bug_threshold="78"
  fi
  printf '%s|%s|%s' "$autocompact_enabled" "$autocompact_threshold" "$autocompact_bug_threshold" > "$settings_cache" 2>/dev/null
fi

# Only proceed if we have a session_id
if [ -z "$session_id" ]; then
  printf "ctx:?%%"
  exit 0
fi

# Capture terminal identity for focus detection
iterm_session_id="${ITERM_SESSION_ID:-}"
term_session_id="${TERM_SESSION_ID:-}"
kitty_window_id="${KITTY_WINDOW_ID:-}"
terminal_pid="$PPID"

# Build terminal_key (same logic as jacques-register-session.py)
if [ -n "$iterm_session_id" ]; then
  terminal_key="ITERM:$iterm_session_id"
elif [ -n "$kitty_window_id" ]; then
  terminal_key="KITTY:$kitty_window_id"
elif [ -n "$term_session_id" ]; then
  terminal_key="TERM:$term_session_id"
else
  # Fallback: TTY or PID (matches Python adapter's priority)
  tty_path=$(tty 2>/dev/null)
  if [ -n "$tty_path" ] && [ "$tty_path" != "not a tty" ]; then
    terminal_key="TTY:$tty_path"
  elif [ -n "$terminal_pid" ] && [ "$terminal_pid" -gt 0 ] 2>/dev/null; then
    terminal_key="PID:$terminal_pid"
  else
    terminal_key=""
  fi
fi

# Send to Jacques server (if socket exists and server is running)
if [ -S /tmp/jacques.sock ]; then
  # Escape special characters in session_title using bash builtins (saves 1 fork)
  escaped_title="${session_title//\\/\\\\}"
  escaped_title="${escaped_title//\"/\\\"}"
  escaped_title="${escaped_title//$'\t'/\\t}"
  escaped_title="${escaped_title//$'\n'/ }"
  payload=$(cat <<EOF
{"event":"context_update","session_id":"$session_id","used_percentage":$used_pct,"remaining_percentage":$remaining_pct,"context_window_size":$ctx_size,"total_input_tokens":$total_input,"total_output_tokens":$total_output,"model":"$model","model_display_name":"$model_display","cwd":"$cwd","project_dir":"$project_dir","timestamp":$now,"autocompact":{"enabled":$autocompact_enabled,"threshold":$autocompact_threshold,"bug_threshold":$autocompact_bug_threshold},"terminal_key":"$terminal_key","terminal_pid":$terminal_pid,"session_title":"$escaped_title","transcript_path":"$transcript_path","git_branch":"$git_branch","git_worktree":"$git_worktree","git_repo_root":"$git_repo_root"}
EOF
)

  # Send to socket (non-blocking, ignore errors)
  echo "$payload" | nc -U /tmp/jacques.sock 2>/dev/null &
fi

# Display status line
# Format: [Model] ctx:XX% @branch [AC:ON@95%]
used_int=${used_pct%.*}
if [ -z "$used_int" ]; then
  used_int="0"
fi

# Git branch indicator
git_part=""
if [ -n "$git_branch" ]; then
  git_part=" @${git_branch}"
fi

printf "[%s] ctx:%s%%%s" "$model_display" "$used_int" "$git_part"
