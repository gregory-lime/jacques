/**
 * Tests for worktree module
 */

import {
  validateWorktreeName,
  computeWorktreePath,
  parsePorcelainOutput,
} from './worktree.js';

describe('validateWorktreeName', () => {
  it('accepts valid names', () => {
    expect(validateWorktreeName('feature')).toBeNull();
    expect(validateWorktreeName('my-branch')).toBeNull();
    expect(validateWorktreeName('fix_123')).toBeNull();
    expect(validateWorktreeName('ABC-xyz-123')).toBeNull();
  });

  it('rejects empty names', () => {
    expect(validateWorktreeName('')).toBe('Name is required');
  });

  it('rejects names with spaces', () => {
    expect(validateWorktreeName('my branch')).toMatch(/letters, numbers/);
  });

  it('rejects names with special characters', () => {
    expect(validateWorktreeName('feat/branch')).toMatch(/letters, numbers/);
    expect(validateWorktreeName('feat.branch')).toMatch(/letters, numbers/);
    expect(validateWorktreeName('feat@branch')).toMatch(/letters, numbers/);
    expect(validateWorktreeName('feat!branch')).toMatch(/letters, numbers/);
  });

  it('rejects names over 100 characters', () => {
    const longName = 'a'.repeat(101);
    expect(validateWorktreeName(longName)).toMatch(/100 characters/);
  });

  it('accepts names of exactly 100 characters', () => {
    const name = 'a'.repeat(100);
    expect(validateWorktreeName(name)).toBeNull();
  });
});

describe('computeWorktreePath', () => {
  it('creates sibling directory with name suffix', () => {
    expect(computeWorktreePath('/Users/dev/my-project', 'feature'))
      .toBe('/Users/dev/my-project-feature');
  });

  it('handles repo roots with trailing slash-like naming', () => {
    expect(computeWorktreePath('/home/user/app', 'hotfix'))
      .toBe('/home/user/app-hotfix');
  });

  it('handles deeply nested repo roots', () => {
    expect(computeWorktreePath('/a/b/c/d/repo', 'test'))
      .toBe('/a/b/c/d/repo-test');
  });
});

describe('parsePorcelainOutput', () => {
  it('parses single worktree (main only)', () => {
    const output = `worktree /Users/dev/project
HEAD abc123def456
branch refs/heads/main

`;
    const entries = parsePorcelainOutput(output, '/Users/dev/project');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      name: 'project',
      path: '/Users/dev/project',
      branch: 'main',
      isMain: true,
    });
  });

  it('parses multiple worktrees', () => {
    const output = `worktree /Users/dev/project
HEAD abc123
branch refs/heads/main

worktree /Users/dev/project-feature
HEAD def456
branch refs/heads/feature

worktree /Users/dev/project-hotfix
HEAD 789012
branch refs/heads/hotfix

`;
    const entries = parsePorcelainOutput(output, '/Users/dev/project');
    expect(entries).toHaveLength(3);

    expect(entries[0].isMain).toBe(true);
    expect(entries[0].branch).toBe('main');

    expect(entries[1].isMain).toBe(false);
    expect(entries[1].name).toBe('project-feature');
    expect(entries[1].branch).toBe('feature');

    expect(entries[2].isMain).toBe(false);
    expect(entries[2].name).toBe('project-hotfix');
    expect(entries[2].branch).toBe('hotfix');
  });

  it('handles detached HEAD (no branch line)', () => {
    const output = `worktree /Users/dev/project
HEAD abc123
detached

`;
    const entries = parsePorcelainOutput(output, '/Users/dev/project');
    expect(entries).toHaveLength(1);
    expect(entries[0].branch).toBeNull();
    expect(entries[0].isMain).toBe(true);
  });

  it('handles empty output', () => {
    expect(parsePorcelainOutput('', '/some/path')).toEqual([]);
    expect(parsePorcelainOutput('  \n  ', '/some/path')).toEqual([]);
  });

  it('strips refs/heads/ prefix from branch', () => {
    const output = `worktree /Users/dev/project
HEAD abc123
branch refs/heads/feature/nested-branch

`;
    const entries = parsePorcelainOutput(output, '/Users/dev/project');
    expect(entries[0].branch).toBe('feature/nested-branch');
  });
});
