/**
 * Smart Layout Engine Tests
 *
 * Tests grid specifications, slot geometry calculations, transition planning,
 * and free-space placement for the smart tiling system.
 */

import { describe, it, expect } from '@jest/globals';
import {
  getGridSpec,
  calculateSlotGeometry,
  calculateAllSlots,
  planSmartTileTransition,
  findFreeSpace,
  computeOverlapArea,
} from './smart-layouts.js';
import type { WindowGeometry } from './types.js';

// Standard test work area (1920×1057 after dock/menubar on a 1080p display)
const WORK_AREA: WindowGeometry = { x: 0, y: 23, width: 1920, height: 1057 };

// ─── getGridSpec ─────────────────────────────────────────────

describe('getGridSpec', () => {
  it('returns empty grid for 0 windows', () => {
    expect(getGridSpec(0)).toEqual({ columnsPerRow: [] });
  });

  it('returns [1] for 1 window', () => {
    expect(getGridSpec(1)).toEqual({ columnsPerRow: [1] });
  });

  it('returns [2] for 2 windows', () => {
    expect(getGridSpec(2)).toEqual({ columnsPerRow: [2] });
  });

  it('returns [3] for 3 windows', () => {
    expect(getGridSpec(3)).toEqual({ columnsPerRow: [3] });
  });

  it('returns [2,2] for 4 windows (2×2 grid)', () => {
    expect(getGridSpec(4)).toEqual({ columnsPerRow: [2, 2] });
  });

  it('returns [3,2] for 5 windows (3 top, 2 bottom)', () => {
    expect(getGridSpec(5)).toEqual({ columnsPerRow: [3, 2] });
  });

  it('returns [3,3] for 6 windows (3×2 grid)', () => {
    expect(getGridSpec(6)).toEqual({ columnsPerRow: [3, 3] });
  });

  it('returns [4,3] for 7 windows', () => {
    expect(getGridSpec(7)).toEqual({ columnsPerRow: [4, 3] });
  });

  it('returns [4,4] for 8 windows (4×2 grid)', () => {
    expect(getGridSpec(8)).toEqual({ columnsPerRow: [4, 4] });
  });

  it('handles beyond 8 (9 = [5,4])', () => {
    expect(getGridSpec(9)).toEqual({ columnsPerRow: [5, 4] });
  });

  it('handles 12 = [6,6]', () => {
    expect(getGridSpec(12)).toEqual({ columnsPerRow: [6, 6] });
  });
});

// ─── calculateSlotGeometry ───────────────────────────────────

describe('calculateSlotGeometry', () => {
  it('returns full work area for 1×1 grid', () => {
    const grid = getGridSpec(1);
    const slot = calculateSlotGeometry(WORK_AREA, grid, 0, 0);
    expect(slot).toEqual(WORK_AREA);
  });

  it('splits horizontally for 2 windows', () => {
    const grid = getGridSpec(2);
    const left = calculateSlotGeometry(WORK_AREA, grid, 0, 0);
    const right = calculateSlotGeometry(WORK_AREA, grid, 0, 1);

    expect(left.x).toBe(0);
    expect(left.width).toBe(960);
    expect(right.x).toBe(960);
    expect(right.width).toBe(960);
    expect(left.height).toBe(WORK_AREA.height);
    expect(right.height).toBe(WORK_AREA.height);
  });

  it('last column gets remainder pixels', () => {
    // 1920 / 3 = 640
    const grid = getGridSpec(3);
    const last = calculateSlotGeometry(WORK_AREA, grid, 0, 2);
    expect(last.width).toBe(1920 - 640 * 2);
  });

  it('2×2 grid has equal-sized slots', () => {
    const grid = getGridSpec(4); // [2, 2]
    const topLeft = calculateSlotGeometry(WORK_AREA, grid, 0, 0);
    const topRight = calculateSlotGeometry(WORK_AREA, grid, 0, 1);
    const bottomLeft = calculateSlotGeometry(WORK_AREA, grid, 1, 0);
    const bottomRight = calculateSlotGeometry(WORK_AREA, grid, 1, 1);

    // All same width and height
    expect(topLeft.width).toBe(960);
    expect(topRight.width).toBe(960);
    expect(bottomLeft.width).toBe(960);
    expect(bottomRight.width).toBe(960);
    expect(topLeft.height + bottomLeft.height).toBe(WORK_AREA.height);
  });

  it('5-window grid has different widths per row', () => {
    const grid = getGridSpec(5); // [3, 2]
    const topCol = calculateSlotGeometry(WORK_AREA, grid, 0, 0);
    const bottomCol = calculateSlotGeometry(WORK_AREA, grid, 1, 0);

    // Top row: 1/3 width, bottom row: 1/2 width
    expect(topCol.width).toBe(640);
    expect(bottomCol.width).toBe(960);
  });
});

