/**
 * useSessionBadges Hook
 *
 * Fetches and caches session badges for active sessions.
 * Badges are fetched on-demand when sessions are displayed.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSessionBadges, type SessionBadges } from '../api';

interface BadgeCache {
  badges: SessionBadges;
  fetchedAt: number;
}

// Cache TTL: 30 seconds (badges can change as session progresses)
const CACHE_TTL_MS = 30 * 1000;

/**
 * Hook to fetch and cache session badges for multiple sessions.
 *
 * @param sessionIds Array of session IDs to fetch badges for
 * @returns Map of session ID to badges, plus loading/error states
 */
export function useSessionBadges(sessionIds: string[]): {
  badges: Map<string, SessionBadges>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [badges, setBadges] = useState<Map<string, SessionBadges>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache with TTL
  const cacheRef = useRef<Map<string, BadgeCache>>(new Map());

  const fetchBadges = useCallback(async (ids: string[], force = false) => {
    if (ids.length === 0) return;

    const now = Date.now();
    const idsToFetch: string[] = [];
    const cachedBadges = new Map<string, SessionBadges>();

    // Check cache for each ID
    for (const id of ids) {
      const cached = cacheRef.current.get(id);
      if (cached && !force && now - cached.fetchedAt < CACHE_TTL_MS) {
        cachedBadges.set(id, cached.badges);
      } else {
        idsToFetch.push(id);
      }
    }

    // If all are cached, just update state
    if (idsToFetch.length === 0) {
      setBadges(cachedBadges);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch badges in parallel
      const results = await Promise.allSettled(
        idsToFetch.map(async (id) => {
          const result = await getSessionBadges(id);
          return { id, badges: result };
        })
      );

      // Process results
      const newBadges = new Map(cachedBadges);
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { id, badges: badgeData } = result.value;
          newBadges.set(id, badgeData);
          cacheRef.current.set(id, {
            badges: badgeData,
            fetchedAt: now,
          });
        }
        // Silently ignore failures for individual sessions
      }

      setBadges(newBadges);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch badges');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch when session IDs change
  useEffect(() => {
    fetchBadges(sessionIds);
  }, [sessionIds.join(','), fetchBadges]);

  // Refetch function for manual refresh
  const refetch = useCallback(() => {
    fetchBadges(sessionIds, true);
  }, [sessionIds, fetchBadges]);

  return { badges, loading, error, refetch };
}
