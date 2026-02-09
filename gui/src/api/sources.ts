/**
 * Sources API
 *
 * External source configuration (Google Docs, Notion).
 */

import { API_URL } from './client';

export interface SourceStatus {
  connected: boolean;
  detail?: string;
}

export interface SourcesStatus {
  obsidian: SourceStatus;
  googleDocs: SourceStatus;
  notion: SourceStatus;
}

export interface GoogleDocsConfig {
  client_id: string;
  client_secret: string;
  tokens: {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
  };
  connected_email?: string;
}

export interface NotionConfig {
  client_id: string;
  client_secret: string;
  tokens: {
    access_token: string;
  };
  workspace_id?: string;
  workspace_name?: string;
}

/**
 * Get the status of all configured sources
 */
export async function getSourcesStatus(): Promise<SourcesStatus> {
  const response = await fetch(`${API_URL}/sources/status`);
  if (!response.ok) {
    throw new Error(`Failed to get sources status: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Configure Google Docs with OAuth tokens
 */
export async function configureGoogleDocs(config: GoogleDocsConfig): Promise<void> {
  const response = await fetch(`${API_URL}/sources/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || `Failed to configure Google Docs: ${response.statusText}`);
  }
}

/**
 * Disconnect Google Docs
 */
export async function disconnectGoogleDocs(): Promise<void> {
  const response = await fetch(`${API_URL}/sources/google`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || `Failed to disconnect Google Docs: ${response.statusText}`);
  }
}

/**
 * Configure Notion with OAuth tokens
 */
export async function configureNotion(config: NotionConfig): Promise<void> {
  const response = await fetch(`${API_URL}/sources/notion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || `Failed to configure Notion: ${response.statusText}`);
  }
}

/**
 * Disconnect Notion
 */
export async function disconnectNotion(): Promise<void> {
  const response = await fetch(`${API_URL}/sources/notion`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || `Failed to disconnect Notion: ${response.statusText}`);
  }
}
