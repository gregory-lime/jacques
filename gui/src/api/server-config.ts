/**
 * Server Configuration API
 *
 * Root catalog path configuration.
 */

import { API_URL } from './client';

export interface RootPathConfig {
  path: string;
  isDefault: boolean;
  exists: boolean;
  defaultPath: string;
  defaultExists: boolean;
}

/**
 * Get the current root catalog path configuration
 */
export async function getRootPath(): Promise<RootPathConfig> {
  const response = await fetch(`${API_URL}/config/root-path`);
  if (!response.ok) {
    throw new Error(`Failed to get root path: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Set the root catalog path
 */
export async function setRootPath(path: string): Promise<void> {
  const response = await fetch(`${API_URL}/config/root-path`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || `Failed to set root path: ${response.statusText}`);
  }
}
