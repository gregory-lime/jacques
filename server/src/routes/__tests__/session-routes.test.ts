/**
 * Session routes tests
 */

import { jest } from '@jest/globals';

const mockSessionEntry = {
  id: 'session-1',
  jsonlPath: '/tmp/test/session-1.jsonl',
  projectPath: '/Users/test/project',
  projectSlug: 'project',
  title: 'Test Session',
  startedAt: '2024-01-01T00:00:00Z',
  endedAt: '2024-01-01T01:00:00Z',
  messageCount: 10,
  toolCallCount: 5,
  hasSubagents: false,
  fileSizeBytes: 1024,
  modifiedAt: '2024-01-01T01:00:00Z',
};

const mockSessions = [
  { id: 'session-1', projectSlug: 'project-a', title: 'First session' },
  { id: 'session-2', projectSlug: 'project-b', title: 'Second session' },
];

const mockGetSessionIndex = jest.fn<() => Promise<{ sessions: typeof mockSessions; lastScanned: string }>>();
const mockGetSessionsByProject = jest.fn<() => Promise<Map<string, unknown[]>>>();
const mockGetCacheIndexStats = jest.fn<() => Promise<{ totalSessions: number; totalSizeBytes: number }>>();
const mockBuildSessionIndex = jest.fn<() => Promise<{ sessions: typeof mockSessions; lastScanned: string }>>();
const mockGetSessionEntry = jest.fn<() => Promise<typeof mockSessionEntry | null>>();
const mockFindSessionById = jest.fn<() => Promise<{ filePath: string; modifiedAt: Date; sizeBytes: number } | null>>();
const mockParseJSONL = jest.fn<() => Promise<unknown[]>>();
const mockGetEntryStatistics = jest.fn();
const mockListSubagentFiles = jest.fn<() => Promise<unknown[]>>();
const mockDetectModeAndPlans = jest.fn();
const mockExtractTaskSignals = jest.fn<() => unknown[]>();

jest.unstable_mockModule('@jacques-ai/core', () => ({
  getSessionIndex: mockGetSessionIndex,
  getSessionsByProject: mockGetSessionsByProject,
  getCacheIndexStats: mockGetCacheIndexStats,
  buildSessionIndex: mockBuildSessionIndex,
  getSessionEntry: mockGetSessionEntry,
  findSessionById: mockFindSessionById,
  parseJSONL: mockParseJSONL,
  getEntryStatistics: mockGetEntryStatistics,
  listSubagentFiles: mockListSubagentFiles,
  decodeProjectPath: jest.fn<(path: string) => Promise<string>>().mockImplementation((path: string) => Promise.resolve('/decoded/' + path)),
  detectModeAndPlans: mockDetectModeAndPlans,
  extractTaskSignals: mockExtractTaskSignals,
}));

const { sessionRoutes } = await import('../session-routes.js');
import { createMockContext, getSentJson } from './test-helpers.js';

