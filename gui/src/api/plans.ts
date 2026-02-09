/**
 * Plans API
 *
 * Plan catalog from .jacques/index.json.
 */

import { API_URL } from './client';

/**
 * Plan catalog entry from .jacques/index.json
 */
export interface PlanCatalogEntry {
  id: string;
  title: string;
  filename: string;
  path: string;
  contentHash?: string;
  createdAt: string;
  updatedAt: string;
  sessions: string[];
}

/**
 * Plan content response from catalog
 */
export interface PlanCatalogContent {
  id: string;
  title: string;
  filename: string;
  contentHash?: string;
  sessions: string[];
  createdAt: string;
  updatedAt: string;
  content: string;
}

/**
 * Get plan catalog for a project (deduplicated plans from .jacques/index.json)
 */
export async function getProjectPlanCatalog(encodedPath: string): Promise<{
  plans: PlanCatalogEntry[];
}> {
  const response = await fetch(`${API_URL}/projects/${encodeURIComponent(encodedPath)}/plans`);
  if (!response.ok) {
    throw new Error(`Failed to get project plans: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get a plan's content from the catalog
 */
export async function getPlanCatalogContent(
  encodedPath: string,
  planId: string
): Promise<PlanCatalogContent> {
  const response = await fetch(
    `${API_URL}/projects/${encodeURIComponent(encodedPath)}/plans/${encodeURIComponent(planId)}/content`
  );
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Plan not found');
    }
    throw new Error(`Failed to get plan content: ${response.statusText}`);
  }
  return response.json();
}
