/**
 * Archive routes tests
 */

import { jest } from '@jest/globals';

const mockGetArchiveStats = jest.fn<() => Promise<unknown>>();
const mockListAllManifests = jest.fn<() => Promise<unknown[]>>();
const mockListManifestsByProject = jest.fn<() => Promise<Map<string, unknown[]>>>();
const mockReadManifest = jest.fn<() => Promise<unknown | null>>();
const mockSearchConversations = jest.fn<() => Promise<unknown>>();
const mockReadSubagent = jest.fn<() => Promise<unknown | null>>();
const mockListSubagentsForSession = jest.fn<() => Promise<unknown[]>>();
const mockInitializeArchive = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('@jacques/core', () => ({
  getArchiveStats: mockGetArchiveStats,
  listAllManifests: mockListAllManifests,
  listManifestsByProject: mockListManifestsByProject,
  readManifest: mockReadManifest,
  searchConversations: mockSearchConversations,
  readSubagent: mockReadSubagent,
  listSubagentsForSession: mockListSubagentsForSession,
  createSubagentReference: jest.fn(),
  initializeArchive: mockInitializeArchive,
}));

const { archiveRoutes } = await import('../archive-routes.js');
import { createMockContext, getSentJson } from './test-helpers.js';

describe('archiveRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetArchiveStats.mockResolvedValue({
      totalConversations: 42,
      totalProjects: 5,
      totalSizeBytes: 1024 * 1024,
    });
    mockListAllManifests.mockResolvedValue([
      { id: 'conv-1', title: 'Conversation 1' },
      { id: 'conv-2', title: 'Conversation 2' },
    ]);
    mockListManifestsByProject.mockResolvedValue(
      new Map([['proj', [{ id: 'conv-1', title: 'Conversation 1' }]]])
    );
    mockReadManifest.mockResolvedValue(null);
    mockSearchConversations.mockResolvedValue({
      results: [{ id: 'conv-1', title: 'Result 1', score: 0.9 }],
      total: 1,
    });
    mockReadSubagent.mockResolvedValue(null);
    mockListSubagentsForSession.mockResolvedValue([]);
    mockInitializeArchive.mockResolvedValue({ processed: 10, archived: 8 });
  });

  describe('GET /api/archive/stats', () => {
    it('returns archive statistics', async () => {
      const { ctx, res } = createMockContext({ url: '/api/archive/stats' });
      const handled = await archiveRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { totalConversations: number }).totalConversations).toBe(42);
    });
  });

  describe('GET /api/archive/conversations', () => {
    it('returns all manifests', async () => {
      const { ctx, res } = createMockContext({ url: '/api/archive/conversations' });
      const handled = await archiveRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { manifests: unknown[] }).manifests).toHaveLength(2);
    });
  });

  describe('GET /api/archive/conversations/by-project', () => {
    it('returns conversations grouped by project', async () => {
      const { ctx, res } = createMockContext({ url: '/api/archive/conversations/by-project' });
      const handled = await archiveRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { projects: Record<string, unknown[]> }).projects.proj).toHaveLength(1);
    });
  });

  describe('GET /api/archive/conversations/:id', () => {
    it('returns 404 for unknown conversation', async () => {
      mockReadManifest.mockResolvedValueOnce(null);

      const { ctx, res } = createMockContext({ url: '/api/archive/conversations/unknown-id' });
      const handled = await archiveRoutes(ctx);

      expect(handled).toBe(true);
      const { status } = getSentJson(res);
      expect(status).toBe(404);
    });
  });

  describe('POST /api/archive/search', () => {
    it('searches conversations', async () => {
      const { ctx, res } = createMockContext({
        method: 'POST',
        url: '/api/archive/search',
        body: { query: 'test search' },
      });

      const handled = await archiveRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { results: unknown[] }).results).toHaveLength(1);
    });

    it('returns 400 for missing query', async () => {
      const { ctx, res } = createMockContext({
        method: 'POST',
        url: '/api/archive/search',
        body: {},
      });

      const handled = await archiveRoutes(ctx);

      expect(handled).toBe(true);
      const { status } = getSentJson(res);
      expect(status).toBe(400);
    });
  });

  describe('GET /api/archive/subagents/:agentId', () => {
    it('returns 404 for unknown subagent', async () => {
      mockReadSubagent.mockResolvedValueOnce(null);

      const { ctx, res } = createMockContext({ url: '/api/archive/subagents/unknown-agent' });
      const handled = await archiveRoutes(ctx);

      expect(handled).toBe(true);
      const { status } = getSentJson(res);
      expect(status).toBe(404);
    });

    it('returns subagent data', async () => {
      mockReadSubagent.mockResolvedValueOnce({ id: 'agent-1', prompt: 'Test' });

      const { ctx, res } = createMockContext({ url: '/api/archive/subagents/agent-1' });
      const handled = await archiveRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { subagent: { id: string } }).subagent.id).toBe('agent-1');
    });
  });

  describe('GET /api/archive/sessions/:sessionId/subagents', () => {
    it('returns subagents for a session', async () => {
      const { ctx, res } = createMockContext({ url: '/api/archive/sessions/sess-1/subagents' });
      const handled = await archiveRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { subagents: unknown[] }).subagents).toEqual([]);
    });
  });

  describe('POST /api/archive/initialize', () => {
    it('streams SSE initialization progress', async () => {
      const { ctx, res } = createMockContext({ method: 'POST', url: '/api/archive/initialize' });
      const handled = await archiveRoutes(ctx);

      expect(handled).toBe(true);
      expect(res._mockData.headers['Content-Type']).toBe('text/event-stream');
      expect(res._mockData.body).toContain('event: complete');
      expect(res._mockData.ended).toBe(true);
    });
  });

  it('returns false for non-matching routes', async () => {
    const { ctx } = createMockContext({ url: '/api/sessions' });
    const handled = await archiveRoutes(ctx);
    expect(handled).toBe(false);
  });
});
