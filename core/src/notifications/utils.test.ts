/**
 * Notification utility tests
 */

import {
  getContextThresholdPriority,
  generateNotificationId,
  formatNotificationAge,
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_COOLDOWNS,
  CATEGORY_SYMBOLS,
  CATEGORY_LABELS,
  MAX_NOTIFICATION_HISTORY,
} from './index.js';

describe('getContextThresholdPriority', () => {
  it('should return high for threshold >= 70', () => {
    expect(getContextThresholdPriority(70)).toBe('high');
    expect(getContextThresholdPriority(90)).toBe('high');
    expect(getContextThresholdPriority(100)).toBe('high');
  });

  it('should return medium for threshold < 70', () => {
    expect(getContextThresholdPriority(50)).toBe('medium');
    expect(getContextThresholdPriority(30)).toBe('medium');
    expect(getContextThresholdPriority(0)).toBe('medium');
  });
});

describe('generateNotificationId', () => {
  it('should produce unique IDs across calls', () => {
    const id1 = generateNotificationId('context', 'key1');
    const id2 = generateNotificationId('context', 'key1');
    expect(id1).not.toBe(id2);
  });

  it('should include category and key in the ID', () => {
    const id = generateNotificationId('plan', 'sess-123');
    expect(id).toContain('plan');
    expect(id).toContain('sess-123');
  });

  it('should start with notif- prefix', () => {
    const id = generateNotificationId('operation', 'op-1');
    expect(id.startsWith('notif-')).toBe(true);
  });
});

describe('formatNotificationAge', () => {
  it('should return "just now" for recent timestamps', () => {
    expect(formatNotificationAge(Date.now())).toBe('just now');
    expect(formatNotificationAge(Date.now() - 30_000)).toBe('just now');
  });

  it('should return minutes for timestamps < 1 hour ago', () => {
    expect(formatNotificationAge(Date.now() - 5 * 60_000)).toBe('5m ago');
    expect(formatNotificationAge(Date.now() - 59 * 60_000)).toBe('59m ago');
  });

  it('should return hours for timestamps < 1 day ago', () => {
    expect(formatNotificationAge(Date.now() - 2 * 3600_000)).toBe('2h ago');
    expect(formatNotificationAge(Date.now() - 23 * 3600_000)).toBe('23h ago');
  });

  it('should return days for timestamps >= 1 day ago', () => {
    expect(formatNotificationAge(Date.now() - 25 * 3600_000)).toBe('1d ago');
    expect(formatNotificationAge(Date.now() - 72 * 3600_000)).toBe('3d ago');
  });
});

describe('DEFAULT_NOTIFICATION_SETTINGS', () => {
  it('should be disabled by default', () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS.enabled).toBe(false);
  });

  it('should have thresholds [50, 70]', () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS.contextThresholds).toEqual([50, 70]);
  });

  it('should have all categories enabled', () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS.categories.context).toBe(true);
    expect(DEFAULT_NOTIFICATION_SETTINGS.categories.operation).toBe(true);
    expect(DEFAULT_NOTIFICATION_SETTINGS.categories.plan).toBe(true);
    expect(DEFAULT_NOTIFICATION_SETTINGS.categories['auto-compact']).toBe(true);
    expect(DEFAULT_NOTIFICATION_SETTINGS.categories.handoff).toBe(true);
  });

  it('should have 50k token threshold', () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS.largeOperationThreshold).toBe(50_000);
  });
});

describe('NOTIFICATION_COOLDOWNS', () => {
  it('should have values for all categories', () => {
    const categories = ['context', 'operation', 'plan', 'auto-compact', 'handoff'] as const;
    for (const cat of categories) {
      expect(typeof NOTIFICATION_COOLDOWNS[cat]).toBe('number');
      expect(NOTIFICATION_COOLDOWNS[cat]).toBeGreaterThan(0);
    }
  });
});

describe('CATEGORY_SYMBOLS', () => {
  it('should have symbols for all categories', () => {
    const categories = ['context', 'operation', 'plan', 'auto-compact', 'handoff'] as const;
    for (const cat of categories) {
      expect(typeof CATEGORY_SYMBOLS[cat]).toBe('string');
      expect(CATEGORY_SYMBOLS[cat].length).toBeGreaterThan(0);
    }
  });
});

describe('CATEGORY_LABELS', () => {
  it('should have labels for all categories', () => {
    const categories = ['context', 'operation', 'plan', 'auto-compact', 'handoff'] as const;
    for (const cat of categories) {
      expect(typeof CATEGORY_LABELS[cat]).toBe('string');
      expect(CATEGORY_LABELS[cat].length).toBeGreaterThan(0);
    }
  });
});

describe('MAX_NOTIFICATION_HISTORY', () => {
  it('should be 50', () => {
    expect(MAX_NOTIFICATION_HISTORY).toBe(50);
  });
});
