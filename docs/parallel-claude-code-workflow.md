# Parallel Claude Code Workflow

Reference guide for running multiple Claude Code instances on the same project.

## Quick Start: Git Worktrees

```bash
# Create worktrees (from main repo directory)
git worktree add ../jacques-feature-name -b feature/name
git worktree add ../jacques-bugfix-name -b fix/name

# Launch Claude Code in separate terminals
cd ../jacques-feature-name && claude
cd ../jacques-bugfix-name && claude

# List active worktrees
git worktree list

# Clean up after merging
git worktree remove ../jacques-feature-name
```

Each worktree needs its own `npm install` (or equivalent dependency setup).

## Merging Strategies

### Option 1: PR-Based (Safest)
Each worktree pushes its branch, creates a PR, merge independently to main.

### Option 2: Cherry-Pick
```bash
git checkout main
git cherry-pick <commit-from-feature-branch>
```

### Option 3: Claude-Assisted Rebase
Let the Claude instance that built the feature resolve its own conflicts:
```bash
# In the feature worktree, have Claude run:
git rebase main
# Claude examines target branch changes with: git log -p -n 3 main -- <conflicting-file>
# Then resolves conflicts with full context of both sides
git push --force-with-lease
```

### Preventing Conflicts
- Merge main into feature branches frequently
- Before parallelizing, ask Claude: "Would tasks X and Y touch the same files?"
- For major refactors that touch many files, work sequentially instead

## Pitfalls to Avoid

1. **Never run two instances in the same directory** -- causes context bleeding and shared history bugs
2. **macOS file locking** -- instances can freeze due to lock contention in `~/.local/share/claude/versions/`; keep Claude Code updated
3. **Settings corruption** -- concurrent writes to `.claude.json` without locking; worktrees avoid this
4. **Worktree bootstrapping** -- each needs `npm install`; automate with scripts or consider GitButler
5. **Context exhaustion** -- limit to 3-5 parallel sessions; don't create worktrees inside Claude (use a bash loop outside)
6. **Version downgrade race** -- 8+ concurrent instances can trigger auto-update races; pin version or stagger launches
7. **IDE integration** -- use terminal `claude` CLI for parallel work, not IDE extensions (risk of system freezes)

## Alternative: GitButler

GitButler uses Claude Code lifecycle hooks to auto-sort parallel session work into branches without worktrees. Configure hooks in `.claude/settings.json`:
- `PreToolUse` -> `but claude pre-tool`
- `PostToolUse` -> `but claude post-tool`
- `Stop` -> `but claude stop`

Avoids per-worktree dependency installation. See: https://docs.gitbutler.com/features/ai-integration/claude-code-hooks

## Claude Code Tips for Parallel Work

- `/rename` sessions for easy identification (e.g., `auth-refactor`, `fix-memory-leak`)
- `/resume` picker shows sessions across all worktrees in the same repo
- Anthropic internal team uses 3-5 local worktrees + color-coded terminal tabs
- For batch tasks (10+), loop outside Claude to avoid context exhaustion:
  ```bash
  for task in auth logging caching; do
    git worktree add ../project-$task -b feature/$task
    cd ../project-$task && npm install && claude --print "Implement $task"
    cd -
  done
  ```

## Tools

| Tool | What It Does |
|------|-------------|
| [worktree-workflow](https://github.com/forrestchang/worktree-workflow) | `claude-wt` script for automated worktree + Claude launch |
| [Crystal](https://github.com/stravu/crystal) | Desktop app for parallel Claude sessions in worktrees |
| [ccswitch](https://www.ksred.com/building-ccswitch-managing-multiple-claude-code-sessions-without-the-chaos/) | Centralized worktree storage manager |
| [GitButler](https://docs.gitbutler.com/features/ai-integration/claude-code-hooks) | Auto-branches via hooks, no worktrees needed |

## Sources

- [Claude Code: Common Workflows](https://code.claude.com/docs/en/common-workflows)
- [Anthropic: Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [incident.io: Shipping Faster with Claude Code and Git Worktrees](https://incident.io/blog/shipping-faster-with-claude-code-and-git-worktrees)
- [GitButler: Parallel Claude Code](https://blog.gitbutler.com/parallel-claude-code)
- [Raine Virta: Resolve Conflicts with Claude](https://raine.dev/blog/resolve-conflicts-with-claude/)
- [InfoQ: Inside Claude Code Creator's Workflow](https://www.infoq.com/news/2026/01/claude-code-creator-workflow/)
