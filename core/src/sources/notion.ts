/**
 * Notion Integration
 *
 * Lists pages from Notion workspace and converts to markdown.
 */

import type { OAuthTokens, NotionPage, FileTreeNode, FlatTreeItem } from "./types.js";
import { getNotionConfig } from "./config.js";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/**
 * Get valid Notion access token
 */
function getValidToken(): string | null {
  const config = getNotionConfig();
  if (!config?.tokens?.access_token) {
    return null;
  }
  // Notion tokens don't expire (no refresh needed for OAuth tokens)
  return config.tokens.access_token;
}

/**
 * Make authenticated request to Notion API
 */
async function notionApiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T | null> {
  const token = getValidToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${NOTION_API}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`Notion API error: ${response.status} ${response.statusText}`);
      return null;
    }

    return response.json() as Promise<T>;
  } catch (error) {
    console.error("Notion API request failed:", error);
    return null;
  }
}

/**
 * Notion API response types
 */
interface NotionSearchResponse {
  results: NotionPageObject[];
  next_cursor: string | null;
  has_more: boolean;
}

interface NotionPageObject {
  id: string;
  object: "page" | "database";
  parent: {
    type: "workspace" | "page_id" | "database_id";
    workspace?: boolean;
    page_id?: string;
    database_id?: string;
  };
  properties: {
    title?: { title: Array<{ plain_text: string }> };
    Name?: { title: Array<{ plain_text: string }> };
  };
  last_edited_time: string;
  icon?: {
    type: "emoji" | "external" | "file";
    emoji?: string;
  };
}

interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

interface NotionBlocksResponse {
  results: NotionBlock[];
  next_cursor: string | null;
  has_more: boolean;
}

/**
 * Extract title from Notion page object
 */
function extractPageTitle(page: NotionPageObject): string {
  // Try "title" property first (for standalone pages)
  if (page.properties.title?.title?.[0]?.plain_text) {
    return page.properties.title.title[0].plain_text;
  }
  // Try "Name" property (common in databases)
  if (page.properties.Name?.title?.[0]?.plain_text) {
    return page.properties.Name.title[0].plain_text;
  }
  return "Untitled";
}

/**
 * Convert Notion page object to our NotionPage type
 */
function convertToNotionPage(page: NotionPageObject): NotionPage {
  let parentType: "workspace" | "page" | "database" = "workspace";
  let parentId: string | undefined;

  if (page.parent.type === "page_id") {
    parentType = "page";
    parentId = page.parent.page_id;
  } else if (page.parent.type === "database_id") {
    parentType = "database";
    parentId = page.parent.database_id;
  }

  return {
    id: page.id,
    title: extractPageTitle(page),
    parent_type: parentType,
    parent_id: parentId,
    last_edited_time: page.last_edited_time,
    icon: page.icon?.emoji,
  };
}

/**
 * Search for pages in Notion workspace
 */
export async function searchNotionPages(
  query?: string,
  startCursor?: string
): Promise<{ pages: NotionPage[]; nextCursor: string | null } | null> {
  const body: Record<string, unknown> = {
    filter: { value: "page", property: "object" },
    page_size: 100,
  };

  if (query) {
    body.query = query;
  }

  if (startCursor) {
    body.start_cursor = startCursor;
  }

  const data = await notionApiRequest<NotionSearchResponse>("/search", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!data) return null;

  const pages = data.results
    .filter((r): r is NotionPageObject => r.object === "page")
    .map(convertToNotionPage);

  return {
    pages,
    nextCursor: data.has_more ? data.next_cursor : null,
  };
}

/**
 * List all pages (up to limit)
 */
export async function listAllNotionPages(
  query?: string,
  maxPages = 500
): Promise<NotionPage[]> {
  const allPages: NotionPage[] = [];
  let cursor: string | null = null;

  do {
    const result = await searchNotionPages(query, cursor ?? undefined);
    if (!result) break;

    allPages.push(...result.pages);
    cursor = result.nextCursor;

    if (allPages.length >= maxPages) break;
  } while (cursor);

  return allPages.slice(0, maxPages);
}

/**
 * Get page blocks (content)
 */
async function getPageBlocks(
  pageId: string,
  startCursor?: string
): Promise<{ blocks: NotionBlock[]; nextCursor: string | null } | null> {
  let url = `/blocks/${pageId}/children?page_size=100`;
  if (startCursor) {
    url += `&start_cursor=${startCursor}`;
  }

  const data = await notionApiRequest<NotionBlocksResponse>(url);
  if (!data) return null;

  return {
    blocks: data.results,
    nextCursor: data.has_more ? data.next_cursor : null,
  };
}

/**
 * Get all blocks for a page
 */
