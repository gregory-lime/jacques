/**
 * Shared theme constants for the CLI TUI layout.
 *
 * Two-tone palette: muted terracotta (content) + warm sand (structure).
 * Gradient: #D4764E → #A0896E → #8B9296
 */

// Primary palette
export const ACCENT_COLOR = "#D4764E";      // Terracotta — titles, mascot, selected items, progress
export const BORDER_COLOR = "#A0896E";      // Warm sand — box borders, structural chrome
export const SECONDARY_COLOR = "#A0896E";   // Key labels, secondary interactive elements
export const MUTED_TEXT = "#8B9296";         // Cool grey — hints, inactive, dimmed

// Semantic status
export const SUCCESS_COLOR = "#34D399";
export const WARNING_COLOR = "#FBBF24";
export const ERROR_COLOR = "#EF4444";

// Utility
export const INVERTED_TEXT = "#1a1a1a";     // Dark text on accent backgrounds
export const MASCOT_WIDTH = 14;
export const MIN_CONTENT_WIDTH = 42;
export const CONTENT_PADDING = 2;
export const HORIZONTAL_LAYOUT_MIN_WIDTH = 62;
export const FIXED_CONTENT_HEIGHT = 10;
