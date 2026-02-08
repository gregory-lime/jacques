/**
 * Gradient progress bars and formatting utilities
 * Uses block characters: █ (full) ░ (empty) for clean visualization
 */

/**
 * Create a gradient progress bar
 * @param percent - Value from 0-100
 * @param width - Total bar width in characters (default 12)
 * @returns String with filled and empty blocks
 */
export function progressBar(percent: number, width: number = 12): string {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clampedPercent / 100) * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Create a progress bar with a label
 * @param percent - Value from 0-100
 * @param width - Total bar width in characters
 * @param label - Label to append after the bar
 */
export function progressBarWithLabel(
  percent: number,
  width: number,
  label: string
): string {
  return `${progressBar(percent, width)}  ${label}`;
}

/**
 * Format token count with appropriate suffix
 * @param count - Raw token count
 * @returns Formatted string (e.g., "234k", "1.2M")
 */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${Math.round(count / 1_000)}k`;
  }
  return count.toString();
}

/**
 * Format duration in minutes to human-readable
 * @param minutes - Duration in minutes
 * @returns Formatted string (e.g., "45m", "2h 30m")
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format a date for display
 * @param date - Date to format
 * @returns Formatted string (e.g., "Jan 31")
 */
export function formatDate(date: Date): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Calculate percentage for progress bar from token counts
 * @param used - Used tokens
 * @param total - Total available tokens
 * @returns Percentage (0-100)
 */
export function tokenPercentage(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((used / total) * 100);
}

/**
 * Truncate a string to fit within a width, adding ellipsis if needed
 * @param str - String to truncate
 * @param maxWidth - Maximum width
 * @returns Truncated string with … if needed
 */
export function truncate(str: string, maxWidth: number): string {
  if (str.length <= maxWidth) return str;
  if (maxWidth <= 1) return "…";
  return str.slice(0, maxWidth - 1) + "…";
}

/**
 * Pad a string to a fixed width (left or right aligned)
 * @param str - String to pad
 * @param width - Target width
 * @param align - Alignment ('left' or 'right')
 */
export function pad(
  str: string,
  width: number,
  align: "left" | "right" = "left"
): string {
  if (str.length >= width) return str.slice(0, width);
  const padding = " ".repeat(width - str.length);
  return align === "left" ? str + padding : padding + str;
}
