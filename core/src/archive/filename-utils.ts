/**
 * Filename Utilities
 *
 * Shared functions for generating plan filenames and handling
 * versioned file naming to avoid collisions.
 *
 * Consolidated from plan-extractor.ts, plan-cataloger.ts,
 * archive-store.ts, and catalog/extractor.ts.
 */

import { promises as fs } from "fs";
import { join, basename } from "path";

/**
 * Slugify a string for use in filenames.
 * Converts to lowercase, replaces non-alphanumeric chars with dashes,
 * trims leading/trailing dashes, and truncates.
 */
export function slugify(text: string, maxLength: number = 40): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, maxLength)
    .replace(/-+$/, ""); // Clean trailing dash from truncation
}

/**
 * Generate a filename for a plan from a title string.
 * Format: YYYY-MM-DD_title-slug.md
 */
export function generatePlanFilename(
  title: string,
  options?: { slugMaxLength?: number; date?: Date }
): string {
  const dateStr = (options?.date ?? new Date()).toISOString().split("T")[0];
  const slug = slugify(title, options?.slugMaxLength ?? 50);
  return `${dateStr}_${slug}.md`;
}

/**
 * Generate a filename for archiving a plan file.
 * Tries to extract title from content's first # heading,
 * falls back to the original filename (basename without extension).
 * Format: YYYY-MM-DD_title-slug.md
 */
export function generateArchivePlanFilename(
  planPath: string,
  options: { content?: string; createdAt?: Date } = {}
): string {
  let title: string | null = null;
  if (options.content) {
    const titleMatch = options.content.match(/^#\s+(.+)$/m);
    title = titleMatch ? titleMatch[1].trim() : null;
  }
  if (!title) {
    title = basename(planPath, ".md");
  }
  return generatePlanFilename(title, {
    slugMaxLength: 40,
    date: options.createdAt,
  });
}

/**
 * Generate a versioned filename to avoid collisions.
 * If the base filename exists, appends -v2, -v3, etc.
 */
export async function generateVersionedFilename(
  basePath: string,
  filename: string
): Promise<string> {
  const ext = ".md";
  const nameWithoutExt = filename.replace(ext, "");

  let version = 2;
  let versionedFilename = filename;
  let versionedPath = join(basePath, versionedFilename);

  while (true) {
    try {
      await fs.access(versionedPath);
      // File exists, try next version
      versionedFilename = `${nameWithoutExt}-v${version}${ext}`;
      versionedPath = join(basePath, versionedFilename);
      version++;
    } catch {
      // File doesn't exist, we can use this version
      return versionedFilename;
    }
  }
}
