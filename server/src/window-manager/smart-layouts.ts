/**
 * Smart Layout Engine
 *
 * Calculates grid geometry for 1-8+ terminal windows, plans transitions
 * when adding a window to an existing tiled layout, and finds free space
 * for non-tiled placement.
 *
 * Grid progression (row-based, each row can have different column count):
 *
 *   n=1: [A]                        1 row, 1 col
 *   n=2: [A][B]                     1 row, 2 cols
 *   n=3: [A][B][C]                  1 row, 3 cols
 *   n=4: [A][B] / [C][D]            2×2 equal grid
 *   n=5: [A][B][C] / [D][E]         3 top, 2 bottom
 *   n=6: [A][B][C] / [D][E][F]      3×2 equal grid
 *   n=7: [A][B][C][D] / [E][F][G]   4 top, 3 bottom
 *   n=8: [A][B][C][D] / [E][F][G][H] 4×2 equal grid
 *
 * Slot ordering is column-major: iterate columns L→R, rows top→bottom
 * within each column. This ensures stable index-based transitions.
 */

import type { WindowGeometry } from './types.js';

/**
 * Grid specification: number of columns in each row.
 * Index 0 = top row, index 1 = bottom row (if present).
 */
export interface GridSpec {
  columnsPerRow: number[];
}

/**
 * A slot in the grid with its position and geometry
 */
export interface GridSlot {
  column: number;
  row: number;
  geometry: WindowGeometry;
}

/**
 * A reposition instruction for an existing window
 */
export interface WindowReposition {
  terminalKey: string;
  sessionId: string;
  newGeometry: WindowGeometry;
  newColumn: number;
  newRow: number;
}

/**
 * Result of planning a smart tile transition
 */
export interface SmartTileTransition {
  /** Existing windows that need to be repositioned */
  repositions: WindowReposition[];
  /** Geometry for the new window */
  newWindowGeometry: WindowGeometry;
  /** The new window's grid position */
  newColumn: number;
  newRow: number;
  /** Updated grid spec after the transition */
  newGrid: GridSpec;
}

/**
 * Get the grid specification for a given number of windows.
 *
 * Progression:
 *   1: [1]     — 1 fullscreen
 *   2: [2]     — 2 side-by-side
 *   3: [3]     — 3 side-by-side
 *   4: [2,2]   — 2×2 equal grid
 *   5: [3,2]   — 3 top, 2 bottom
 *   6: [3,3]   — 3×2 equal grid
 *   7: [4,3]   — 4 top, 3 bottom
 *   8: [4,4]   — 4×2 equal grid
 *   n≥4: [ceil(n/2), floor(n/2)]
 */
export function getGridSpec(windowCount: number): GridSpec {
  if (windowCount <= 0) return { columnsPerRow: [] };
  if (windowCount === 1) return { columnsPerRow: [1] };
  if (windowCount === 2) return { columnsPerRow: [2] };
  if (windowCount === 3) return { columnsPerRow: [3] };
  // 4+: two rows, top row gets ceil, bottom gets floor
  return { columnsPerRow: [Math.ceil(windowCount / 2), Math.floor(windowCount / 2)] };
}

/**
 * Calculate geometry for a single slot in the grid.
 * Each row can have a different number of columns (and thus different widths).
 */
export function calculateSlotGeometry(
  workArea: WindowGeometry,
  grid: GridSpec,
  row: number,
  column: number,
): WindowGeometry {
  const numRows = grid.columnsPerRow.length;
  const colsInRow = grid.columnsPerRow[row];
  const rowHeight = Math.floor(workArea.height / numRows);
  const colWidth = Math.floor(workArea.width / colsInRow);

  const isLastRow = row === numRows - 1;
  const isLastCol = column === colsInRow - 1;

  return {
    x: workArea.x + column * colWidth,
    y: workArea.y + row * rowHeight,
    width: isLastCol ? workArea.width - column * colWidth : colWidth,
    height: isLastRow ? workArea.height - row * rowHeight : rowHeight,
  };
}

/**
 * Calculate all slot geometries for n windows.
 * Order: column-major (iterate columns L→R, rows top→bottom within each column).
 */
export function calculateAllSlots(
  workArea: WindowGeometry,
  windowCount: number,
): GridSlot[] {
  const grid = getGridSpec(windowCount);
  if (grid.columnsPerRow.length === 0) return [];

  const slots: GridSlot[] = [];
  const numRows = grid.columnsPerRow.length;
  const maxCols = Math.max(...grid.columnsPerRow);

  // Column-major: iterate columns, then rows within each column
  for (let col = 0; col < maxCols; col++) {
    for (let row = 0; row < numRows; row++) {
      if (col < grid.columnsPerRow[row]) {
        slots.push({
          column: col,
          row,
          geometry: calculateSlotGeometry(workArea, grid, row, col),
        });
      }
    }
  }

  return slots;
}