// ─── calculateAllSlots ──────────────────────────────────────

describe('calculateAllSlots', () => {
  it('returns empty for 0 windows', () => {
    expect(calculateAllSlots(WORK_AREA, 0)).toEqual([]);
  });

  it('returns 1 slot for 1 window', () => {
    const slots = calculateAllSlots(WORK_AREA, 1);
    expect(slots).toHaveLength(1);
    expect(slots[0].column).toBe(0);
    expect(slots[0].row).toBe(0);
  });

  it('returns column-major order for 4 windows (2×2)', () => {
    const slots = calculateAllSlots(WORK_AREA, 4);
    expect(slots).toHaveLength(4);
    // Column-major: col 0 top, col 0 bottom, col 1 top, col 1 bottom
    expect(slots[0]).toMatchObject({ column: 0, row: 0 });
    expect(slots[1]).toMatchObject({ column: 0, row: 1 });
    expect(slots[2]).toMatchObject({ column: 1, row: 0 });
    expect(slots[3]).toMatchObject({ column: 1, row: 1 });
  });

  it('returns column-major order for 5 windows [3,2]', () => {
    const slots = calculateAllSlots(WORK_AREA, 5);
    expect(slots).toHaveLength(5);
    // Col 0: (r0,c0), (r1,c0); Col 1: (r0,c1), (r1,c1); Col 2: (r0,c2)
    expect(slots[0]).toMatchObject({ column: 0, row: 0 });
    expect(slots[1]).toMatchObject({ column: 0, row: 1 });
    expect(slots[2]).toMatchObject({ column: 1, row: 0 });
    expect(slots[3]).toMatchObject({ column: 1, row: 1 });
    expect(slots[4]).toMatchObject({ column: 2, row: 0 });
  });

  it('returns column-major order for 6 windows (3×2)', () => {
    const slots = calculateAllSlots(WORK_AREA, 6);
    expect(slots).toHaveLength(6);
    expect(slots[0]).toMatchObject({ column: 0, row: 0 });
    expect(slots[1]).toMatchObject({ column: 0, row: 1 });
    expect(slots[2]).toMatchObject({ column: 1, row: 0 });
    expect(slots[3]).toMatchObject({ column: 1, row: 1 });
    expect(slots[4]).toMatchObject({ column: 2, row: 0 });
    expect(slots[5]).toMatchObject({ column: 2, row: 1 });
  });

  it('returns column-major order for 7 windows [4,3]', () => {
    const slots = calculateAllSlots(WORK_AREA, 7);
    expect(slots).toHaveLength(7);
    // Col 3 only has top row (bottom row has 3 cols)
    expect(slots[0]).toMatchObject({ column: 0, row: 0 });
    expect(slots[1]).toMatchObject({ column: 0, row: 1 });
    expect(slots[2]).toMatchObject({ column: 1, row: 0 });
    expect(slots[3]).toMatchObject({ column: 1, row: 1 });
    expect(slots[4]).toMatchObject({ column: 2, row: 0 });
    expect(slots[5]).toMatchObject({ column: 2, row: 1 });
    expect(slots[6]).toMatchObject({ column: 3, row: 0 });
  });

  it('slots cover the entire work area without gaps for 6 windows', () => {
    const slots = calculateAllSlots(WORK_AREA, 6);
    const totalArea = slots.reduce((sum, s) => sum + s.geometry.width * s.geometry.height, 0);
    const workAreaTotal = WORK_AREA.width * WORK_AREA.height;
    // Allow small rounding difference (max 1 pixel per slot dimension)
    expect(Math.abs(totalArea - workAreaTotal)).toBeLessThan(WORK_AREA.width + WORK_AREA.height);
  });

  it('no slots overlap for 8 windows', () => {
    const slots = calculateAllSlots(WORK_AREA, 8);
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const overlap = computeOverlapArea(slots[i].geometry, slots[j].geometry);
        expect(overlap).toBe(0);
      }
    }
  });

  it('5-window grid has correct mixed widths', () => {
    const slots = calculateAllSlots(WORK_AREA, 5);
    // Top row slots: 1/3 width
    expect(slots[0].geometry.width).toBe(640); // col 0, row 0
    expect(slots[2].geometry.width).toBe(640); // col 1, row 0
    expect(slots[4].geometry.width).toBe(640); // col 2, row 0
    // Bottom row slots: 1/2 width
    expect(slots[1].geometry.width).toBe(960); // col 0, row 1
    expect(slots[3].geometry.width).toBe(960); // col 1, row 1
  });
});

