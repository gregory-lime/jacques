/**
 * Persistence Tests
 */

import { jest } from '@jest/globals';
import * as path from 'path';
import type { SessionIndex } from '../types.js';

// Mock fs
const mockReadFile = jest.fn<(...args: any[]) => Promise<string>>();
const mockWriteFile = jest.fn<(...args: any[]) => Promise<void>>();
const mockMkdir = jest.fn<(...args: any[]) => Promise<void>>();
const mockUnlink = jest.fn<(...args: any[]) => Promise<void>>();

jest.unstable_mockModule('fs', () => ({
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    unlink: mockUnlink,
  },
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

describe('persistence', () => {
  let getCacheDir: typeof import('../persistence.js').getCacheDir;
  let getIndexPath: typeof import('../persistence.js').getIndexPath;
  let ensureCacheDir: typeof import('../persistence.js').ensureCacheDir;
  let readSessionIndex: typeof import('../persistence.js').readSessionIndex;
  let writeSessionIndex: typeof import('../persistence.js').writeSessionIndex;
  let invalidateIndex: typeof import('../persistence.js').invalidateIndex;
  let JACQUES_CACHE_PATH: string;
  let SESSION_INDEX_FILE: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import('../persistence.js');
    getCacheDir = mod.getCacheDir;
    getIndexPath = mod.getIndexPath;
    ensureCacheDir = mod.ensureCacheDir;
    readSessionIndex = mod.readSessionIndex;
    writeSessionIndex = mod.writeSessionIndex;
    invalidateIndex = mod.invalidateIndex;
    const types = await import('../types.js');
    JACQUES_CACHE_PATH = types.JACQUES_CACHE_PATH;
    SESSION_INDEX_FILE = types.SESSION_INDEX_FILE;
  });

  describe('getCacheDir', () => {
    it('should return JACQUES_CACHE_PATH', () => {
      expect(getCacheDir()).toBe(JACQUES_CACHE_PATH);
    });
  });

  describe('getIndexPath', () => {
    it('should return path joining cache dir and index filename', () => {
      expect(getIndexPath()).toBe(path.join(JACQUES_CACHE_PATH, SESSION_INDEX_FILE));
    });
  });

  describe('ensureCacheDir', () => {
    it('should create cache directory recursively', async () => {
      mockMkdir.mockResolvedValue(undefined);
      await ensureCacheDir();
      expect(mockMkdir).toHaveBeenCalledWith(JACQUES_CACHE_PATH, { recursive: true });
    });
  });

  describe('readSessionIndex', () => {
    it('should return parsed index from file', async () => {
      const mockIndex: SessionIndex = {
        version: '2.0.0',
        lastScanned: '2025-01-01T00:00:00.000Z',
        sessions: [],
      };
      mockReadFile.mockResolvedValue(JSON.stringify(mockIndex));

      const result = await readSessionIndex();
      expect(result.version).toBe('2.0.0');
      expect(result.lastScanned).toBe('2025-01-01T00:00:00.000Z');
      expect(result.sessions).toEqual([]);
    });

    it('should return default index when file does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const result = await readSessionIndex();
      expect(result.version).toBe('2.0.0');
      expect(result.sessions).toEqual([]);
    });

    it('should return default index when file contains invalid JSON', async () => {
      mockReadFile.mockResolvedValue('not valid json');

      const result = await readSessionIndex();
      expect(result.version).toBe('2.0.0');
      expect(result.sessions).toEqual([]);
    });
  });

  describe('writeSessionIndex', () => {
    it('should ensure cache dir exists and write JSON', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const index: SessionIndex = {
        version: '2.0.0',
        lastScanned: '2025-01-01T00:00:00.000Z',
        sessions: [],
      };
      await writeSessionIndex(index);

      expect(mockMkdir).toHaveBeenCalledWith(JACQUES_CACHE_PATH, { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith(
        path.join(JACQUES_CACHE_PATH, SESSION_INDEX_FILE),
        expect.any(String),
        'utf-8'
      );

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed.version).toBe('2.0.0');
    });

    it('should write formatted JSON with indentation', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const index: SessionIndex = {
        version: '2.0.0',
        lastScanned: '2025-01-01T00:00:00.000Z',
        sessions: [],
      };
      await writeSessionIndex(index);

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('\n');
    });
  });

  describe('invalidateIndex', () => {
    it('should delete the index file', async () => {
      mockUnlink.mockResolvedValue(undefined);

      await invalidateIndex();

      expect(mockUnlink).toHaveBeenCalledWith(
        path.join(JACQUES_CACHE_PATH, SESSION_INDEX_FILE)
      );
    });

    it('should not throw when file does not exist', async () => {
      mockUnlink.mockRejectedValue(new Error('ENOENT'));

      await expect(invalidateIndex()).resolves.toBeUndefined();
    });
  });
});
