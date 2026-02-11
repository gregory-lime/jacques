/**
 * useUsageLimits Hook
 *
 * Fetches Anthropic API usage/subscription limits from the server.
 * Refreshes periodically while the settings view is open.
 */

import { useState, useCallback, useEffect, useRef } from "react";

export interface UsagePeriod {
  label: string;
  used: number;
  total: number;
  percentage: number;
  resetsAt: string;
}

export interface UsageLimits {
  current: UsagePeriod | null;
  weekly: UsagePeriod | null;
}

export interface UseUsageLimitsReturn {
  limits: UsageLimits | null;
  loading: boolean;
  refresh: () => void;
}

const API_BASE = "http://localhost:4243";
const REFRESH_INTERVAL = 30000;

export function useUsageLimits(active: boolean): UseUsageLimitsReturn {
  const [limits, setLimits] = useState<UsageLimits | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUsage = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/usage`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((raw: unknown) => {
        const data = raw as { current?: UsagePeriod; weekly?: UsagePeriod };
        return data;
      })
      .then((data) => {
        setLimits({
          current: data.current || null,
          weekly: data.weekly || null,
        });
        setLoading(false);
      })
      .catch(() => {
        setLimits(null);
        setLoading(false);
      });
  }, []);

  const refresh = useCallback(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Auto-refresh while active
  useEffect(() => {
    if (active) {
      fetchUsage();
      intervalRef.current = setInterval(fetchUsage, REFRESH_INTERVAL);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [active, fetchUsage]);

  return { limits, loading, refresh };
}
