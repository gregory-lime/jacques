/**
 * Window Manager Module
 *
 * Exports a factory function to create the appropriate window manager
 * for the current platform.
 */

export type {
  WindowGeometry,
  Display,
  TileLayout,
  PositionResult,
  TileResult,
  WindowManager,
  TileSession,
} from './types.js';

export {
  calculateTileGeometry,
  suggestLayout,
  getLayoutCapacity,
  validateLayout,
} from './layouts.js';

export {
  getGridSpec,
  calculateSlotGeometry,
  calculateAllSlots,
  planSmartTileTransition,
  findFreeSpace,
  computeOverlapArea,
} from './smart-layouts.js';

export type {
  GridSpec,
  GridSlot,
  WindowReposition,
  SmartTileTransition,
  ExistingSlot,
} from './smart-layouts.js';

export {
  TileStateManager,
  validateTileStateWithBounds,
  validateTileStateBySessions,
} from './tile-state.js';

export type {
  TiledWindowSlot,
  TileState,
} from './tile-state.js';

import type { WindowManager } from './types.js';
import { MacOSWindowManager } from './macos-manager.js';
import { WindowsWindowManager } from './windows-manager.js';
import { LinuxWindowManager } from './linux-manager.js';

/**
 * Create a window manager for the current platform
 *
 * @throws Error if the platform is not supported
 */
export function createWindowManager(): WindowManager {
  switch (process.platform) {
    case 'darwin':
      return new MacOSWindowManager();
    case 'win32':
      return new WindowsWindowManager();
    case 'linux':
      return new LinuxWindowManager();
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

/**
 * Check if window management is supported on the current platform
 */
export function isWindowManagementSupported(): boolean {
  return ['darwin', 'win32', 'linux'].includes(process.platform);
}

/**
 * Get platform-specific notes/warnings about window management
 */
export function getPlatformNotes(): string | null {
  switch (process.platform) {
    case 'darwin':
      return null; // Full support
    case 'win32':
      return null; // Full support
    case 'linux':
      // Check for Wayland
      if (
        process.env.XDG_SESSION_TYPE === 'wayland' ||
        process.env.WAYLAND_DISPLAY !== undefined
      ) {
        return 'Window positioning is not supported on Wayland. Use your compositor\'s built-in tiling.';
      }
      return 'Requires wmctrl for X11. Install with: sudo apt install wmctrl';
    default:
      return `Platform ${process.platform} is not supported`;
  }
}
