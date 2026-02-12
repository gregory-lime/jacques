/**
 * Sync routes tests
 */

import { jest } from '@jest/globals';

const mockExtractAllCatalogs = jest.fn<() => Promise<Record<string, number>>>();
const mockExtractProjectCatalog = jest.fn<() => Promise<Record<string, number>>>();
const mockBuildSessionIndex = jest.fn<() => Promise<{ sessions: unknown[]; lastScanned: string }>>();

jest.unstable_mockModule('@jacques-ai/core', () => ({
  extractAllCatalogs: mockExtractAllCatalogs,
  extractProjectCatalog: mockExtractProjectCatalog,
  buildSessionIndex: mockBuildSessionIndex,
}));

const { syncRoutes } = await import('../sync-routes.js');
import { createMockContext } from './test-helpers.js';

describe('syncRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExtractAllCatalogs.mockResolvedValue({
      totalSessions: 10,
      extracted: 8,
      skipped: 2,
      errors: 0,
    });
    mockExtractProjectCatalog.mockResolvedValue({
      totalSessions: 5,
      extracted: 5,
      skipped: 0,
      errors: 0,
    });
    mockBuildSessionIndex.mockResolvedValue({
      sessions: new Array(10),
      lastScanned: '2024-01-01T00:00:00Z',
    });
  });

  describe('POST /api/sync', () => {
    it('streams SSE progress events', async () => {
      const { ctx, res } = createMockContext({ method: 'POST', url: '/api/sync' });

      const handled = await syncRoutes(ctx);

      expect(handled).toBe(true);
      expect(res._mockData.statusCode).toBe(200);
      expect(res._mockData.headers['Content-Type']).toBe('text/event-stream');
      expect(res._mockData.body).toContain('event: complete');
      expect(res._mockData.body).toContain('"totalSessions":10');
      expect(res._mockData.body).toContain('"indexed":10');
      expect(res._mockData.ended).toBe(true);
    });

    it('passes force query parameter', async () => {
      const { ctx } = createMockContext({ method: 'POST', url: '/api/sync?force=true' });

      await syncRoutes(ctx);

      expect(mockExtractAllCatalogs).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
    });
  });

  describe('POST /api/catalog/extract', () => {
    it('streams extraction progress', async () => {
      const { ctx, res } = createMockContext({ method: 'POST', url: '/api/catalog/extract' });

      const handled = await syncRoutes(ctx);

      expect(handled).toBe(true);
      expect(res._mockData.headers['Content-Type']).toBe('text/event-stream');
      expect(res._mockData.body).toContain('event: complete');
      expect(res._mockData.ended).toBe(true);
    });

    it('extracts for specific project', async () => {
      const { ctx } = createMockContext({
        method: 'POST',
        url: '/api/catalog/extract?project=/Users/test/project',
      });

      await syncRoutes(ctx);

      expect(mockExtractProjectCatalog).toHaveBeenCalledWith(
        '/Users/test/project',
        expect.objectContaining({ force: false }),
      );
    });
  });

  it('returns false for non-matching routes', async () => {
    const { ctx } = createMockContext({ url: '/api/sessions' });
    const handled = await syncRoutes(ctx);
    expect(handled).toBe(false);
  });
});
