/**
 * Tile State Manager
 *
 * Tracks which terminal windows are in a tiled arrangement and where,
 * per display. Used by the smart tiling system to plan transitions
 * when adding new windows.
 *
 * State is maintained in memory — it resets when the server restarts.
 * This is acceptable because tiling is an ephemeral visual arrangement.
 */

import type { WindowGeometry } from './types.js';
import { getGridSpec, calculateAllSlots } from './smart-layouts.js';

/**
 * A single window slot in a tiled arrangement
 */
export interface TiledWindowSlot {
  terminalKey: string;
  sessionId: string;
  geometry: WindowGeometry;
  column: number;
  row: number;
}

/**
 * The tiling state for a single display
 */
export interface TileState {
  /** Display this tile arrangement is on */
  displayId: string;
  /** Work area of the display when tiling was set up */
  workArea: WindowGeometry;
  /** Number of columns in each row (top row first) */
  columnsPerRow: number[];
  /** Individual window slots */
  slots: TiledWindowSlot[];
  /** Timestamp of when this tile state was last updated */
  tiledAt: number;
}

const VALIDATION_TOLERANCE = 50; // pixels

/**
 * Manages tile state per display.
 * Holds at most one TileState per display.
 */
export class TileStateManager {
  private states = new Map<string, TileState>();

  getTileState(displayId: string): TileState | null {
    return this.states.get(displayId) ?? null;
  }

  /**
   * Get tile state for any display (returns the first one found).
   * Useful when the display ID isn't known.
   */
  getAnyTileState(): TileState | null {
    for (const state of this.states.values()) {
      return state;
    }
    return null;
  }

  setTileState(displayId: string, state: TileState): void {
    this.states.set(displayId, state);
  }

  clearTileState(displayId: string): void {
    this.states.delete(displayId);
  }

  clearAll(): void {
    this.states.clear();
  }

  /**
   * Remove a session from all tile states.
   * Called when a session ends or is unregistered.
   * Does NOT auto-re-tile remaining windows (that would be disruptive).
   * Instead, recalculates the grid for the remaining count so the next
   * smart-tile-add knows the correct state.
   */
  removeSession(sessionId: string): void {
    for (const [displayId, state] of this.states) {
      const hadSlot = state.slots.some(s => s.sessionId === sessionId);
      if (!hadSlot) continue;

      const remaining = state.slots.filter(s => s.sessionId !== sessionId);

      if (remaining.length === 0) {
        this.states.delete(displayId);
        continue;
      }

      // Recalculate grid for remaining count
      const newGrid = getGridSpec(remaining.length);
      const newSlots = calculateAllSlots(state.workArea, remaining.length);

      // Map remaining windows to new slots (preserve order)
      const updatedSlots: TiledWindowSlot[] = remaining.map((slot, i) => ({
        terminalKey: slot.terminalKey,
        sessionId: slot.sessionId,
        geometry: newSlots[i].geometry,
        column: newSlots[i].column,
        row: newSlots[i].row,
      }));

      this.states.set(displayId, {
        displayId,
        workArea: state.workArea,
        columnsPerRow: newGrid.columnsPerRow,
        slots: updatedSlots,
        tiledAt: Date.now(),
      });
    }
  }

  /**
   * Build a TileState from a set of sessions after a manual tile operation.
   * Called when the user explicitly tiles windows via the GUI.
   */
  buildFromManualTile(
    displayId: string,
    workArea: WindowGeometry,
    sessions: Array<{ terminalKey: string; sessionId: string }>,
  ): TileState {
    const grid = getGridSpec(sessions.length);
    const slots = calculateAllSlots(workArea, sessions.length);

    const tiledSlots: TiledWindowSlot[] = sessions.map((session, i) => ({
      terminalKey: session.terminalKey,
      sessionId: session.sessionId,
      geometry: slots[i].geometry,
      column: slots[i].column,
      row: slots[i].row,
    }));

    const state: TileState = {
      displayId,
      workArea,
      columnsPerRow: grid.columnsPerRow,
      slots: tiledSlots,
      tiledAt: Date.now(),
    };

    this.states.set(displayId, state);
    return state;
  }
}

/**
 * Validate that tracked windows are still roughly where we placed them.
 * macOS only — uses actual window bounds from AppleScript.
 *
 * @param state - The tile state to validate
 * @param getBounds - Function to get actual window bounds (from WindowManager)
 * @returns true if all windows are within tolerance of tracked positions
 */
export async function validateTileStateWithBounds(
  state: TileState,
  getBounds: (terminalKey: string) => Promise<WindowGeometry | null>,
): Promise<boolean> {
  for (const slot of state.slots) {
    const actual = await getBounds(slot.terminalKey);
    if (!actual) return false;

    if (
      Math.abs(actual.x - slot.geometry.x) > VALIDATION_TOLERANCE ||
      Math.abs(actual.y - slot.geometry.y) > VALIDATION_TOLERANCE ||
      Math.abs(actual.width - slot.geometry.width) > VALIDATION_TOLERANCE ||
      Math.abs(actual.height - slot.geometry.height) > VALIDATION_TOLERANCE
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Validate tile state by checking if sessions still exist.
 * Used on Windows/Linux where we can't read window bounds.
 *
 * @param state - The tile state to validate
 * @param sessionExists - Function to check if a session ID is still registered
 * @returns true if all tracked sessions still exist
 */
export function validateTileStateBySessions(
  state: TileState,
  sessionExists: (sessionId: string) => boolean,
): boolean {
  return state.slots.every(slot => sessionExists(slot.sessionId));
}