// ─── planSmartTileTransition ─────────────────────────────────

describe('planSmartTileTransition', () => {
  function makeSlots(count: number) {
    const slots = calculateAllSlots(WORK_AREA, count);
    return slots.map((s, i) => ({
      terminalKey: `ITERM:session-${i}`,
      sessionId: `session-${i}`,
      ...s,
    }));
  }

  it('0→1: no repositions, full work area', () => {
    const result = planSmartTileTransition([], WORK_AREA);
    expect(result).not.toBeNull();
    expect(result!.repositions).toHaveLength(0);
    expect(result!.newWindowGeometry).toEqual(WORK_AREA);
  });

  it('1→2: 1 reposition (split to half)', () => {
    const existing = makeSlots(1);
    const result = planSmartTileTransition(existing, WORK_AREA);
    expect(result).not.toBeNull();
    expect(result!.repositions).toHaveLength(1);
    expect(result!.repositions[0].newGeometry.width).toBe(960);
    expect(result!.newWindowGeometry.x).toBe(960);
  });

  it('2→3: 2 repositions (half → third)', () => {
    const existing = makeSlots(2);
    const result = planSmartTileTransition(existing, WORK_AREA);
    expect(result).not.toBeNull();
    expect(result!.repositions).toHaveLength(2);
  });

  it('3→4: all 3 reposition (single row → 2×2 grid)', () => {
    const existing = makeSlots(3);
    const result = planSmartTileTransition(existing, WORK_AREA);
    expect(result).not.toBeNull();
    // All 3 existing windows change size/position
    expect(result!.repositions).toHaveLength(3);
    // New window goes to last slot: (r1,c1) bottom-right
    expect(result!.newColumn).toBe(1);
    expect(result!.newRow).toBe(1);
  });

  it('4→5: 2 repositions (top row shrinks from 1/2 to 1/3 width)', () => {
    const existing = makeSlots(4);
    const result = planSmartTileTransition(existing, WORK_AREA);
    expect(result).not.toBeNull();
    // Top row windows shrink width (1/2→1/3), bottom row stays (1/2→1/2)
    expect(result!.repositions).toHaveLength(2);
    // New window at top-right: (r0,c2)
    expect(result!.newColumn).toBe(2);
    expect(result!.newRow).toBe(0);
  });

  it('5→6: 2 repositions (bottom row shrinks from 1/2 to 1/3 width)', () => {
    const existing = makeSlots(5);
    const result = planSmartTileTransition(existing, WORK_AREA);
    expect(result).not.toBeNull();
    // Bottom row: 1/2→1/3 width (2 repos). Top row already half-height, no change.
    expect(result!.repositions).toHaveLength(2);
    // New window: (r1,c2) bottom-right
    expect(result!.newColumn).toBe(2);
    expect(result!.newRow).toBe(1);
  });

  it('6→7: 3 repositions (top row shrinks from 1/3 to 1/4 width)', () => {
    const existing = makeSlots(6);
    const result = planSmartTileTransition(existing, WORK_AREA);
    expect(result).not.toBeNull();
    // Only top row windows change width (1/3→1/4), bottom row stays (1/3)
    expect(result!.repositions).toHaveLength(3);
    // New window at top-right: (r0,c3)
    expect(result!.newColumn).toBe(3);
    expect(result!.newRow).toBe(0);
  });

  it('7→8: 3 repositions (bottom row shrinks from 1/3 to 1/4 width)', () => {
    const existing = makeSlots(7);
    const result = planSmartTileTransition(existing, WORK_AREA);
    expect(result).not.toBeNull();
    // Bottom row: 1/3→1/4 width (3 repos). Top row already half-height, no change.
    expect(result!.repositions).toHaveLength(3);
    // New window: (r1,c3) bottom-right
    expect(result!.newColumn).toBe(3);
    expect(result!.newRow).toBe(1);
  });

  it('returns null for 8→9 (beyond limit)', () => {
    const existing = makeSlots(8);
    const result = planSmartTileTransition(existing, WORK_AREA);
    expect(result).toBeNull();
  });

  it('new window geometry matches expected slot', () => {
    const existing = makeSlots(3);
    const result = planSmartTileTransition(existing, WORK_AREA)!;
    const allSlotsFor4 = calculateAllSlots(WORK_AREA, 4);
    // New window should be the last slot (index 3)
    expect(result.newWindowGeometry).toEqual(allSlotsFor4[3].geometry);
  });
});

