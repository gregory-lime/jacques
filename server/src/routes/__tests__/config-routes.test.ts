/**
 * Config routes tests
 */

import { jest } from '@jest/globals';

const mockGetConfig = jest.fn<() => {
  version: string;
  rootPath?: string;
  sources: Record<string, Record<string, unknown>>;
}>();
const mockSaveConfig = jest.fn<(config: unknown) => boolean>();

jest.unstable_mockModule('../config-store.js', () => ({
  getJacquesConfig: mockGetConfig,
  saveJacquesConfig: mockSaveConfig,
}));

const { configRoutes } = await import('../config-routes.js');
import { createMockContext, getSentJson } from './test-helpers.js';

describe('configRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/config/root-path', () => {
    it('returns default path when no rootPath is saved', async () => {
      mockGetConfig.mockReturnValue({
        version: '1.0.0',
        sources: {},
      });

      const { ctx, res } = createMockContext({ url: '/api/config/root-path' });
      const handled = await configRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      const typed = data as { path: string; isDefault: boolean; exists: boolean };
      expect(typed.isDefault).toBe(true);
    });

    it('returns custom path when rootPath is saved', async () => {
      mockGetConfig.mockReturnValue({
        version: '1.0.0',
        rootPath: '/custom/claude',
        sources: {},
      });

      const { ctx, res } = createMockContext({ url: '/api/config/root-path' });
      const handled = await configRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      const typed = data as { path: string; isDefault: boolean };
      expect(typed.path).toBe('/custom/claude');
      expect(typed.isDefault).toBe(false);
    });
  });

  describe('POST /api/config/root-path', () => {
    it('saves a valid path', async () => {
      mockGetConfig.mockReturnValue({
        version: '1.0.0',
        sources: {},
      });
      mockSaveConfig.mockReturnValue(true);

      const { ctx, res } = createMockContext({
        method: 'POST',
        url: '/api/config/root-path',
        body: { path: '/tmp' },
      });
      const handled = await configRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect(data).toEqual({ success: true, path: '/tmp' });

      const savedConfig = mockSaveConfig.mock.calls[0][0] as { rootPath?: string };
      expect(savedConfig.rootPath).toBe('/tmp');
    });

    it('returns 400 for missing path', async () => {
      const { ctx, res } = createMockContext({
        method: 'POST',
        url: '/api/config/root-path',
        body: {},
      });
      const handled = await configRoutes(ctx);

      expect(handled).toBe(true);
      const { status } = getSentJson(res);
      expect(status).toBe(400);
    });

    it('returns 400 for non-existent path', async () => {
      const { ctx, res } = createMockContext({
        method: 'POST',
        url: '/api/config/root-path',
        body: { path: '/nonexistent/path/that/does/not/exist' },
      });
      const handled = await configRoutes(ctx);

      expect(handled).toBe(true);
      const { status } = getSentJson(res);
      expect(status).toBe(400);
    });

    it('returns 500 when save fails', async () => {
      mockGetConfig.mockReturnValue({
        version: '1.0.0',
        sources: {},
      });
      mockSaveConfig.mockReturnValue(false);

      const { ctx, res } = createMockContext({
        method: 'POST',
        url: '/api/config/root-path',
        body: { path: '/tmp' },
      });
      const handled = await configRoutes(ctx);

      expect(handled).toBe(true);
      const { status } = getSentJson(res);
      expect(status).toBe(500);
    });
  });

  it('returns false for non-matching routes', async () => {
    const { ctx } = createMockContext({ url: '/api/sessions' });
    const handled = await configRoutes(ctx);
    expect(handled).toBe(false);
  });
});
