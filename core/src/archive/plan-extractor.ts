/**
 * Plan Extractor
 *
 * Detects and extracts embedded plans from user messages in sessions.
 * Plans are often embedded when starting from plan mode with "Implement the following plan:".
 */

import { promises as fs } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import type { ParsedEntry } from "../session/parser.js";
import type { PlanReference } from "./types.js";
import type { PlanEntry } from "../context/types.js";
import { readProjectIndex, addPlanToIndex } from "../context/indexer.js";
import { generatePlanFilename, generateVersionedFilename } from "./filename-utils.js";
import { extractKeywords } from "../plan/plan-parser.js";

/** Patterns that indicate an embedded plan */
export const PLAN_TRIGGER_PATTERNS = [
  /^implement the following plan[:\s]*/i,
  /^here is the plan[:\s]*/i,
  /^follow this plan[:\s]*/i,
];

/** Minimum content length after trigger phrase to be considered a valid plan */
const MIN_PLAN_LENGTH = 100;

/** Minimum similarity score (0-1) for fuzzy deduplication */
const MIN_SIMILARITY = 0.75;

/**
 * Detected plan with metadata
 */
export interface DetectedPlan {
  planContent: string;
  messageIndex: number;
  planIndex: number;
  triggeredBy: string;
}

/**
 * Plan fingerprint for deduplication
 */
export interface PlanFingerprint {
  contentHash: string;
  bodyHash: string;
  titleNormalized: string;
  lengthRange: string;
}

/**
 * Detect embedded plans in session entries.
 * Checks all user messages for plan trigger patterns.
 */
export function detectEmbeddedPlans(entries: ParsedEntry[]): DetectedPlan[] {
  const detected: DetectedPlan[] = [];

  entries.forEach((entry, messageIndex) => {
    if (entry.type === "user_message" && entry.content.text) {
      const text = entry.content.text.trim();

      // Check for trigger patterns
      for (const pattern of PLAN_TRIGGER_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          // Extract content after trigger phrase
          const planContent = text.substring(match[0].length).trim();

          // Validate plan content
          if (planContent.length < MIN_PLAN_LENGTH) {
            continue;
          }

          // Check for markdown heading (basic structure check)
          if (!planContent.includes("#")) {
            continue;
          }

          // Check if this message contains multiple plans
          const plans = splitMultiplePlans(planContent);

          plans.forEach((content, planIndex) => {
            detected.push({
              planContent: content,
              messageIndex,
              planIndex,
              triggeredBy: match[0].trim(),
            });
          });

          // Only match first trigger pattern per message
          break;
        }
      }
    }
  });

  return detected;
}

/**
 * Split content that contains multiple plans by top-level headings.
 */
export function splitMultiplePlans(content: string): string[] {
  const plans: string[] = [];
  const lines = content.split("\n");

  let currentPlan: string[] = [];
  let foundFirstHeading = false;

  for (const line of lines) {
    // Check if this is a top-level heading
    if (line.match(/^#\s+/)) {
      // If we already have a plan, save it
      if (foundFirstHeading && currentPlan.length > 0) {
        plans.push(currentPlan.join("\n").trim());
        currentPlan = [];
      }
      foundFirstHeading = true;
    }

    if (foundFirstHeading) {
      currentPlan.push(line);
    }
  }

  // Save the last plan
  if (currentPlan.length > 0) {
    plans.push(currentPlan.join("\n").trim());
  }

  // If no headings found, treat entire content as one plan
  if (plans.length === 0 && content.trim().length > 0) {
    return [content.trim()];
  }

  return plans;
}

/**
 * Extract title from plan content.
 * Prefers first markdown heading, falls back to first line.
 */
export function extractPlanTitle(content: string): string {
  // Try to find first markdown heading
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    // Strip "Plan:" prefix if present — titles should be just the name
    return headingMatch[1].trim().replace(/^Plan:\s*/i, "");
  }

  // Fallback: use first line
  const firstLine = content.split("\n")[0].trim();
  if (firstLine.length <= 80) {
    return firstLine;
  }

  // Truncate if too long
  return firstLine.substring(0, 77) + "...";
}

