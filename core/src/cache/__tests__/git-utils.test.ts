/**
 * Git Utils Tests
 */

import { jest } from '@jest/globals';

// Mock child_process
const mockExecSync = jest.fn<(...args: any[]) => string>();

jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
}));

// Mock fs for readGitBranchFromJsonl
const mockOpen = jest.fn<(...args: any[]) => Promise<any>>();

jest.unstable_mockModule('fs', () => ({
  promises: {
    open: mockOpen,
  },
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

describe('git-utils', () => {
  let detectGitInfo: typeof import('../git-utils.js').detectGitInfo;
  let readGitBranchFromJsonl: typeof import('../git-utils.js').readGitBranchFromJsonl;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import('../git-utils.js');
    detectGitInfo = mod.detectGitInfo;
    readGitBranchFromJsonl = mod.readGitBranchFromJsonl;
  });

  describe('detectGitInfo', () => {
    it('should return empty object for non-git directory', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not a git repository');
      });

      const result = detectGitInfo('/tmp/not-a-repo');
      expect(result).toEqual({});
    });

    it('should detect normal git repo with branch', () => {
      mockExecSync.mockReturnValueOnce('main\n/Users/gole/projects/my-repo/.git\n');

      const result = detectGitInfo('/Users/gole/projects/my-repo');
      expect(result.branch).toBe('main');
      expect(result.repoRoot).toBe('/Users/gole/projects/my-repo');
      expect(result.worktree).toBeUndefined();
    });

    it('should detect worktree (common dir does not end in .git)', () => {
      mockExecSync.mockReturnValueOnce('feature-branch\n/Users/gole/projects/my-repo/.git/worktrees/feature\n');

      const result = detectGitInfo('/Users/gole/projects/my-repo-feature');
      expect(result.branch).toBe('feature-branch');
      expect(result.worktree).toBe('my-repo-feature');
    });

    it('should walk up parent directories when path does not exist', () => {
      let callCount = 0;
      mockExecSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('not a git repository');
        }
        return 'main\n/Users/gole/projects/.git\n';
      });

      const result = detectGitInfo('/Users/gole/projects/deleted-worktree');
      expect(result.branch).toBe('main');
    });

    it('should return only branch when commonDir is empty', () => {
      mockExecSync.mockReturnValueOnce('main\n');

      const result = detectGitInfo('/some/path');
      expect(result.branch).toBe('main');
      expect(result.repoRoot).toBeUndefined();
    });
  });

  describe('readGitBranchFromJsonl', () => {
    it('should extract gitBranch from early JSONL entries', async () => {
      const jsonLine = JSON.stringify({ type: 'system', gitBranch: 'feature-123' });
      const content = Buffer.from(jsonLine + '\n');

      const mockHandle = {
        read: jest.fn<(...args: any[]) => Promise<{ bytesRead: number }>>().mockImplementation(
          (buffer: any) => {
            content.copy(buffer);
            return Promise.resolve({ bytesRead: content.length });
          }
        ),
        close: jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined),
      };

      mockOpen.mockResolvedValue(mockHandle);

      const result = await readGitBranchFromJsonl('/path/to/session.jsonl');
      expect(result).toBe('feature-123');
    });

    it('should return null when file does not exist', async () => {
      mockOpen.mockRejectedValue(new Error('ENOENT'));

      const result = await readGitBranchFromJsonl('/nonexistent/file.jsonl');
      expect(result).toBeNull();
    });

    it('should return null when no gitBranch field exists', async () => {
      const jsonLine = JSON.stringify({ type: 'system', other: 'data' });
      const content = Buffer.from(jsonLine + '\n');

      const mockHandle = {
        read: jest.fn<(...args: any[]) => Promise<{ bytesRead: number }>>().mockImplementation(
          (buffer: any) => {
            content.copy(buffer);
            return Promise.resolve({ bytesRead: content.length });
          }
        ),
        close: jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined),
      };

      mockOpen.mockResolvedValue(mockHandle);

      const result = await readGitBranchFromJsonl('/path/to/session.jsonl');
      expect(result).toBeNull();
    });

    it('should handle partial/corrupted JSON lines', async () => {
      const content = Buffer.from('{"broken json\n' + JSON.stringify({ gitBranch: 'main' }) + '\n');

      const mockHandle = {
        read: jest.fn<(...args: any[]) => Promise<{ bytesRead: number }>>().mockImplementation(
          (buffer: any) => {
            content.copy(buffer);
            return Promise.resolve({ bytesRead: content.length });
          }
        ),
        close: jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined),
      };

      mockOpen.mockResolvedValue(mockHandle);

      const result = await readGitBranchFromJsonl('/path/to/file.jsonl');
      expect(result).toBe('main');
    });
  });
});
