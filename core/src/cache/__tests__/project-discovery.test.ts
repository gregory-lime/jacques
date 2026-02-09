/**
 * Project Discovery Tests
 */

import { jest } from '@jest/globals';
import * as path from 'path';
import type { SessionEntry, SessionIndex } from '../types.js';

// Mock dependencies (ESM-compatible)
const mockGetSessionIndex = jest.fn<() => Promise<SessionIndex>>();
const mockDetectGitInfo = jest.fn<() => import('../types.js').GitInfo>();
const mockGetHiddenProjects = jest.fn<() => Promise<Set<string>>>();
const mockListAllProjects = jest.fn<() => Promise<Array<{ encodedPath: string; projectPath: string; projectSlug: string }>>>();

jest.unstable_mockModule('../persistence.js', () => ({
  getSessionIndex: mockGetSessionIndex,
}));

jest.unstable_mockModule('../git-utils.js', () => ({
  detectGitInfo: mockDetectGitInfo,
}));

jest.unstable_mockModule('../hidden-projects.js', () => ({
  getHiddenProjects: mockGetHiddenProjects,
}));

jest.unstable_mockModule('../metadata-extractor.js', () => ({
  listAllProjects: mockListAllProjects,
}));

function makeSession(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    id: 'session-1',
    jsonlPath: '/home/user/.claude/projects/-Users-user-project/session-1.jsonl',
    projectPath: '/Users/user/project',
    projectSlug: 'project',
    title: 'Test Session',
    startedAt: '2025-01-01T00:00:00.000Z',
    endedAt: '2025-01-01T01:00:00.000Z',
    messageCount: 10,
    toolCallCount: 5,
    hasSubagents: false,
    fileSizeBytes: 1000,
    modifiedAt: '2025-01-01T01:00:00.000Z',
    ...overrides,
  };
}

function makeIndex(sessions: SessionEntry[]): SessionIndex {
  return {
    version: '2.0.0',
    lastScanned: '2025-01-01T00:00:00.000Z',
    sessions,
  };
}