/**
 * Slot info from the current tile state (terminal + position).
 */
export interface ExistingSlot {
  terminalKey: string;
  sessionId: string;
  column: number;
  row: number;
  geometry: WindowGeometry;
}

/**
 * Plan a smart tile transition: adding one window to the current layout.
 *
 * Uses index-based mapping: window at slot index i maps to new slot index i.
 * Returns null if beyond 8 (caller should use free-space).
 */
export function planSmartTileTransition(
  existingSlots: ExistingSlot[],
  workArea: WindowGeometry,
): SmartTileTransition | null {
  const currentCount = existingSlots.length;
  const newCount = currentCount + 1;

  if (newCount > 8) {
    return null; // Caller should use findFreeSpace
  }

  const newSlots = calculateAllSlots(workArea, newCount);
  const newGrid = getGridSpec(newCount);

  const repositions: WindowReposition[] = [];

  // Index-based mapping: existing slot at index i → new slot at index i
  for (let i = 0; i < currentCount; i++) {
    const existing = existingSlots[i];
    const target = newSlots[i];

    const geomChanged = (
      existing.geometry.x !== target.geometry.x ||
      existing.geometry.y !== target.geometry.y ||
      existing.geometry.width !== target.geometry.width ||
      existing.geometry.height !== target.geometry.height
    );

    if (geomChanged) {
      repositions.push({
        terminalKey: existing.terminalKey,
        sessionId: existing.sessionId,
        newGeometry: target.geometry,
        newColumn: target.column,
        newRow: target.row,
      });
    }
  }

  // The new window goes in the last slot
  const newSlot = newSlots[currentCount];

  return {
    repositions,
    newWindowGeometry: newSlot.geometry,
    newColumn: newSlot.column,
    newRow: newSlot.row,
    newGrid,
  };
}

/**
 * Compute the overlap area between two rectangles.
 */
export function computeOverlapArea(a: WindowGeometry, b: WindowGeometry): number {
  const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return overlapX * overlapY;
}

/**
 * Find the least-occupied position on the work area for a new terminal.
 * Used when terminals are not in a recognized tiled layout, or when count > 8.
 *
 * Target size: 1/4 width, 1/2 height of work area.
 * Scans an 8×4 grid of candidate positions and picks the one with least overlap.
 */
export function findFreeSpace(
  workArea: WindowGeometry,
  existingWindows: WindowGeometry[],
): WindowGeometry {
  const targetW = Math.round(workArea.width / 4);
  const targetH = Math.round(workArea.height / 2);

  // If no existing windows, place at top-left
  if (existingWindows.length === 0) {
    return { x: workArea.x, y: workArea.y, width: targetW, height: targetH };
  }

  const GRID_COLS = 8;
  const GRID_ROWS = 4;

  const maxX = workArea.x + workArea.width - targetW;
  const maxY = workArea.y + workArea.height - targetH;

  // Avoid division by zero if work area is smaller than target
  const stepX = GRID_COLS > 1 ? Math.max(1, Math.floor((maxX - workArea.x) / (GRID_COLS - 1))) : 0;
  const stepY = GRID_ROWS > 1 ? Math.max(1, Math.floor((maxY - workArea.y) / (GRID_ROWS - 1))) : 0;

  let bestX = workArea.x;
  let bestY = workArea.y;
  let bestOverlap = Infinity;

  for (let gx = 0; gx < GRID_COLS; gx++) {
    for (let gy = 0; gy < GRID_ROWS; gy++) {
      const cx = Math.min(workArea.x + gx * stepX, maxX);
      const cy = Math.min(workArea.y + gy * stepY, maxY);
      const candidate = { x: cx, y: cy, width: targetW, height: targetH };

      let overlapSum = 0;
      for (const existing of existingWindows) {
        overlapSum += computeOverlapArea(candidate, existing);
      }

      if (overlapSum < bestOverlap) {
        bestOverlap = overlapSum;
        bestX = cx;
        bestY = cy;
        if (overlapSum === 0) break; // Can't do better than zero overlap
      }
    }
    if (bestOverlap === 0) break;
  }

  return { x: bestX, y: bestY, width: targetW, height: targetH };
}
