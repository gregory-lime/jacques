/**
 * Tests for git-info module
 */

import { detectGitInfo } from './git-info.js';

// We test against the actual repo since we're in a git repo
describe('detectGitInfo', () => {
  it('detects git info for a git repository', async () => {
    // Use the current project directory which IS a git repo
    const cwd = process.cwd().replace(/\/server$/, ''); // Navigate to project root
    const info = await detectGitInfo(cwd);

    expect(info.branch).toBeTruthy();
    expect(typeof info.branch).toBe('string');
    expect(info.repoRoot).toBeTruthy();
    // worktree is null for normal repos
  });

  it('returns nulls for non-git directory', async () => {
    const info = await detectGitInfo('/tmp');
    expect(info.branch).toBeNull();
    expect(info.worktree).toBeNull();
    expect(info.repoRoot).toBeNull();
  });

  it('returns nulls for non-existent directory', async () => {
    const info = await detectGitInfo('/nonexistent/path/that/does/not/exist');
    expect(info.branch).toBeNull();
    expect(info.worktree).toBeNull();
    expect(info.repoRoot).toBeNull();
  });

  it('returns expected GitInfo shape', async () => {
    const info = await detectGitInfo('/tmp');
    expect(info).toHaveProperty('branch');
    expect(info).toHaveProperty('worktree');
    expect(info).toHaveProperty('repoRoot');
  });
});
