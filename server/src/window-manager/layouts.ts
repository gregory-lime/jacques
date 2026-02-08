/**
 * Layout Calculations
 *
 * Functions to calculate window geometry for various tiling layouts.
 * All calculations account for work area (excluding dock/taskbar).
 */

import type { WindowGeometry, TileLayout } from './types.js';

/**
 * Calculate window geometry for a tile position within a layout
 *
 * @param workArea - The usable work area of the display
 * @param layout - The tile layout type
 * @param position - The position index (0-based)
 * @param total - Total number of windows being tiled
 */
export function calculateTileGeometry(
  workArea: WindowGeometry,
  layout: TileLayout,
  position: number,
  total: number
): WindowGeometry {
  const { x, y, width, height } = workArea;

  switch (layout) {
    case 'side-by-side': {
      // 2 windows, split horizontally
      const halfW = Math.floor(width / 2);
      if (position === 0) {
        return { x, y, width: halfW, height };
      } else {
        // Right side gets remaining width (handles odd pixels)
        return { x: x + halfW, y, width: width - halfW, height };
      }
    }

    case 'thirds': {
      // 3 windows, equal thirds
      const thirdW = Math.floor(width / 3);
      if (position === 0) {
        return { x, y, width: thirdW, height };
      } else if (position === 1) {
        return { x: x + thirdW, y, width: thirdW, height };
      } else {
        // Last third gets remaining width (handles uneven division)
        return { x: x + thirdW * 2, y, width: width - thirdW * 2, height };
      }
    }

    case '2x2': {
      // 4 windows in a 2x2 grid
      const halfW = Math.floor(width / 2);
      const halfH = Math.floor(height / 2);
      const row = Math.floor(position / 2); // 0 or 1
      const col = position % 2; // 0 or 1

      // Handle odd pixels by giving extra to right/bottom
      const cellW = col === 1 ? width - halfW : halfW;
      const cellH = row === 1 ? height - halfH : halfH;

      return {
        x: x + col * halfW,
        y: y + row * halfH,
        width: cellW,
        height: cellH,
      };
    }

    default:
      // Fallback: just return the full work area
      return workArea;
  }
}

/**
 * Determine the best layout for a given number of windows
 *
 * @param windowCount - Number of windows to tile
 */
export function suggestLayout(windowCount: number): TileLayout {
  if (windowCount <= 2) {
    return 'side-by-side';
  } else if (windowCount === 3) {
    return 'thirds';
  } else {
    return 'smart';
  }
}

/**
 * Get the maximum windows supported by a layout
 */
export function getLayoutCapacity(layout: TileLayout): number {
  switch (layout) {
    case 'side-by-side':
      return 2;
    case 'thirds':
      return 3;
    case '2x2':
      return 4;
    case 'smart':
      return 8;
    default:
      return 2;
  }
}

/**
 * Validate that a layout can accommodate the given number of windows
 */
export function validateLayout(layout: TileLayout, windowCount: number): boolean {
  return windowCount <= getLayoutCapacity(layout);
}

/**
 * Calculate geometry for browser + terminal(s) layout
 *
 * @param workArea - The usable work area of the display
 * @param layout - The browser layout type
 * @returns Geometry for browser window and terminal window(s)
 */
export function calculateBrowserLayout(
  workArea: WindowGeometry,
  layout: 'browser-terminal' | 'browser-two-terminals'
): { browser: WindowGeometry; terminals: WindowGeometry[] } {
  const { x, y, width, height } = workArea;

  if (layout === 'browser-terminal') {
    // Browser takes 5/7, terminal takes 2/7
    const browserW = Math.floor(width * 5 / 7);
    const terminalW = width - browserW;
    return {
      browser: { x, y, width: browserW, height },
      terminals: [{ x: x + browserW, y, width: terminalW, height }],
    };
  }

  // browser-two-terminals: browser on left (5/7), two terminals stacked on right (2/7)
  const browserW = Math.floor(width * 5 / 7);
  const terminalW = width - browserW;
  const halfH = Math.floor(height / 2);
  return {
    browser: { x, y, width: browserW, height },
    terminals: [
      { x: x + browserW, y, width: terminalW, height: halfH },
      { x: x + browserW, y: y + halfH, width: terminalW, height: height - halfH },
    ],
  };
}
