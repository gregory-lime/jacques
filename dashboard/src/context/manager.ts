/**
 * Context Manager
 *
 * Manages adding/removing context files to/from .jacques/context/
 */

import { promises as fs } from "fs";
import { join, basename } from "path";
import type { ContextFile, AddContextOptions } from "./types.js";
import { addToIndex } from "./indexer.js";

const JACQUES_DIR = ".jacques";
const CONTEXT_DIR = "context";

/**
 * Parse YAML frontmatter from markdown content.
 * Returns null if no frontmatter found.
 */
function parseFrontmatter(content: string): Record<string, any> | null {
  // Frontmatter must start at the beginning of the file
  if (!content.startsWith("---")) {
    return null;
  }

  // Find the closing ---
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return null;
  }

  const yamlContent = content.substring(4, endIndex).trim();
  if (!yamlContent) {
    return null;
  }

  // Simple YAML parser for common frontmatter patterns
  const result: Record<string, any> = {};
  const lines = yamlContent.split("\n");
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Check for array item (starts with -)
    if (trimmed.startsWith("- ") && currentKey && currentArray) {
      // Remove quotes from array item
      const item = trimmed.substring(2).trim().replace(/^["']|["']$/g, "");
      currentArray.push(item);
      continue;
    }

    // Check for key: value pair
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      // Save previous array if exists
      if (currentKey && currentArray) {
        result[currentKey] = currentArray;
      }

      currentKey = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      if (value) {
        // Inline value - could be array [a, b, c] or string
        if (value.startsWith("[") && value.endsWith("]")) {
          // Inline array: [tag1, tag2, tag3]
          const arrayContent = value.substring(1, value.length - 1);
          result[currentKey] = arrayContent
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter((s) => s.length > 0);
          currentKey = null;
          currentArray = null;
        } else {
          // String value
          result[currentKey] = value.replace(/^["']|["']$/g, "");
          currentKey = null;
          currentArray = null;
        }
      } else {
        // Value on next lines (array)
        currentArray = [];
      }
    }
  }

  // Save final array if exists
  if (currentKey && currentArray) {
    result[currentKey] = currentArray;
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Extract tags from Obsidian file content.
 * Supports both frontmatter tags and inline #tags.
 */
export async function extractTags(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const tags = new Set<string>();

    // Extract from frontmatter
    const frontmatter = parseFrontmatter(content);
    if (frontmatter?.tags) {
      const fmTags = Array.isArray(frontmatter.tags)
        ? frontmatter.tags
        : [frontmatter.tags];
      fmTags.forEach((tag: string) => {
        // Remove # prefix if present
        const cleaned = tag.replace(/^#/, "").trim();
        if (cleaned) tags.add(cleaned);
      });
    }

    // Also check for 'tag' (singular) in frontmatter
    if (frontmatter?.tag) {
      const fmTag = Array.isArray(frontmatter.tag)
        ? frontmatter.tag
        : [frontmatter.tag];
      fmTag.forEach((tag: string) => {
        const cleaned = tag.replace(/^#/, "").trim();
        if (cleaned) tags.add(cleaned);
      });
    }

    return Array.from(tags).sort();
  } catch {
    return [];
  }
}

/**
 * Generate a unique ID for a context file
 * Format: slugified-name-randomhex
 */
export function generateContextId(name: string): string {
  const slug = sanitizeFilename(name).toLowerCase().substring(0, 30);
  const randomSuffix = Math.random().toString(16).substring(2, 8);
  return `${slug}-${randomSuffix}`;
}

/**
 * Sanitize a filename for safe filesystem use
 * - Converts spaces to dashes
 * - Removes special characters
 * - Keeps alphanumeric, dashes, underscores
 */
export function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "-") // spaces to dashes
    .replace(/[^a-zA-Z0-9_-]/g, "") // remove special chars
    .replace(/-+/g, "-") // collapse multiple dashes
    .replace(/^-|-$/g, ""); // trim leading/trailing dashes
}

/**
 * Get the context directory path for a project
 */
export function getContextDir(cwd: string): string {
  return join(cwd, JACQUES_DIR, CONTEXT_DIR);
}

/**
 * Add a context file from an external source
 * Copies the file to .jacques/context/ and updates the index
 */
export async function addContext(
  options: AddContextOptions
): Promise<ContextFile> {
  const { cwd, sourceFile, name, source, description } = options;

  // Ensure context directory exists
  const contextDir = getContextDir(cwd);
  await fs.mkdir(contextDir, { recursive: true });

  // Generate unique ID and destination filename
  const id = generateContextId(name);
  const destFilename = `${sanitizeFilename(name)}.md`;
  const destPath = join(contextDir, destFilename);
  const relativePath = join(JACQUES_DIR, CONTEXT_DIR, destFilename);

  // Extract tags before copying (from source file)
  const tags = await extractTags(sourceFile);

  // Copy the file
  await fs.copyFile(sourceFile, destPath);

  // Get file size
  const stats = await fs.stat(destPath);

  // Create context file entry
  const contextFile: ContextFile = {
    id,
    name,
    path: relativePath,
    source,
    sourceFile,
    addedAt: new Date().toISOString(),
    description,
    sizeBytes: stats.size,
    ...(tags.length > 0 && { tags }),
  };

  // Add to index
  await addToIndex(cwd, contextFile);

  return contextFile;
}

/**
 * Remove a context file by ID
 * Deletes the file from .jacques/context/ and updates the index
 */
export async function removeContext(
  cwd: string,
  contextFile: ContextFile
): Promise<void> {
  // Delete the file
  const filePath = join(cwd, contextFile.path);
  try {
    await fs.unlink(filePath);
  } catch {
    // File may already be deleted
  }

  // Remove from index
  const { removeFromIndex } = await import("./indexer.js");
  await removeFromIndex(cwd, contextFile.id);
}

/**
 * Check if context directory exists and has files
 */
export async function hasContextFiles(cwd: string): Promise<boolean> {
  const contextDir = getContextDir(cwd);
  try {
    const entries = await fs.readdir(contextDir);
    return entries.some((e) => e.endsWith(".md"));
  } catch {
    return false;
  }
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Lazy-load tiktoken to avoid import errors if unavailable
let tiktokenModule: typeof import("@dqbd/tiktoken") | null = null;
let encoder: any = null;

/**
 * Initialize tiktoken encoder (lazy-loaded).
 * Uses cl100k_base encoding which is compatible with Claude models.
 */
async function getEncoder(): Promise<any> {
  if (encoder) return encoder;

  try {
    if (!tiktokenModule) {
      tiktokenModule = await import("@dqbd/tiktoken");
    }
    encoder = tiktokenModule.get_encoding("cl100k_base");
    return encoder;
  } catch {
    return null;
  }
}

/**
 * Estimate tokens from file size (quick estimation).
 * Uses ~4.5 characters per token for English markdown text.
 */
export function estimateTokensFromSize(bytes: number): number {
  return Math.ceil(bytes / 4.5);
}

/**
 * Count tokens in text content using tiktoken.
 * Falls back to character-based estimation if tiktoken unavailable.
 */
export async function countTokens(text: string): Promise<number> {
  if (!text) return 0;

  const enc = await getEncoder();
  if (enc) {
    try {
      const tokens = enc.encode(text);
      return tokens.length;
    } catch {
      // Fall through to estimation
    }
  }

  // Fallback: character-based estimation
  return Math.ceil(text.length / 4.5);
}

/**
 * Count tokens in a file using tiktoken.
 * Falls back to size-based estimation if file read fails.
 */
export async function countFileTokens(filePath: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return countTokens(content);
  } catch {
    // If we can't read the file, estimate from size
    try {
      const stats = await fs.stat(filePath);
      return estimateTokensFromSize(stats.size);
    } catch {
      return 0;
    }
  }
}

/**
 * Format token count as human-readable string.
 * Examples: "523", "1.2k", "45.2k"
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toString();
  }
  return `${(tokens / 1000).toFixed(1)}k`;
}
