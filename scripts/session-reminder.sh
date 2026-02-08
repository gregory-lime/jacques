#!/bin/bash
# Reminds Claude Code to check scratchpad at session start

cat << 'EOF'

📋 REMINDER: Check .claude/scratchpad.md for current tasks

Current tasks: .claude/scratchpad.md (Current Tasks section)
Update checkboxes as you complete work
Log blockers to Blockers & Issues section

EOF
