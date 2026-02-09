/**
 * Metadata Extractor Tests
 */

import { extractTitle, extractTimestamps } from '../metadata-extractor.js';

describe('metadata-extractor', () => {
  describe('extractTitle', () => {
    it('should prefer summary entry over user message', () => {
      const entries = [
        { type: 'user_message', content: { text: 'Hello world' } },
        { type: 'summary', content: { summary: 'Session about greeting' } },
      ];
      const title = extractTitle(entries);
      expect(title).toBe('Session about greeting');
    });

    it('should use first real user message as fallback', () => {
      const entries = [
        { type: 'user_message', content: { text: 'Fix the login bug' } },
        { type: 'assistant_message', content: { text: 'Sure' } },
      ];
      const title = extractTitle(entries);
      expect(title).toBe('Fix the login bug');
    });

    it('should skip internal command messages', () => {
      const entries = [
        { type: 'user_message', content: { text: '<local-command>status</local-command>' } },
        { type: 'user_message', content: { text: '<command-name>init</command-name>' } },
        { type: 'user_message', content: { text: 'Real message here' } },
      ];
      const title = extractTitle(entries);
      expect(title).toBe('Real message here');
    });

    it('should skip empty user messages', () => {
      const entries = [
        { type: 'user_message', content: { text: '   ' } },
        { type: 'user_message', content: { text: 'Actual message' } },
      ];
      const title = extractTitle(entries);
      expect(title).toBe('Actual message');
    });

    it('should truncate messages longer than 100 chars', () => {
      const longMessage = 'A'.repeat(150);
      const entries = [
        { type: 'user_message', content: { text: longMessage } },
      ];
      const title = extractTitle(entries);
      expect(title.length).toBe(100);
      expect(title).toBe('A'.repeat(97) + '...');
    });

    it('should not truncate messages exactly 100 chars', () => {
      const exactMessage = 'B'.repeat(100);
      const entries = [
        { type: 'user_message', content: { text: exactMessage } },
      ];
      const title = extractTitle(entries);
      expect(title).toBe(exactMessage);
    });

    it('should return "Untitled Session" when no valid entries exist', () => {
      const entries = [
        { type: 'assistant_message', content: { text: 'Hello' } },
      ];
      const title = extractTitle(entries);
      expect(title).toBe('Untitled Session');
    });

    it('should return "Untitled Session" for empty entries', () => {
      const title = extractTitle([]);
      expect(title).toBe('Untitled Session');
    });

    it('should handle entries with no text field', () => {
      const entries = [
        { type: 'user_message', content: {} },
      ];
      const title = extractTitle(entries);
      expect(title).toBe('Untitled Session');
    });
  });

  describe('extractTimestamps', () => {
    it('should return earliest and latest timestamps', () => {
      const entries = [
        { timestamp: '2025-01-15T10:00:00.000Z' },
        { timestamp: '2025-01-15T10:05:00.000Z' },
        { timestamp: '2025-01-15T09:55:00.000Z' },
        { timestamp: '2025-01-15T10:30:00.000Z' },
      ];
      const result = extractTimestamps(entries);
      expect(result.startedAt).toBe('2025-01-15T09:55:00.000Z');
      expect(result.endedAt).toBe('2025-01-15T10:30:00.000Z');
    });

    it('should handle single entry', () => {
      const entries = [
        { timestamp: '2025-01-15T10:00:00.000Z' },
      ];
      const result = extractTimestamps(entries);
      expect(result.startedAt).toBe('2025-01-15T10:00:00.000Z');
      expect(result.endedAt).toBe('2025-01-15T10:00:00.000Z');
    });

    it('should return now for empty entries', () => {
      const before = new Date().toISOString();
      const result = extractTimestamps([]);
      const after = new Date().toISOString();

      expect(result.startedAt >= before).toBe(true);
      expect(result.startedAt <= after).toBe(true);
      expect(result.endedAt >= before).toBe(true);
      expect(result.endedAt <= after).toBe(true);
    });

    it('should handle entries already in order', () => {
      const entries = [
        { timestamp: '2025-01-01T00:00:00.000Z' },
        { timestamp: '2025-01-02T00:00:00.000Z' },
        { timestamp: '2025-01-03T00:00:00.000Z' },
      ];
      const result = extractTimestamps(entries);
      expect(result.startedAt).toBe('2025-01-01T00:00:00.000Z');
      expect(result.endedAt).toBe('2025-01-03T00:00:00.000Z');
    });

    it('should handle entries in reverse order', () => {
      const entries = [
        { timestamp: '2025-01-03T00:00:00.000Z' },
        { timestamp: '2025-01-02T00:00:00.000Z' },
        { timestamp: '2025-01-01T00:00:00.000Z' },
      ];
      const result = extractTimestamps(entries);
      expect(result.startedAt).toBe('2025-01-01T00:00:00.000Z');
      expect(result.endedAt).toBe('2025-01-03T00:00:00.000Z');
    });
  });
});
