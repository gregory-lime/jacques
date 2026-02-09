/**
 * Minimalist night sky scene with gradient block art
 * Uses: █ ▓ ▒ ░ for shading, * for stars
 *
 * Design philosophy: Sparse, zen-like, professional
 */

// Full scene for wide terminals (≥90 chars)
export const SCENE_FULL = [
  "     *                                       █████▓▓░",
  "                                 *         ███▓░     ░░",
  "            ░░░░░░                        ███▓░",
  "    ░░░   ░░░░░░░░░░                      ███▓░",
  "   ░░░░░░░░░░░░░░░░░░░    *                ██▓░░      ▓",
  "                                             ░▓▓███▓▓░",
  " *                                 ░░░░",
  "                                 ░░░░░░░░",
  "                               ░░░░░░░░░░░░░░░░",
  "       █████████                                        *",
  "      ██▄█████▄██                        *",
  "       █████████      *",
];

// Compact scene for medium terminals (70-89 chars)
export const SCENE_COMPACT = [
  "     *               █████▓▓░",
  "                   ███▓░     ░░",
  "   ░░░░░░         ███▓░",
  " ░░░░░░░░░░░   *   ██▓░░",
];

// Scene width constants
export const SCENE_FULL_WIDTH = 52;
export const SCENE_COMPACT_WIDTH = 30;
export const SCENE_FULL_HEIGHT = 12;
export const SCENE_COMPACT_HEIGHT = 4;

/**
 * Generate a dotted border line
 * Uses the … (horizontal ellipsis) character for a subtle, zen border
 */
export function dotLine(width: number): string {
  return "…".repeat(width);
}

/**
 * Generate a thin section separator line
 * Uses ─ (box drawing horizontal) for clean section breaks
 */
export function sectionLine(width: number): string {
  return "─".repeat(width);
}

/**
 * Get the appropriate scene for terminal width
 */
export function getScene(terminalWidth: number): string[] {
  if (terminalWidth >= 90) {
    return SCENE_FULL;
  } else if (terminalWidth >= 70) {
    return SCENE_COMPACT;
  }
  return []; // No scene for minimal layout
}

/**
 * Get scene dimensions for layout calculations
 */
export function getSceneDimensions(terminalWidth: number): {
  width: number;
  height: number;
} {
  if (terminalWidth >= 90) {
    return { width: SCENE_FULL_WIDTH, height: SCENE_FULL_HEIGHT };
  } else if (terminalWidth >= 70) {
    return { width: SCENE_COMPACT_WIDTH, height: SCENE_COMPACT_HEIGHT };
  }
  return { width: 0, height: 0 };
}
