/**
 * Handoffs API
 *
 * Session handoff listing and content retrieval.
 */

import { API_URL } from './client';

/**
 * Handoff entry from the catalog
 */
export interface HandoffEntry {
  filename: string;
  timestamp: string;
  path: string;
  tokenEstimate: number;
}

/**
 * Handoff content response
 */
export interface HandoffContent {
  filename: string;
  timestamp: string;
  tokenEstimate: number;
  content: string;
}

/**
 * List all handoffs for a project
 */
export async function getProjectHandoffs(encodedPath: string): Promise<{
  directory: string;
  handoffs: HandoffEntry[];
}> {
  const response = await fetch(`${API_URL}/projects/${encodeURIComponent(encodedPath)}/handoffs`);
  if (!response.ok) {
    throw new Error(`Failed to list handoffs: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get handoff content
 */
export async function getHandoffContent(
  encodedPath: string,
  filename: string
): Promise<HandoffContent> {
  const response = await fetch(
    `${API_URL}/projects/${encodeURIComponent(encodedPath)}/handoffs/${encodeURIComponent(filename)}/content`
  );
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Handoff not found');
    }
    throw new Error(`Failed to get handoff content: ${response.statusText}`);
  }
  return response.json();
}
