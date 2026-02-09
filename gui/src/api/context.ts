/**
 * Context API
 *
 * Project context catalog CRUD (files, notes).
 */

import { API_URL } from './client';
import type { ProjectCatalog, CatalogItem } from '../types';

/**
 * Get full project catalog (context files, plans, sessions)
 */
export async function getProjectCatalog(encodedPath: string): Promise<ProjectCatalog> {
  const response = await fetch(`${API_URL}/projects/${encodeURIComponent(encodedPath)}/catalog`);
  if (!response.ok) {
    throw new Error(`Failed to get catalog: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get context file content
 */
export async function getContextFileContent(encodedPath: string, id: string): Promise<{ content: string }> {
  const response = await fetch(
    `${API_URL}/projects/${encodeURIComponent(encodedPath)}/context/${encodeURIComponent(id)}/content`
  );
  if (!response.ok) {
    throw new Error(`Failed to get context file: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Add a new context note
 */
export async function addContextNote(
  encodedPath: string,
  name: string,
  content: string,
  description?: string,
): Promise<CatalogItem> {
  const response = await fetch(`${API_URL}/projects/${encodeURIComponent(encodedPath)}/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content, description }),
  });
  if (!response.ok) {
    throw new Error(`Failed to add context note: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Update context file content
 */
export async function updateContextContent(encodedPath: string, id: string, content: string): Promise<void> {
  const response = await fetch(
    `${API_URL}/projects/${encodeURIComponent(encodedPath)}/context/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to update context file: ${response.statusText}`);
  }
}

/**
 * Delete a context file
 */
export async function deleteContextFile(encodedPath: string, id: string): Promise<void> {
  const response = await fetch(
    `${API_URL}/projects/${encodeURIComponent(encodedPath)}/context/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    throw new Error(`Failed to delete context file: ${response.statusText}`);
  }
}
