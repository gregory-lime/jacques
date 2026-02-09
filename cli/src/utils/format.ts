/**
 * Shared formatting utilities for the CLI TUI.
 * Consolidates formatTokens (was duplicated 5x) and formatElapsedTime (was duplicated 2x).
 */

/**
 * Format a token count with K/M suffix.
 * @param count - Number of tokens
 * @param options.precise - Use one decimal place for K values (e.g., "1.5k" instead of "2k")
 */
export function formatTokens(
  count: number,
  options?: { precise?: boolean },
): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return options?.precise
      ? `${(count / 1_000).toFixed(1)}k`
      : `${Math.round(count / 1_000)}k`;
  }
  return count.toString();
}

/**
 * Format elapsed seconds as "Xs" or "Xm Ys".
 */
export function formatElapsedTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
