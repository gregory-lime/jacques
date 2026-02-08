/**
 * Google Docs Integration
 *
 * Lists files from Google Drive and exports Google Docs to plain text/markdown.
 */

import type { OAuthTokens, GoogleDriveFile, FileTreeNode, FlatTreeItem } from "./types.js";
import { getGoogleDocsConfig, updateGoogleDocsTokens } from "./config.js";

const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Google Docs MIME types
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * Refresh Google access token using refresh token
 */
export async function refreshGoogleToken(): Promise<OAuthTokens | null> {
  const config = getGoogleDocsConfig();
  if (!config?.tokens?.refresh_token || !config.client_id || !config.client_secret) {
    return null;
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.client_id,
        client_secret: config.client_secret,
        refresh_token: config.tokens.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    const newTokens: OAuthTokens = {
      access_token: data.access_token,
      refresh_token: config.tokens.refresh_token, // Keep existing refresh token
      expires_at: Date.now() + (data.expires_in * 1000),
    };

    // Save updated tokens
    updateGoogleDocsTokens(newTokens);
    return newTokens;
  } catch {
    return null;
  }
}

/**
 * Get valid access token, refreshing if needed
 */
async function getValidToken(): Promise<string | null> {
  const config = getGoogleDocsConfig();
  if (!config?.tokens?.access_token) {
    return null;
  }

  // Check if token is expired (with 5 min buffer)
  if (config.tokens.expires_at && config.tokens.expires_at < Date.now() + 300000) {
    const newTokens = await refreshGoogleToken();
    if (newTokens) {
      return newTokens.access_token;
    }
    return null;
  }

  return config.tokens.access_token;
}

/**
 * Make authenticated request to Google API
 */
async function googleApiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T | null> {
  const token = await getValidToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.error(`Google API error: ${response.status} ${response.statusText}`);
      return null;
    }

    return response.json() as Promise<T>;
  } catch (error) {
    console.error("Google API request failed:", error);
    return null;
  }
}

/**
 * List files from Google Drive
 * Returns Google Docs and folders by default
 */
export async function listGoogleDriveFiles(
  folderId?: string,
  pageToken?: string
): Promise<{ files: GoogleDriveFile[]; nextPageToken?: string } | null> {
  // Build query: Google Docs and folders only, not in trash
  let query = "trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.folder')";

  if (folderId) {
    query += ` and '${folderId}' in parents`;
  }

  const params = new URLSearchParams({
    q: query,
    fields: "nextPageToken,files(id,name,mimeType,modifiedTime,parents,size)",
    pageSize: "100",
    orderBy: "folder,name",
  });

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const url = `${GOOGLE_DRIVE_API}/files?${params}`;
  const data = await googleApiRequest<{
    files: GoogleDriveFile[];
    nextPageToken?: string;
  }>(url);

  return data;
}

/**
 * List all files recursively (up to a limit)
 */
export async function listAllGoogleDriveFiles(
  folderId?: string,
  maxFiles = 500
): Promise<GoogleDriveFile[]> {
  const allFiles: GoogleDriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const result = await listGoogleDriveFiles(folderId, pageToken);
    if (!result) break;

    allFiles.push(...result.files);
    pageToken = result.nextPageToken;

    if (allFiles.length >= maxFiles) break;
  } while (pageToken);

  return allFiles.slice(0, maxFiles);
}

/**
 * Export Google Doc to plain text
 */
export async function exportGoogleDoc(docId: string): Promise<string | null> {
  const token = await getValidToken();
  if (!token) {
    return null;
  }

  try {
    // Export as plain text
    const url = `${GOOGLE_DRIVE_API}/files/${docId}/export?mimeType=text/plain`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.error(`Export failed: ${response.status} ${response.statusText}`);
      return null;
    }

    return response.text();
  } catch (error) {
    console.error("Export failed:", error);
    return null;
  }
}

/**
 * Get file metadata
 */