describe('sessionRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSessionIndex.mockResolvedValue({
      sessions: mockSessions,
      lastScanned: '2024-01-01T00:00:00Z',
    });
    mockGetSessionsByProject.mockResolvedValue(new Map([['project-a', [mockSessions[0]]]]));
    mockGetCacheIndexStats.mockResolvedValue({ totalSessions: 2, totalSizeBytes: 2048 });
    mockBuildSessionIndex.mockResolvedValue({
      sessions: mockSessions,
      lastScanned: '2024-01-01T00:00:00Z',
    });
    mockGetSessionEntry.mockResolvedValue(null);
    mockFindSessionById.mockResolvedValue(null);
    mockParseJSONL.mockResolvedValue([]);
    mockGetEntryStatistics.mockReturnValue({
      userMessages: 5,
      assistantMessages: 5,
      toolCalls: 3,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalOutputTokensEstimated: 480,
      lastInputTokens: 200,
      lastCacheRead: 50,
      lastCacheCreation: 0,
      totalDurationMs: 5000,
      mcpCalls: 0,
      webSearches: 0,
    });
    mockListSubagentFiles.mockResolvedValue([]);
    mockDetectModeAndPlans.mockReturnValue({ mode: null, planRefs: [] });
    mockExtractTaskSignals.mockReturnValue([]);
  });

  describe('GET /api/sessions', () => {
    it('returns session list', async () => {
      const { ctx, res } = createMockContext({ url: '/api/sessions' });
      const handled = await sessionRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { sessions: unknown[] }).sessions).toHaveLength(2);
    });
  });

  describe('GET /api/sessions/by-project', () => {
    it('returns sessions grouped by project', async () => {
      const { ctx, res } = createMockContext({ url: '/api/sessions/by-project' });
      const handled = await sessionRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { projects: Record<string, unknown[]> }).projects).toBeDefined();
    });
  });

  describe('GET /api/sessions/stats', () => {
    it('returns session statistics', async () => {
      const { ctx, res } = createMockContext({ url: '/api/sessions/stats' });
      const handled = await sessionRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { totalSessions: number }).totalSessions).toBe(2);
      expect((data as { sizeFormatted: string }).sizeFormatted).toBe('2.0 KB');
    });
  });

  describe('POST /api/sessions/rebuild', () => {
    it('streams SSE rebuild progress', async () => {
      const { ctx, res } = createMockContext({ method: 'POST', url: '/api/sessions/rebuild' });
      const handled = await sessionRoutes(ctx);

      expect(handled).toBe(true);
      expect(res._mockData.headers['Content-Type']).toBe('text/event-stream');
      expect(res._mockData.body).toContain('event: complete');
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('returns 404 for unknown session', async () => {
      mockGetSessionEntry.mockResolvedValueOnce(null);
      mockFindSessionById.mockResolvedValueOnce(null);

      const { ctx, res } = createMockContext({ url: '/api/sessions/unknown-id' });
      const handled = await sessionRoutes(ctx);

      expect(handled).toBe(true);
      const { status } = getSentJson(res);
      expect(status).toBe(404);
    });

    it('returns session with empty entries (awaiting first response)', async () => {
      mockGetSessionEntry.mockResolvedValueOnce(mockSessionEntry);
      mockParseJSONL.mockResolvedValueOnce([]);

      const { ctx, res } = createMockContext({ url: '/api/sessions/session-1' });
      const handled = await sessionRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { awaitingFirstResponse: boolean }).awaitingFirstResponse).toBe(true);
    });
  });

  describe('GET /api/sessions/:id/badges', () => {
    it('returns badge data for empty session', async () => {
      mockGetSessionEntry.mockResolvedValueOnce(mockSessionEntry);
      mockParseJSONL.mockResolvedValueOnce([]);

      const { ctx, res } = createMockContext({ url: '/api/sessions/session-1/badges' });
      const handled = await sessionRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { awaitingFirstResponse: boolean }).awaitingFirstResponse).toBe(true);
      expect((data as { planCount: number }).planCount).toBe(0);
    });

    it('returns 404 for unknown session badges', async () => {
      mockGetSessionEntry.mockResolvedValueOnce(null);
      mockFindSessionById.mockResolvedValueOnce(null);

      const { ctx, res } = createMockContext({ url: '/api/sessions/unknown-id/badges' });
      const handled = await sessionRoutes(ctx);

      expect(handled).toBe(true);
      const { status } = getSentJson(res);
      expect(status).toBe(404);
    });
  });

  describe('GET /api/sessions/:id/tasks', () => {
    it('returns empty tasks for session without tasks', async () => {
      mockGetSessionEntry.mockResolvedValueOnce(mockSessionEntry);
      mockParseJSONL.mockResolvedValueOnce([]);
      mockExtractTaskSignals.mockReturnValueOnce([]);

      const { ctx, res } = createMockContext({ url: '/api/sessions/session-1/tasks' });
      const handled = await sessionRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      const typedData = data as { tasks: unknown[]; summary: { total: number; percentage: number } };
      expect(typedData.tasks).toHaveLength(0);
      expect(typedData.summary.total).toBe(0);
      expect(typedData.summary.percentage).toBe(0);
    });

    it('returns 404 for unknown session tasks', async () => {
      mockGetSessionEntry.mockResolvedValueOnce(null);
      mockFindSessionById.mockResolvedValueOnce(null);

      const { ctx, res } = createMockContext({ url: '/api/sessions/unknown-id/tasks' });
      const handled = await sessionRoutes(ctx);

      expect(handled).toBe(true);
      const { status } = getSentJson(res);
      expect(status).toBe(404);
    });
  });

  it('returns false for non-matching routes', async () => {
    const { ctx } = createMockContext({ url: '/api/projects' });
    const handled = await sessionRoutes(ctx);
    expect(handled).toBe(false);
  });
});
