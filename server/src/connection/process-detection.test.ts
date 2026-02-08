/**
 * Tests for process-detection module
 */

import { isProcessRunning, getPlatformInfo } from './process-detection.js';

describe('isProcessRunning', () => {
  it('returns true for current process', async () => {
    const result = await isProcessRunning(process.pid);
    expect(result).toBe(true);
  });

  it('returns false for non-existent PID', async () => {
    // Use a very high PID that's unlikely to exist
    const result = await isProcessRunning(999999);
    expect(result).toBe(false);
  });

  it('returns false for PID 0', async () => {
    const result = await isProcessRunning(0);
    expect(result).toBe(false);
  });

  it('returns false for negative PID', async () => {
    const result = await isProcessRunning(-1);
    expect(result).toBe(false);
  });
});

describe('getPlatformInfo', () => {
  it('returns platform info object', () => {
    const info = getPlatformInfo();
    expect(info).toHaveProperty('platform');
    expect(info).toHaveProperty('isWindows');
    expect(info).toHaveProperty('isMac');
    expect(info).toHaveProperty('isLinux');
    expect(typeof info.platform).toBe('string');
    expect(typeof info.isWindows).toBe('boolean');
    expect(typeof info.isMac).toBe('boolean');
    expect(typeof info.isLinux).toBe('boolean');
  });

  it('has consistent platform flags', () => {
    const info = getPlatformInfo();
    // At most one platform should be true
    const trueCount = [info.isWindows, info.isMac, info.isLinux].filter(Boolean).length;
    expect(trueCount).toBeLessThanOrEqual(1);
  });
});