export async function getGoogleDriveFile(fileId: string): Promise<GoogleDriveFile | null> {
  const url = `${GOOGLE_DRIVE_API}/files/${fileId}?fields=id,name,mimeType,modifiedTime,parents,size`;
  return googleApiRequest<GoogleDriveFile>(url);
}

/**
 * Build tree structure from flat file list
 */
export function buildGoogleDocsTree(files: GoogleDriveFile[]): FileTreeNode[] {
  // Separate folders and files
  const folders = files.filter(f => f.mimeType === GOOGLE_FOLDER_MIME);
  const docs = files.filter(f => f.mimeType === GOOGLE_DOC_MIME);

  // Build folder lookup
  const folderMap = new Map<string, FileTreeNode>();

  // Create root nodes for folders
  for (const folder of folders) {
    folderMap.set(folder.id, {
      id: folder.id,
      name: folder.name,
      type: "folder",
      depth: 0,
      path: folder.id,
      relativePath: folder.name,
      children: [],
      fileCount: 0,
    });
  }

  // Build hierarchy
  const rootNodes: FileTreeNode[] = [];

  for (const folder of folders) {
    const node = folderMap.get(folder.id)!;
    const parentId = folder.parents?.[0];

    if (parentId && folderMap.has(parentId)) {
      // Add to parent
      const parent = folderMap.get(parentId)!;
      node.depth = parent.depth + 1;
      node.relativePath = `${parent.relativePath}/${folder.name}`;
      parent.children!.push(node);
    } else {
      // Root level folder
      rootNodes.push(node);
    }
  }

  // Add docs to their parent folders or root
  for (const doc of docs) {
    const parentId = doc.parents?.[0];
    const docNode: FileTreeNode = {
      id: doc.id,
      name: doc.name,
      type: "file",
      depth: 0,
      path: doc.id,
      relativePath: doc.name,
      modifiedAt: new Date(doc.modifiedTime),
    };

    if (parentId && folderMap.has(parentId)) {
      const parent = folderMap.get(parentId)!;
      docNode.depth = parent.depth + 1;
      docNode.relativePath = `${parent.relativePath}/${doc.name}`;
      parent.children!.push(docNode);
    } else {
      rootNodes.push(docNode);
    }
  }

  // Count files and sort
  countFilesRecursive(rootNodes);
  sortTree(rootNodes);

  return rootNodes;
}

/**
 * Count files in each folder recursively
 */
function countFilesRecursive(nodes: FileTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === "file") {
      count++;
    } else if (node.children) {
      node.fileCount = countFilesRecursive(node.children);
      count += node.fileCount;
    }
  }
  return count;
}

/**
 * Sort tree: folders first, then alphabetically
 */
function sortTree(nodes: FileTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  for (const node of nodes) {
    if (node.children) {
      sortTree(node.children);
    }
  }
}

/**
 * Flatten tree into list for rendering, respecting expanded state
 */
export function flattenGoogleDocsTree(
  nodes: FileTreeNode[],
  expandedFolders: Set<string>,
  depth = 0
): FlatTreeItem[] {
  const result: FlatTreeItem[] = [];

  for (const node of nodes) {
    const isExpanded = expandedFolders.has(node.id);

    result.push({
      id: node.id,
      name: node.name,
      type: node.type,
      depth: depth,
      path: node.path,
      relativePath: node.relativePath,
      modifiedAt: node.modifiedAt,
      isExpanded: node.type === "folder" ? isExpanded : undefined,
      fileCount: node.fileCount,
    });

    if (node.type === "folder" && isExpanded && node.children) {
      result.push(...flattenGoogleDocsTree(node.children, expandedFolders, depth + 1));
    }
  }

  return result;
}

/**
 * Get Google Docs file tree
 */
export async function getGoogleDocsFileTree(folderId?: string): Promise<FileTreeNode[]> {
  const files = await listAllGoogleDriveFiles(folderId);
  return buildGoogleDocsTree(files);
}