describe('project-discovery', () => {
  let getSessionEntry: typeof import('../project-discovery.js').getSessionEntry;
  let getSessionsByProject: typeof import('../project-discovery.js').getSessionsByProject;
  let getIndexStats: typeof import('../project-discovery.js').getIndexStats;
  let discoverProjects: typeof import('../project-discovery.js').discoverProjects;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetHiddenProjects.mockResolvedValue(new Set());
    const mod = await import('../project-discovery.js');
    getSessionEntry = mod.getSessionEntry;
    getSessionsByProject = mod.getSessionsByProject;
    getIndexStats = mod.getIndexStats;
    discoverProjects = mod.discoverProjects;
  });

  describe('getSessionEntry', () => {
    it('should find session by ID', async () => {
      const session = makeSession({ id: 'abc-123' });
      mockGetSessionIndex.mockResolvedValue(makeIndex([session]));

      const result = await getSessionEntry('abc-123');
      expect(result).toEqual(session);
    });

    it('should return null for non-existent session', async () => {
      mockGetSessionIndex.mockResolvedValue(makeIndex([]));

      const result = await getSessionEntry('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getSessionsByProject', () => {
    it('should group sessions by projectSlug when no gitRepoRoot', async () => {
      const sessions = [
        makeSession({ id: 's1', projectSlug: 'project-a' }),
        makeSession({ id: 's2', projectSlug: 'project-a' }),
        makeSession({ id: 's3', projectSlug: 'project-b' }),
      ];
      mockGetSessionIndex.mockResolvedValue(makeIndex(sessions));

      const result = await getSessionsByProject();
      expect(result.get('project-a')?.length).toBe(2);
      expect(result.get('project-b')?.length).toBe(1);
    });

    it('should group worktrees by gitRepoRoot basename', async () => {
      const sessions = [
        makeSession({
          id: 's1',
          projectSlug: 'my-repo',
          gitRepoRoot: '/Users/user/repos/my-repo',
        }),
        makeSession({
          id: 's2',
          projectSlug: 'my-repo-feature',
          gitRepoRoot: '/Users/user/repos/my-repo',
        }),
      ];
      mockGetSessionIndex.mockResolvedValue(makeIndex(sessions));

      const result = await getSessionsByProject();
      expect(result.get('my-repo')?.length).toBe(2);
      expect(result.has('my-repo-feature')).toBe(false);
    });
  });

  describe('getIndexStats', () => {
    it('should compute stats from index', async () => {
      const sessions = [
        makeSession({ id: 's1', projectSlug: 'proj-a', fileSizeBytes: 500 }),
        makeSession({ id: 's2', projectSlug: 'proj-a', fileSizeBytes: 300 }),
        makeSession({ id: 's3', projectSlug: 'proj-b', fileSizeBytes: 200 }),
      ];
      mockGetSessionIndex.mockResolvedValue(makeIndex(sessions));

      const stats = await getIndexStats();
      expect(stats.totalSessions).toBe(3);
      expect(stats.totalProjects).toBe(2);
      expect(stats.totalSizeBytes).toBe(1000);
    });

    it('should return zero stats for empty index', async () => {
      mockGetSessionIndex.mockResolvedValue(makeIndex([]));

      const stats = await getIndexStats();
      expect(stats.totalSessions).toBe(0);
      expect(stats.totalProjects).toBe(0);
      expect(stats.totalSizeBytes).toBe(0);
    });
  });

  describe('discoverProjects', () => {
    it('should create standalone entry for non-git project', async () => {
      mockListAllProjects.mockResolvedValue([{
        encodedPath: '/home/user/.claude/projects/-tmp-my-project',
        projectPath: '/tmp/my-project',
        projectSlug: 'my-project',
      }]);
      mockGetSessionIndex.mockResolvedValue(makeIndex([]));
      mockDetectGitInfo.mockReturnValue({});

      const projects = await discoverProjects();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('my-project');
      expect(projects[0].isGitProject).toBe(false);
      expect(projects[0].gitRepoRoot).toBeNull();
    });

    it('should detect git project from session index', async () => {
      const session = makeSession({
        id: 's1',
        jsonlPath: '/home/user/.claude/projects/-Users-user-my-repo/s1.jsonl',
        gitRepoRoot: '/Users/user/my-repo',
      });
      mockListAllProjects.mockResolvedValue([{
        encodedPath: '/home/user/.claude/projects/-Users-user-my-repo',
        projectPath: '/Users/user/my-repo',
        projectSlug: 'my-repo',
      }]);
      mockGetSessionIndex.mockResolvedValue(makeIndex([session]));
      mockDetectGitInfo.mockReturnValue({});

      const projects = await discoverProjects();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('my-repo');
      expect(projects[0].isGitProject).toBe(true);
      expect(projects[0].gitRepoRoot).toBe('/Users/user/my-repo');
    });

    it('should detect git project from filesystem when not in index', async () => {
      mockListAllProjects.mockResolvedValue([{
        encodedPath: '/home/user/.claude/projects/-Users-user-repo',
        projectPath: '/Users/user/repo',
        projectSlug: 'repo',
      }]);
      mockGetSessionIndex.mockResolvedValue(makeIndex([]));
      mockDetectGitInfo.mockReturnValue({
        repoRoot: '/Users/user/repo',
        branch: 'main',
      });

      const projects = await discoverProjects();
      expect(projects.length).toBe(1);
      expect(projects[0].isGitProject).toBe(true);
      expect(projects[0].gitRepoRoot).toBe('/Users/user/repo');
    });

    it('should group worktrees into single project entry', async () => {
      const session1 = makeSession({
        id: 's1',
        jsonlPath: '/home/user/.claude/projects/-Users-user-my-repo/s1.jsonl',
        gitRepoRoot: '/Users/user/my-repo',
        endedAt: '2025-01-01T00:00:00.000Z',
      });
      const session2 = makeSession({
        id: 's2',
        jsonlPath: '/home/user/.claude/projects/-Users-user-my-repo-feature/s2.jsonl',
        gitRepoRoot: '/Users/user/my-repo',
        endedAt: '2025-01-02T00:00:00.000Z',
      });

      mockListAllProjects.mockResolvedValue([
        {
          encodedPath: '/home/user/.claude/projects/-Users-user-my-repo',
          projectPath: '/Users/user/my-repo',
          projectSlug: 'my-repo',
        },
        {
          encodedPath: '/home/user/.claude/projects/-Users-user-my-repo-feature',
          projectPath: '/Users/user/my-repo-feature',
          projectSlug: 'my-repo-feature',
        },
      ]);
      mockGetSessionIndex.mockResolvedValue(makeIndex([session1, session2]));

      const projects = await discoverProjects();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('my-repo');
      expect(projects[0].sessionCount).toBe(2);
      expect(projects[0].projectPaths.length).toBe(2);
      expect(projects[0].lastActivity).toBe('2025-01-02T00:00:00.000Z');
    });

    it('should filter out hidden projects', async () => {
      mockListAllProjects.mockResolvedValue([
        {
          encodedPath: '/home/user/.claude/projects/-tmp',
          projectPath: '/tmp',
          projectSlug: 'tmp',
        },
        {
          encodedPath: '/home/user/.claude/projects/-Users-user-real-project',
          projectPath: '/Users/user/real-project',
          projectSlug: 'real-project',
        },
      ]);
      mockGetSessionIndex.mockResolvedValue(makeIndex([]));
      mockDetectGitInfo.mockReturnValue({});
      mockGetHiddenProjects.mockResolvedValue(new Set(['tmp']));

      const projects = await discoverProjects();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('real-project');
    });

    it('should sort by most recent activity first', async () => {
      const sessionOld = makeSession({
        id: 's1',
        jsonlPath: '/home/user/.claude/projects/-project-old/s1.jsonl',
        endedAt: '2025-01-01T00:00:00.000Z',
      });
      const sessionNew = makeSession({
        id: 's2',
        jsonlPath: '/home/user/.claude/projects/-project-new/s2.jsonl',
        endedAt: '2025-01-10T00:00:00.000Z',
      });

      mockListAllProjects.mockResolvedValue([
        {
          encodedPath: '/home/user/.claude/projects/-project-old',
          projectPath: '/project-old',
          projectSlug: 'project-old',
        },
        {
          encodedPath: '/home/user/.claude/projects/-project-new',
          projectPath: '/project-new',
          projectSlug: 'project-new',
        },
      ]);
      mockGetSessionIndex.mockResolvedValue(makeIndex([sessionOld, sessionNew]));
      mockDetectGitInfo.mockReturnValue({});

      const projects = await discoverProjects();
      expect(projects[0].name).toBe('project-new');
      expect(projects[1].name).toBe('project-old');
    });

    it('should sort projects with activity before those without', async () => {
      const session = makeSession({
        id: 's1',
        jsonlPath: '/home/user/.claude/projects/-project-active/s1.jsonl',
        endedAt: '2025-01-01T00:00:00.000Z',
      });

      mockListAllProjects.mockResolvedValue([
        {
          encodedPath: '/home/user/.claude/projects/-project-inactive',
          projectPath: '/project-inactive',
          projectSlug: 'project-inactive',
        },
        {
          encodedPath: '/home/user/.claude/projects/-project-active',
          projectPath: '/project-active',
          projectSlug: 'project-active',
        },
      ]);
      mockGetSessionIndex.mockResolvedValue(makeIndex([session]));
      mockDetectGitInfo.mockReturnValue({});

      const projects = await discoverProjects();
      expect(projects[0].name).toBe('project-active');
      expect(projects[1].name).toBe('project-inactive');
    });
  });
});
