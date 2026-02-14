/**
 * Session Discovery Tests
 *
 * Tests for detectStatusFromJSONLTail() and computeEstimatedMetrics().
 */

import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
import { detectStatusFromJSONLTail, computeEstimatedMetrics } from './session-discovery.js';

// Helper: create a temp JSONL file with given entries
async function createTempJsonl(entries: object[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jacques-test-'));
  const filePath = path.join(dir, 'test-session.jsonl');
  const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(filePath, content);
  return filePath;
}

// Helper: cleanup temp file
async function cleanupTemp(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    await fs.rmdir(path.dirname(filePath));
  } catch {
    // best-effort cleanup
  }
}

describe('detectStatusFromJSONLTail', () => {
  it('returns idle when last entry is system with turn_duration', async () => {
    const filePath = await createTempJsonl([
      { type: 'user', message: { content: 'hello' } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } },
      { type: 'system', turn_duration: 1234 },
    ]);
    try {
      const result = await detectStatusFromJSONLTail(filePath);
      expect(result).toEqual({ status: 'idle', lastToolName: null });
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('returns idle when last entry is summary', async () => {
    const filePath = await createTempJsonl([
      { type: 'user', message: { content: 'hello' } },
      { type: 'summary', summary: 'Context compacted.' },
    ]);
    try {
      const result = await detectStatusFromJSONLTail(filePath);
      expect(result).toEqual({ status: 'idle', lastToolName: null });
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('returns awaiting with tool name when last entry is assistant with tool_use', async () => {
    const filePath = await createTempJsonl([
      { type: 'user', message: { content: 'edit the file' } },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Let me edit that.' },
            { type: 'tool_use', name: 'Edit', id: 'tool-1', input: {} },
          ],
        },
      },
    ]);
    try {
      const result = await detectStatusFromJSONLTail(filePath);
      expect(result).toEqual({ status: 'awaiting', lastToolName: 'Edit' });
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('returns awaiting with ExitPlanMode when that is the tool_use', async () => {
    const filePath = await createTempJsonl([
      { type: 'user', message: { content: 'plan this' } },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Here is my plan.' },
            { type: 'tool_use', name: 'ExitPlanMode', id: 'tool-2', input: {} },
          ],
        },
      },
    ]);
    try {
      const result = await detectStatusFromJSONLTail(filePath);
      expect(result).toEqual({ status: 'awaiting', lastToolName: 'ExitPlanMode' });
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('returns idle when last entry is assistant without tool_use', async () => {
    const filePath = await createTempJsonl([
      { type: 'user', message: { content: 'hello' } },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello! How can I help?' }],
        },
      },
    ]);
    try {
      const result = await detectStatusFromJSONLTail(filePath);
      expect(result).toEqual({ status: 'idle', lastToolName: null });
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('returns working when last entry is user', async () => {
    const filePath = await createTempJsonl([
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } },
      { type: 'system', turn_duration: 500 },
      { type: 'user', message: { content: 'Do something else' } },
    ]);
    try {
      const result = await detectStatusFromJSONLTail(filePath);
      expect(result).toEqual({ status: 'working', lastToolName: null });
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('skips progress entries and finds idle system entry underneath', async () => {
    const filePath = await createTempJsonl([
      { type: 'user', message: { content: 'hello' } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } },
      { type: 'system', turn_duration: 1000 },
      { type: 'progress', progress: { percent: 50 } },
      { type: 'progress', progress: { percent: 100 } },
    ]);
    try {
      const result = await detectStatusFromJSONLTail(filePath);
      expect(result).toEqual({ status: 'idle', lastToolName: null });
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('skips file-history-snapshot entries', async () => {
    const filePath = await createTempJsonl([
      { type: 'user', message: { content: 'hello' } },
      { type: 'system', turn_duration: 800 },
      { type: 'file-history-snapshot', files: [] },
    ]);
    try {
      const result = await detectStatusFromJSONLTail(filePath);
      expect(result).toEqual({ status: 'idle', lastToolName: null });
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('returns active fallback for empty file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jacques-test-'));
    const filePath = path.join(dir, 'empty.jsonl');
    await fs.writeFile(filePath, '');
    try {
      const result = await detectStatusFromJSONLTail(filePath);
      expect(result).toEqual({ status: 'active', lastToolName: null });
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('returns active fallback for non-existent file', async () => {
    const result = await detectStatusFromJSONLTail('/tmp/non-existent-session.jsonl');
    expect(result).toEqual({ status: 'active', lastToolName: null });
  });

  it('returns last tool name from the last tool_use block when multiple present', async () => {
    const filePath = await createTempJsonl([
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Read', id: 'tool-1', input: {} },
            { type: 'text', text: 'Now editing...' },
            { type: 'tool_use', name: 'Bash', id: 'tool-2', input: {} },
          ],
        },
      },
    ]);
    try {
      const result = await detectStatusFromJSONLTail(filePath);
      expect(result).toEqual({ status: 'awaiting', lastToolName: 'Bash' });
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('returns idle when last entry is system with stop_hook_summary (no turn_duration)', async () => {
    const filePath = await createTempJsonl([
      { type: 'user', message: { content: 'hello' } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } },
      { type: 'system', stop_hook_summary: { hooks_run: 1, hooks_failed: 0 } },
    ]);
    try {
      const result = await detectStatusFromJSONLTail(filePath);
      expect(result).toEqual({ status: 'idle', lastToolName: null });
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('returns idle when last entry is system with only version info', async () => {
    const filePath = await createTempJsonl([
      { type: 'user', message: { content: 'hello' } },
      { type: 'system', version: '1.0.0' },
    ]);
    try {
      const result = await detectStatusFromJSONLTail(filePath);
      expect(result).toEqual({ status: 'idle', lastToolName: null });
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('detects status even with large assistant entries (32KB buffer)', async () => {
    // Create an assistant entry with a very large content block (~16KB)
    const largeText = 'x'.repeat(16000);
    const filePath = await createTempJsonl([
      { type: 'user', message: { content: 'hello' } },
      { type: 'system', turn_duration: 500 },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: largeText }],
        },
      },
      { type: 'system', turn_duration: 1200 },
    ]);
    try {
      const result = await detectStatusFromJSONLTail(filePath);
      expect(result).toEqual({ status: 'idle', lastToolName: null });
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('returns working when last entry is queue-operation', async () => {
    const filePath = await createTempJsonl([
      { type: 'system', turn_duration: 500 },
      { type: 'queue-operation', operation: 'compact' },
    ]);
    try {
      const result = await detectStatusFromJSONLTail(filePath);
      expect(result).toEqual({ status: 'working', lastToolName: null });
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

describe('computeEstimatedMetrics', () => {
  it('computes correct percentage', () => {
    const metrics = computeEstimatedMetrics(50000, 10000);
    expect(metrics.used_percentage).toBe(25);
    expect(metrics.remaining_percentage).toBe(75);
    expect(metrics.context_window_size).toBe(200000);
    expect(metrics.total_input_tokens).toBe(50000);
    expect(metrics.total_output_tokens).toBe(10000);
    expect(metrics.is_estimate).toBe(true);
  });

  it('caps at 100%', () => {
    const metrics = computeEstimatedMetrics(300000, 50000);
    expect(metrics.used_percentage).toBe(100);
    expect(metrics.remaining_percentage).toBe(0);
  });

  it('handles zero tokens', () => {
    const metrics = computeEstimatedMetrics(0, 0);
    expect(metrics.used_percentage).toBe(0);
    expect(metrics.remaining_percentage).toBe(100);
  });
});
