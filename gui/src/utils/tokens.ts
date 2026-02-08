/**
 * Token Estimation Utilities
 *
 * Simple client-side token estimation for display purposes.
 * Uses character-based approximation (4 chars ≈ 1 token).
 */

/**
 * Estimate tokens from text content.
 * Uses the approximation that 4 characters ≈ 1 token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // ~4 chars per token is a reasonable approximation for English text
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens from a message content block.
 */
export function estimateContentTokens(content: unknown): number {
  if (!content || typeof content !== 'object') return 0;

  const c = content as Record<string, unknown>;

  switch (c.type) {
    case 'text':
      return estimateTokens(c.text as string || '');

    case 'thinking':
      return estimateTokens(c.text as string || '');

    case 'tool_use': {
      // Tool name + JSON input
      const name = c.name as string || '';
      const input = JSON.stringify(c.input || {});
      return estimateTokens(name) + estimateTokens(input);
    }

    case 'tool_result':
      return estimateTokens(c.content as string || '');

    case 'code':
      return estimateTokens(c.code as string || '');

    default:
      // For unknown types, try to stringify
      try {
        return estimateTokens(JSON.stringify(content));
      } catch {
        return 0;
      }
  }
}

/**
 * Format token count for display.
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return `${tokens}`;
  }
  return `${(tokens / 1000).toFixed(1)}k`;
}

/**
 * Get color based on token count.
 * Returns a semantic color name based on the magnitude.
 */
export function getTokenColor(tokens: number): 'low' | 'medium' | 'high' {
  if (tokens < 500) return 'low';
  if (tokens < 2000) return 'medium';
  return 'high';
}
