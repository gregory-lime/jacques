/**
 * Tile State Manager Tests
 *
 * Tests tile state tracking, session removal, manual tile building,
 * and validation (both bounds-based and session-based).
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  TileStateManager,
  validateTileStateWithBounds,
  validateTileStateBySessions,
} from './tile-state.js';
import type { TileState } from './tile-state.js';
import type { WindowGeometry } from './types.js';

const WORK_AREA: WindowGeometry = { x: 0, y: 23, width: 1920, height: 1057 };

describe('TileStateManager', () => {
  let manager: TileStateManager;

  beforeEach(() => {
    manager = new TileStateManager();
  });

  it('returns null for unknown display', () => {
    expect(manager.getTileState('primary')).toBeNull();
  });

  it('stores and retrieves tile state', () => {
    const state: TileState = {
      displayId: 'primary',
      workArea: WORK_AREA,
      columnsPerRow: [2],
      slots: [
        { terminalKey: 'ITERM:a', sessionId: 'a', geometry: { x: 0, y: 23, width: 960, height: 1057 }, column: 0, row: 0 },
        { terminalKey: 'ITERM:b', sessionId: 'b', geometry: { x: 960, y: 23, width: 960, height: 1057 }, column: 1, row: 0 },
      ],
      tiledAt: Date.now(),
    };
    manager.setTileState('primary', state);
    expect(manager.getTileState('primary')).toEqual(state);
  });

  it('clears tile state', () => {
    const state: TileState = {
      displayId: 'primary',
      workArea: WORK_AREA,
      columnsPerRow: [1],
      slots: [{ terminalKey: 'ITERM:a', sessionId: 'a', geometry: WORK_AREA, column: 0, row: 0 }],
      tiledAt: Date.now(),
    };
    manager.setTileState('primary', state);
    manager.clearTileState('primary');
    expect(manager.getTileState('primary')).toBeNull();
  });

  it('getAnyTileState returns first state', () => {
    expect(manager.getAnyTileState()).toBeNull();

    const state: TileState = {
      displayId: 'display-1',
      workArea: WORK_AREA,
      columnsPerRow: [1],
      slots: [{ terminalKey: 'ITERM:a', sessionId: 'a', geometry: WORK_AREA, column: 0, row: 0 }],
      tiledAt: Date.now(),
    };
    manager.setTileState('display-1', state);
    expect(manager.getAnyTileState()?.displayId).toBe('display-1');
  });

  describe('removeSession', () => {
    it('removes session and recalculates grid', () => {
      const state: TileState = {
        displayId: 'primary',
        workArea: WORK_AREA,
        columnsPerRow: [3],
        slots: [
          { terminalKey: 'ITERM:a', sessionId: 'a', geometry: { x: 0, y: 23, width: 640, height: 1057 }, column: 0, row: 0 },
          { terminalKey: 'ITERM:b', sessionId: 'b', geometry: { x: 640, y: 23, width: 640, height: 1057 }, column: 1, row: 0 },
          { terminalKey: 'ITERM:c', sessionId: 'c', geometry: { x: 1280, y: 23, width: 640, height: 1057 }, column: 2, row: 0 },
        ],
        tiledAt: Date.now(),
      };
      manager.setTileState('primary', state);

      manager.removeSession('b');

      const updated = manager.getTileState('primary');
      expect(updated).not.toBeNull();
      expect(updated!.slots).toHaveLength(2);
      expect(updated!.columnsPerRow).toEqual([2]);
      // Remaining sessions: a and c
      expect(updated!.slots[0].sessionId).toBe('a');
      expect(updated!.slots[1].sessionId).toBe('c');
    });

    it('clears state when last session removed', () => {
      const state: TileState = {
        displayId: 'primary',
        workArea: WORK_AREA,
        columnsPerRow: [1],
        slots: [{ terminalKey: 'ITERM:a', sessionId: 'a', geometry: WORK_AREA, column: 0, row: 0 }],
        tiledAt: Date.now(),
      };
      manager.setTileState('primary', state);
      manager.removeSession('a');
      expect(manager.getTileState('primary')).toBeNull();
    });

    it('does nothing for unknown session', () => {
      const state: TileState = {
        displayId: 'primary',
        workArea: WORK_AREA,
        columnsPerRow: [1],
        slots: [{ terminalKey: 'ITERM:a', sessionId: 'a', geometry: WORK_AREA, column: 0, row: 0 }],
        tiledAt: Date.now(),
      };
      manager.setTileState('primary', state);
      manager.removeSession('unknown');
      expect(manager.getTileState('primary')!.slots).toHaveLength(1);
    });
  });

  describe('buildFromManualTile', () => {
    it('builds state for 3 sessions', () => {
      const sessions = [
        { terminalKey: 'ITERM:a', sessionId: 'a' },
        { terminalKey: 'ITERM:b', sessionId: 'b' },
        { terminalKey: 'ITERM:c', sessionId: 'c' },
      ];

      const state = manager.buildFromManualTile('primary', WORK_AREA, sessions);

      expect(state.displayId).toBe('primary');
      expect(state.columnsPerRow).toEqual([3]);
      expect(state.slots).toHaveLength(3);
      expect(state.slots[0].sessionId).toBe('a');
      expect(state.slots[1].sessionId).toBe('b');
      expect(state.slots[2].sessionId).toBe('c');

      // Should also be stored
      expect(manager.getTileState('primary')).toEqual(state);
    });
  });
});

describe('validateTileStateWithBounds', () => {
  const state: TileState = {
    displayId: 'primary',
    workArea: WORK_AREA,
    columnsPerRow: [2],
    slots: [
      { terminalKey: 'ITERM:a', sessionId: 'a', geometry: { x: 0, y: 23, width: 960, height: 1057 }, column: 0, row: 0 },
      { terminalKey: 'ITERM:b', sessionId: 'b', geometry: { x: 960, y: 23, width: 960, height: 1057 }, column: 1, row: 0 },
    ],
    tiledAt: Date.now(),
  };

  it('validates when bounds match within tolerance', async () => {
    const getBounds = async (key: string) => {
      if (key === 'ITERM:a') return { x: 2, y: 25, width: 958, height: 1055 }; // Within 50px
      if (key === 'ITERM:b') return { x: 962, y: 23, width: 960, height: 1057 };
      return null;
    };
    expect(await validateTileStateWithBounds(state, getBounds)).toBe(true);
  });

  it('fails when bounds are outside tolerance', async () => {
    const getBounds = async (key: string) => {
      if (key === 'ITERM:a') return { x: 200, y: 23, width: 960, height: 1057 }; // Way off
      if (key === 'ITERM:b') return { x: 960, y: 23, width: 960, height: 1057 };
      return null;
    };
    expect(await validateTileStateWithBounds(state, getBounds)).toBe(false);
  });

  it('fails when a window is not found', async () => {
    const getBounds = async (_key: string) => null;
    expect(await validateTileStateWithBounds(state, getBounds)).toBe(false);
  });
});

describe('validateTileStateBySessions', () => {
  const state: TileState = {
    displayId: 'primary',
    workArea: WORK_AREA,
    columnsPerRow: [2],
    slots: [
      { terminalKey: 'ITERM:a', sessionId: 'a', geometry: { x: 0, y: 23, width: 960, height: 1057 }, column: 0, row: 0 },
      { terminalKey: 'ITERM:b', sessionId: 'b', geometry: { x: 960, y: 23, width: 960, height: 1057 }, column: 1, row: 0 },
    ],
    tiledAt: Date.now(),
  };

  it('validates when all sessions exist', () => {
    const exists = (id: string) => ['a', 'b'].includes(id);
    expect(validateTileStateBySessions(state, exists)).toBe(true);
  });

  it('fails when a session is missing', () => {
    const exists = (id: string) => id === 'a'; // 'b' is gone
    expect(validateTileStateBySessions(state, exists)).toBe(false);
  });
});
