/**
 * Source routes tests
 */

import { jest } from '@jest/globals';

interface JacquesConfig {
  version: string;
  sources: Record<string, Record<string, unknown>>;
}
const mockGetConfig = jest.fn<() => JacquesConfig>();
const mockSaveConfig = jest.fn<(config: JacquesConfig) => boolean>();

jest.unstable_mockModule('../config-store.js', () => ({
  getJacquesConfig: mockGetConfig,
  saveJacquesConfig: mockSaveConfig,
}));

const { sourceRoutes } = await import('../source-routes.js');
import { createMockContext, getSentJson } from './test-helpers.js';

describe('sourceRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/sources/status', () => {
    it('returns status for all sources', async () => {
      mockGetConfig.mockReturnValue({
        version: '1.0.0',
        sources: {
          obsidian: { enabled: true, vaultPath: '/vault' },
          googleDocs: { enabled: false },
          notion: { enabled: false },
        },
      });

      const { ctx, res } = createMockContext({ url: '/api/sources/status' });
      const handled = await sourceRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);

      const typedData = data as { obsidian: { connected: boolean }; googleDocs: { connected: boolean }; notion: { connected: boolean } };
      expect(typedData.obsidian.connected).toBe(true);
      expect(typedData.googleDocs.connected).toBe(false);
      expect(typedData.notion.connected).toBe(false);
    });
  });

  describe('POST /api/sources/google', () => {
    it('saves Google Docs configuration', async () => {
      mockGetConfig.mockReturnValue({
        version: '1.0.0',
        sources: { obsidian: { enabled: false }, googleDocs: { enabled: false }, notion: { enabled: false } },
      });
      mockSaveConfig.mockReturnValue(true);

      const { ctx, res } = createMockContext({
        method: 'POST',
        url: '/api/sources/google',
        body: {
          client_id: 'test-id',
          client_secret: 'test-secret',
          tokens: { access_token: 'test-token' },
        },
      });

      const handled = await sourceRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(mockSaveConfig).toHaveBeenCalledTimes(1);
    });

    it('returns 400 for missing fields', async () => {
      const { ctx, res } = createMockContext({
        method: 'POST',
        url: '/api/sources/google',
        body: { client_id: 'test-id' },
      });

      const handled = await sourceRoutes(ctx);

      expect(handled).toBe(true);
      const { status } = getSentJson(res);
      expect(status).toBe(400);
    });
  });

  describe('DELETE /api/sources/google', () => {
    it('disconnects Google Docs', async () => {
      mockGetConfig.mockReturnValue({
        version: '1.0.0',
        sources: {
          obsidian: { enabled: false },
          googleDocs: { enabled: true, client_id: 'id', client_secret: 'secret', tokens: { access_token: 'tok' } },
          notion: { enabled: false },
        },
      });
      mockSaveConfig.mockReturnValue(true);

      const { ctx, res } = createMockContext({ method: 'DELETE', url: '/api/sources/google' });
      const handled = await sourceRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect(data).toEqual({ success: true });

      const savedConfig = mockSaveConfig.mock.calls[0][0];
      expect(savedConfig.sources.googleDocs).toEqual({ enabled: false });
    });
  });

  describe('POST /api/sources/notion', () => {
    it('saves Notion configuration', async () => {
      mockGetConfig.mockReturnValue({
        version: '1.0.0',
        sources: { obsidian: { enabled: false }, googleDocs: { enabled: false }, notion: { enabled: false } },
      });
      mockSaveConfig.mockReturnValue(true);

      const { ctx, res } = createMockContext({
        method: 'POST',
        url: '/api/sources/notion',
        body: {
          client_id: 'notion-id',
          client_secret: 'notion-secret',
          tokens: { access_token: 'notion-token' },
          workspace_name: 'My Workspace',
        },
      });

      const handled = await sourceRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect(data).toEqual({ success: true });
    });
  });

  describe('DELETE /api/sources/notion', () => {
    it('disconnects Notion', async () => {
      mockGetConfig.mockReturnValue({
        version: '1.0.0',
        sources: {
          obsidian: { enabled: false },
          googleDocs: { enabled: false },
          notion: { enabled: true, tokens: { access_token: 'tok' } },
        },
      });
      mockSaveConfig.mockReturnValue(true);

      const { ctx, res } = createMockContext({ method: 'DELETE', url: '/api/sources/notion' });
      const handled = await sourceRoutes(ctx);

      expect(handled).toBe(true);
      const { status } = getSentJson(res);
      expect(status).toBe(200);
    });
  });

  it('returns false for non-matching routes', async () => {
    const { ctx } = createMockContext({ url: '/api/sessions' });
    const handled = await sourceRoutes(ctx);
    expect(handled).toBe(false);
  });
});
