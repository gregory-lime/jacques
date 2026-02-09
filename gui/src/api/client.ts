/**
 * API Client
 *
 * Shared API base URL and SSE streaming helper for all domain modules.
 */

// When served from the same origin, use relative URL
// When in dev mode (Vite), use absolute URL
export const API_URL = import.meta.env.DEV ? 'http://localhost:4243/api' : '/api';

/**
 * Stream SSE events from a POST endpoint.
 * Shared by sync and archive initialization.
 */
export function streamSSE<TProgress, TResult>(
  endpoint: string,
  callbacks: {
    onProgress?: (data: TProgress) => void;
    onComplete?: (data: TResult) => void;
    onError?: (error: string) => void;
  },
  options?: { queryParams?: Record<string, string>; errorPrefix?: string }
): { abort: () => void } {
  let aborted = false;

  const url = new URL(`${API_URL}${endpoint}`, window.location.origin);
  if (options?.queryParams) {
    for (const [key, value] of Object.entries(options.queryParams)) {
      url.searchParams.set(key, value);
    }
  }

  const errorPrefix = options?.errorPrefix ?? 'Request failed';

  fetch(url.toString(), {
    method: 'POST',
  }).then(async (response) => {
    if (!response.ok) {
      callbacks.onError?.(`${errorPrefix}: ${response.statusText}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError?.('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (!aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7);
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (currentEvent === 'progress') {
            callbacks.onProgress?.(data);
          } else if (currentEvent === 'complete') {
            callbacks.onComplete?.(data);
          } else if (currentEvent === 'error') {
            callbacks.onError?.(data.error);
          }
        }
      }
    }
  }).catch((error) => {
    if (!aborted) {
      callbacks.onError?.(error.message);
    }
  });

  return {
    abort: () => {
      aborted = true;
    },
  };
}
