/**
 * useCatalog - Fetches and manages the project context catalog
 *
 * Fetches catalog on mount + project change. Supports manual refresh
 * and auto-refresh via WS catalog_updated events (wired by parent).
 */

import { useState, useEffect, useCallback } from 'react';
import { getProjectCatalog } from '../api';
import type { ProjectCatalog } from '../types';

export interface UseCatalogReturn {
  catalog: ProjectCatalog | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useCatalog(encodedPath: string | null): UseCatalogReturn {
  const [catalog, setCatalog] = useState<ProjectCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    if (!encodedPath) {
      setCatalog(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getProjectCatalog(encodedPath);
      setCatalog(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, [encodedPath]);

  // Fetch on mount and when project changes
  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  return {
    catalog,
    loading,
    error,
    refresh: fetchCatalog,
  };
}
