/**
 * Handoff Catalog
 *
 * Lists and reads handoff files from .jacques/handoffs/
 */

import { promises as fs } from "fs";
import { join } from "path";
import type { HandoffEntry, HandoffCatalog } from "./types.js";

/**
 * Get the handoffs directory path for a project
 */
export function getHandoffsDir(projectDir: string): string {
  return join(projectDir, ".jacques", "handoffs");
}

/**
 * Ensure the handoffs directory exists
 */
export async function ensureHandoffsDir(projectDir: string): Promise<string> {
  const dir = getHandoffsDir(projectDir);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Parse timestamp from handoff filename
 * Format: 2026-01-31T14-30-00-handoff.md
 */
export function parseTimestampFromFilename(filename: string): Date {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  if (match) {
    const [, date, hour, min, sec] = match;
    return new Date(`${date}T${hour}:${min}:${sec}`);
  }
  return new Date();
}

/**
 * Generate a handoff filename with current timestamp
 */
export function generateHandoffFilename(): string {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/:/g, "-")  // Replace colons with dashes
    .replace(/\.\d{3}Z$/, "");  // Remove milliseconds and Z
  return `${timestamp}-handoff.md`;
}

/**
 * Format a Date object for display
 */
export function formatHandoffDate(date: Date): string {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Estimate token count from content length
 * Uses ~4.5 characters per token average
 */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4.5);
}

/**
 * Format token count for display (e.g., "2.1k")
 */
export function formatTokenEstimate(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}

/**
 * List all handoffs in a project directory
 * Returns entries sorted by timestamp (newest first)
 */
export async function listHandoffs(projectDir: string): Promise<HandoffCatalog> {
  const directory = getHandoffsDir(projectDir);

  try {
    const files = await fs.readdir(directory);
    const mdFiles = files.filter(f => f.endsWith("-handoff.md"));

    const entries = await Promise.all(
      mdFiles.map(async (filename): Promise<HandoffEntry> => {
        const path = join(directory, filename);
        const content = await fs.readFile(path, "utf-8");
        const timestamp = parseTimestampFromFilename(filename);
        const tokenEstimate = estimateTokens(content);

        return { filename, timestamp, path, tokenEstimate };
      })
    );

    // Sort by timestamp, newest first
    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return { directory, entries };
  } catch (error) {
    // Directory doesn't exist or is empty
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { directory, entries: [] };
    }
    throw error;
  }
}

/**
 * Get the content of a specific handoff file
 */
export async function getHandoffContent(path: string): Promise<string> {
  return fs.readFile(path, "utf-8");
}

/**
 * Check if any handoffs exist for a project
 */
export async function hasHandoffs(projectDir: string): Promise<boolean> {
  const catalog = await listHandoffs(projectDir);
  return catalog.entries.length > 0;
}

/**
 * Get the most recent handoff for a project
 */
export async function getLatestHandoff(projectDir: string): Promise<HandoffEntry | null> {
  const catalog = await listHandoffs(projectDir);
  return catalog.entries[0] || null;
}
