/**
 * Types Module Tests
 */

import { getDefaultSessionIndex, JACQUES_CACHE_PATH, SESSION_INDEX_FILE, CLAUDE_PROJECTS_PATH, HIDDEN_PROJECTS_FILE } from '../types.js';
import { homedir } from 'os';
import * as path from 'path';

describe('types', () => {
  describe('getDefaultSessionIndex', () => {
    it('should return version 2.0.0', () => {
      const index = getDefaultSessionIndex();
      expect(index.version).toBe('2.0.0');
    });

    it('should return empty sessions array', () => {
      const index = getDefaultSessionIndex();
      expect(index.sessions).toEqual([]);
    });

    it('should return a valid ISO timestamp for lastScanned', () => {
      const before = new Date().toISOString();
      const index = getDefaultSessionIndex();
      const after = new Date().toISOString();

      expect(index.lastScanned).toBeTruthy();
      expect(index.lastScanned >= before).toBe(true);
      expect(index.lastScanned <= after).toBe(true);
    });

    it('should return a new object each time', () => {
      const a = getDefaultSessionIndex();
      const b = getDefaultSessionIndex();
      expect(a).not.toBe(b);
      expect(a.sessions).not.toBe(b.sessions);
    });
  });

  describe('constants', () => {
    it('should have JACQUES_CACHE_PATH under ~/.jacques/cache', () => {
      expect(JACQUES_CACHE_PATH).toBe(path.join(homedir(), '.jacques', 'cache'));
    });

    it('should have SESSION_INDEX_FILE as sessions-index.json', () => {
      expect(SESSION_INDEX_FILE).toBe('sessions-index.json');
    });

    it('should have HIDDEN_PROJECTS_FILE under ~/.jacques/', () => {
      expect(HIDDEN_PROJECTS_FILE).toBe(path.join(homedir(), '.jacques', 'hidden-projects.json'));
    });

    it('should have CLAUDE_PROJECTS_PATH defined', () => {
      expect(typeof CLAUDE_PROJECTS_PATH).toBe('string');
      expect(CLAUDE_PROJECTS_PATH.length).toBeGreaterThan(0);
    });
  });
});
