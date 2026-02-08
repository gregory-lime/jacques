/**
 * Window Manager Types
 *
 * Platform-agnostic interfaces for terminal window positioning and tiling.
 * Each platform (macOS, Windows, Linux) implements these interfaces.
 */

/**
 * Window geometry (position and size)
 */
export interface WindowGeometry {
  /** Left position in pixels */
  x: number;
  /** Top position in pixels */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/**
 * Display/monitor information
 */
export interface Display {
  /** Unique identifier for the display */
  id: string;
  /** Full display bounds including dock/taskbar */
  bounds: WindowGeometry;
  /** Usable work area (excludes dock/taskbar) */
  workArea: WindowGeometry;
  /** Whether this is the primary display */
  isPrimary: boolean;
  /** Display scale factor (for Retina/HiDPI) */
  scaleFactor?: number;
}

/**
 * Tile layout types
 */
export type TileLayout =
  | 'side-by-side' // 2 windows, left/right
  | 'thirds' // 3 windows, equal width
  | '2x2' // 4 windows, grid
  | 'smart'; // dynamic grid from smart-layouts (4+ windows)

/**
 * Result of a window positioning operation
 */
export interface PositionResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of a tile operation
 */
export interface TileResult {
  /** Whether all windows were successfully positioned */
  success: boolean;
  /** Number of windows successfully positioned */
  positioned: number;
  /** Total windows attempted */
  total: number;
  /** Error messages for any failures */
  errors?: string[];
}

/**
 * Window manager interface
 *
 * Platform-specific implementations provide this interface
 * for positioning and tiling terminal windows.
 */
export interface WindowManager {
  /**
   * Get all available displays/monitors
   */
  getDisplays(): Promise<Display[]>;

  /**
   * Position a terminal window to the specified geometry
   *
   * @param terminalKey - The terminal key (e.g., "ITERM:uuid", "PID:12345")
   * @param geometry - Target window position and size
   */
  positionWindow(terminalKey: string, geometry: WindowGeometry): Promise<PositionResult>;

  /**
   * Tile multiple terminal windows according to a layout
   *
   * @param terminalKeys - Array of terminal keys to tile
   * @param layout - The tile layout to use
   * @param display - Optional display to tile on (defaults to primary)
   */
  tileWindows(
    terminalKeys: string[],
    layout: TileLayout,
    display?: Display
  ): Promise<TileResult>;

  /**
   * Get the platform name for this manager
   */
  getPlatform(): string;

  /**
   * Check if window positioning is supported on this platform
   */
  isSupported(): boolean;
}

/**
 * Session info needed for tiling
 * Subset of the full Session type
 */
export interface TileSession {
  session_id: string;
  terminal_key: string;
}