// ─── computeOverlapArea ──────────────────────────────────────

describe('computeOverlapArea', () => {
  it('returns 0 for non-overlapping rectangles', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 200, y: 0, width: 100, height: 100 };
    expect(computeOverlapArea(a, b)).toBe(0);
  });

  it('returns correct overlap for partially overlapping rectangles', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 50, y: 50, width: 100, height: 100 };
    // Overlap: 50×50 = 2500
    expect(computeOverlapArea(a, b)).toBe(2500);
  });

  it('returns full area for identical rectangles', () => {
    const a = { x: 10, y: 20, width: 100, height: 200 };
    expect(computeOverlapArea(a, a)).toBe(20000);
  });
});

// ─── findFreeSpace ──────────────────────────────────────────

describe('findFreeSpace', () => {
  it('returns top-left for no existing windows', () => {
    const result = findFreeSpace(WORK_AREA, []);
    expect(result.x).toBe(WORK_AREA.x);
    expect(result.y).toBe(WORK_AREA.y);
    expect(result.width).toBe(Math.round(WORK_AREA.width / 4));
    expect(result.height).toBe(Math.round(WORK_AREA.height / 2));
  });

  it('avoids a window in the top-left', () => {
    const existing = [{ x: 0, y: 23, width: 960, height: 1057 }];
    const result = findFreeSpace(WORK_AREA, existing);
    // Should be placed somewhere on the right half
    expect(result.x).toBeGreaterThan(0);
  });

  it('finds zero-overlap position when possible', () => {
    // One small window in the center
    const existing = [{ x: 800, y: 400, width: 320, height: 260 }];
    const result = findFreeSpace(WORK_AREA, existing);
    const overlap = computeOverlapArea(result, existing[0]);
    expect(overlap).toBe(0);
  });

  it('returns correct target size', () => {
    const result = findFreeSpace(WORK_AREA, []);
    expect(result.width).toBe(480); // 1920/4
    expect(result.height).toBe(529); // round(1057/2)
  });
});