/**
 * Extract plan body (content without the title heading).
 * Strips the first markdown heading line and returns the rest.
 */
export function extractPlanBody(content: string): string {
  const lines = content.split("\n");
  let foundFirstHeading = false;
  const bodyLines: string[] = [];

  for (const line of lines) {
    // Skip the first heading line
    if (!foundFirstHeading && line.match(/^#\s+/)) {
      foundFirstHeading = true;
      continue;
    }
    bodyLines.push(line);
  }

  // If no heading found, return entire content
  if (!foundFirstHeading) {
    return content.trim();
  }

  return bodyLines.join("\n").trim();
}

/**
 * Generate a hash of the plan body only (excludes title).
 * Used for detecting duplicates with different titles but same content.
 */
export function generateBodyHash(content: string): string {
  const body = extractPlanBody(content);
  const normalized = body
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Generate a plan fingerprint for deduplication.
 * Normalizes content to ignore whitespace differences.
 */
export function generatePlanFingerprint(content: string): PlanFingerprint {
  // Normalize content: remove extra whitespace, lowercase
  const normalized = content
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

  // Generate full content hash
  const contentHash = createHash("sha256")
    .update(normalized)
    .digest("hex");

  // Generate body-only hash (for cross-title dedup)
  const bodyHash = generateBodyHash(content);

  // Extract and normalize title
  const title = extractPlanTitle(content);
  const titleNormalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Calculate length range bucket
  const length = content.length;
  let lengthRange: string;
  if (length <= 500) {
    lengthRange = "0-500";
  } else if (length <= 2000) {
    lengthRange = "501-2000";
  } else {
    lengthRange = "2001+";
  }

  return {
    contentHash,
    bodyHash,
    titleNormalized,
    lengthRange,
  };
}

/**
 * Calculate text similarity using simple word overlap (Jaccard similarity).
 * Returns a score between 0 (no overlap) and 1 (identical).
 */
export function calculateSimilarity(text1: string, text2: string): number {
  const words1 = extractKeywords(text1);
  const words2 = extractKeywords(text2);

  if (words1.size === 0 || words2.size === 0) {
    return 0;
  }

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Find a duplicate plan in the existing catalog.
 * Uses a two-tier approach:
 * 1. Exact contentHash match (full content identical)
 * 2. Exact bodyHash match (same body, different title)
 * 3. Fuzzy similarity >= 75% within same length range (no title gate)
 *
 * Returns the PlanEntry if found, null otherwise.
 */
export async function findDuplicatePlan(
  content: string,
  projectPath: string
): Promise<PlanEntry | null> {
  const fingerprint = generatePlanFingerprint(content);
  const index = await readProjectIndex(projectPath);

  // First pass: check indexed hashes (fast path)
  for (const planEntry of index.plans) {
    // Tier 1: Exact content hash match from index
    if (planEntry.contentHash === fingerprint.contentHash) {
      return planEntry;
    }

    // Tier 2: Body hash match from index (same body, different title)
    if (planEntry.bodyHash === fingerprint.bodyHash) {
      return planEntry;
    }
  }

  // Second pass: read files and check computed hashes + similarity
  for (const planEntry of index.plans) {
    try {
      // Read the plan file - construct absolute path from relative path in index
      const absolutePath = join(projectPath, ".jacques", planEntry.path);
      const planContent = await fs.readFile(absolutePath, "utf-8");
      const existingFingerprint = generatePlanFingerprint(planContent);

      // Tier 1: Exact content hash match (computed)
      if (fingerprint.contentHash === existingFingerprint.contentHash) {
        return planEntry;
      }

      // Tier 2: Body hash match (computed) - catches different titles, same body
      if (fingerprint.bodyHash === existingFingerprint.bodyHash) {
        return planEntry;
      }

      // Tier 3: Fuzzy similarity within same length range (no title gate!)
      if (fingerprint.lengthRange === existingFingerprint.lengthRange) {
        const similarity = calculateSimilarity(content, planContent);
        if (similarity >= MIN_SIMILARITY) {
          return planEntry;
        }
      }
    } catch (error) {
      // Plan file not found or unreadable, skip
      continue;
    }
  }

  return null;
}

/**
 * Index an embedded plan in the project index.
 * Creates or updates the PlanEntry with session link.
 */
export async function indexEmbeddedPlan(
  content: string,
  filename: string,
  sessionId: string,
  projectPath: string
): Promise<PlanEntry> {
  const plansDir = join(projectPath, ".jacques", "plans");
  await fs.mkdir(plansDir, { recursive: true });

  const planPath = join(plansDir, filename);
  const title = extractPlanTitle(content);
  const now = new Date().toISOString();

  // Check if plan already exists in index
  const index = await readProjectIndex(projectPath);
  const existingPlan = index.plans.find((p) => p.filename === filename);

  if (existingPlan) {
    // Update existing plan: merge session IDs
    const updatedPlan: PlanEntry = {
      ...existingPlan,
      updatedAt: now,
      sessions: [...new Set([...existingPlan.sessions, sessionId])],
    };

    // For existing plans, we're just updating sessions array - no file write needed
    await addPlanToIndex(projectPath, updatedPlan);
    return updatedPlan;
  } else {
    // Create new plan entry
    const planEntry: PlanEntry = {
      id: filename.replace(".md", ""),
      title,
      filename,
      path: `plans/${filename}`, // Relative path (consistent with Write tool plans)
      createdAt: now,
      updatedAt: now,
      sessions: [sessionId],
    };

    // Write file FIRST - this can fail
    try {
      await fs.writeFile(planPath, content, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to write plan file to ${planPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // THEN update index - only if file write succeeded
    await addPlanToIndex(projectPath, planEntry);
    return planEntry;
  }
}

/**
 * Extract embedded plans from session entries and save to project.
 * Returns array of PlanReference objects for the manifest.
 */
export async function extractEmbeddedPlans(
  entries: ParsedEntry[],
  projectPath: string,
  sessionId: string
): Promise<PlanReference[]> {
  const detected = detectEmbeddedPlans(entries);

  if (detected.length === 0) {
    return [];
  }

  const references: PlanReference[] = [];
  const seenHashes = new Set<string>();

  for (const { planContent } of detected) {
    try {
      // Check for duplicates within this session
      const fingerprint = generatePlanFingerprint(planContent);
      if (seenHashes.has(fingerprint.contentHash)) {
        continue; // Skip duplicate within same session
      }
      seenHashes.add(fingerprint.contentHash);

      // Check for duplicate in existing catalog
      const duplicate = await findDuplicatePlan(planContent, projectPath);

      let planEntry: PlanEntry;
      let filename: string;

      if (duplicate) {
        // Reuse existing plan, add session link
        planEntry = await indexEmbeddedPlan(
          planContent,
          duplicate.filename,
          sessionId,
          projectPath
        );
        filename = duplicate.filename;
      } else {
        // Create new plan
        const title = extractPlanTitle(planContent);
        filename = generatePlanFilename(title);

        // Check for filename collision
        const plansDir = join(projectPath, ".jacques", "plans");
        const planPath = join(plansDir, filename);

        try {
          await fs.access(planPath);
          // File exists with different content, create versioned filename
          filename = await generateVersionedFilename(plansDir, filename);
        } catch {
          // File doesn't exist, we can use this filename
        }

        planEntry = await indexEmbeddedPlan(
          planContent,
          filename,
          sessionId,
          projectPath
        );
      }

      // Create reference for manifest
      // Note: path must be absolute for actual file access, even though index stores relative path
      const absolutePath = join(projectPath, ".jacques", "plans", filename);
      references.push({
        path: absolutePath,
        name: filename,
        archivedPath: `plans/${filename}`,
        source: "embedded",
      });
    } catch (error) {
      // Non-blocking: log and continue with detailed error info
      console.error("Failed to extract embedded plan:", {
        error: error instanceof Error ? error.message : String(error),
        planContent: planContent.substring(0, 100) + "...",
        projectPath,
        sessionId,
      });
    }
  }

  return references;
}