async function getAllPageBlocks(pageId: string): Promise<NotionBlock[]> {
  const allBlocks: NotionBlock[] = [];
  let cursor: string | null = null;

  do {
    const result = await getPageBlocks(pageId, cursor ?? undefined);
    if (!result) break;

    allBlocks.push(...result.blocks);
    cursor = result.nextCursor;
  } while (cursor);

  return allBlocks;
}

/**
 * Extract text from rich text array
 */
function extractRichText(richText: Array<{ plain_text: string }> | undefined): string {
  if (!richText) return "";
  return richText.map(t => t.plain_text).join("");
}

/**
 * Convert a single block to markdown
 */
function blockToMarkdown(block: NotionBlock): string {
  const type = block.type;
  const content = block[type] as Record<string, unknown> | undefined;

  if (!content) return "";

  const richText = content.rich_text as Array<{ plain_text: string }> | undefined;
  const text = extractRichText(richText);

  switch (type) {
    case "paragraph":
      return text ? `${text}\n\n` : "\n";

    case "heading_1":
      return `# ${text}\n\n`;

    case "heading_2":
      return `## ${text}\n\n`;

    case "heading_3":
      return `### ${text}\n\n`;

    case "bulleted_list_item":
      return `- ${text}\n`;

    case "numbered_list_item":
      return `1. ${text}\n`;

    case "to_do": {
      const checked = (content.checked as boolean) ? "x" : " ";
      return `- [${checked}] ${text}\n`;
    }

    case "toggle":
      return `<details><summary>${text}</summary></details>\n\n`;

    case "code": {
      const language = (content.language as string) || "";
      return `\`\`\`${language}\n${text}\n\`\`\`\n\n`;
    }

    case "quote":
      return `> ${text}\n\n`;

    case "callout": {
      const icon = (content.icon as { emoji?: string })?.emoji || "";
      return `> ${icon} ${text}\n\n`;
    }

    case "divider":
      return "---\n\n";

    case "image": {
      const imageContent = content as {
        type: string;
        external?: { url: string };
        file?: { url: string };
        caption?: Array<{ plain_text: string }>;
      };
      const url = imageContent.type === "external"
        ? imageContent.external?.url
        : imageContent.file?.url;
      const caption = extractRichText(imageContent.caption);
      return url ? `![${caption}](${url})\n\n` : "";
    }

    case "bookmark":
    case "link_preview": {
      const urlContent = content as { url?: string };
      return urlContent.url ? `[${urlContent.url}](${urlContent.url})\n\n` : "";
    }

    case "table_of_contents":
      return "[TOC]\n\n";

    default:
      // Unsupported block types are skipped
      return "";
  }
}

/**
 * Convert Notion page content to markdown
 */
export async function getNotionPageContent(pageId: string): Promise<string | null> {
  const blocks = await getAllPageBlocks(pageId);
  if (!blocks) return null;

  let markdown = "";

  for (const block of blocks) {
    markdown += blockToMarkdown(block);
  }

  return markdown.trim();
}

/**
 * Build tree structure from pages
 * Notion pages can be nested (parent/child relationships)
 */
export function buildNotionTree(pages: NotionPage[]): FileTreeNode[] {
  const pageMap = new Map<string, FileTreeNode>();

  // Create nodes for all pages
  for (const page of pages) {
    pageMap.set(page.id, {
      id: page.id,
      name: page.icon ? `${page.icon} ${page.title}` : page.title,
      type: "file", // All Notion pages are treated as files
      depth: 0,
      path: page.id,
      relativePath: page.title,
      modifiedAt: new Date(page.last_edited_time),
    });
  }

  const rootNodes: FileTreeNode[] = [];

  // Build hierarchy based on parent relationships
  for (const page of pages) {
    const node = pageMap.get(page.id)!;

    if (page.parent_type === "page" && page.parent_id && pageMap.has(page.parent_id)) {
      // This page is a child of another page
      const parent = pageMap.get(page.parent_id)!;

      // Convert parent to folder if not already
      if (parent.type === "file") {
        parent.type = "folder";
        parent.children = [];
        parent.fileCount = 0;
      }

      node.depth = parent.depth + 1;
      node.relativePath = `${parent.relativePath}/${page.title}`;
      parent.children!.push(node);
    } else {
      // Root level page
      rootNodes.push(node);
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
export function flattenNotionTree(
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
      result.push(...flattenNotionTree(node.children, expandedFolders, depth + 1));
    }
  }

  return result;
}

/**
 * Get Notion pages tree
 */
export async function getNotionPageTree(query?: string): Promise<FileTreeNode[]> {
  const pages = await listAllNotionPages(query);
  return buildNotionTree(pages);
}
