#!/usr/bin/env bash
#
# git-detect.sh - Single source of truth for git detection
#
# Usage: git-detect.sh <project_dir>
# Outputs 3 lines:
#   1. git_branch   - current branch name (empty if not git)
#   2. git_worktree - worktree basename (empty if main repo)
#   3. git_repo_root - main worktree root path (empty if not git)
#
# Detection algorithm:
#   git rev-parse --abbrev-ref HEAD            -> branch name
#   git rev-parse --git-common-dir             -> shared .git path
#     Returns ".git" (relative) -> normal repo -> repo_root = project_dir
#     Returns absolute path     -> worktree    -> repo_root = dirname(path)

project_dir="$1"

if [ -z "$project_dir" ] || [ ! -d "$project_dir" ]; then
  printf '\n\n\n'
  exit 0
fi

# Single git command to get both branch and common-dir
git_output=$(git -C "$project_dir" rev-parse --abbrev-ref HEAD --git-common-dir 2>/dev/null)

if [ -z "$git_output" ]; then
  printf '\n\n\n'
  exit 0
fi

branch=$(echo "$git_output" | sed -n '1p')
common=$(echo "$git_output" | sed -n '2p')

worktree=""
repo_root=""

if [ "$common" = ".git" ]; then
  # Normal repo (not a worktree) - resolve to absolute path
  repo_root=$(cd "$project_dir" && pwd)
elif [ -n "$common" ]; then
  # Worktree - common dir is absolute path to shared .git
  repo_root=$(dirname "$common")
  worktree=$(basename "$project_dir")
fi

printf '%s\n%s\n%s\n' "$branch" "$worktree" "$repo_root"
