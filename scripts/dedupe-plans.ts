/**
 * Plan Deduplication Script
 *
 * Deduplicates existing plans across all projects using:
 * 1. Body hash matching (same body, different title)
 * 2. 75% similarity threshold
 *
 * Usage:
 *   npx tsx scripts/dedupe-plans.ts --dry-run    # Preview changes
 *   npx tsx scripts/dedupe-plans.ts              # Apply changes
 */

import { promises as fs } from "fs";
import { createHash } from "crypto";
import { join, basename } from "path";
import { homedir } from "os";

// Types
interface PlanEntry {
  id: string;
  title: string;
  filename: string;
  path: string;
  contentHash?: string;
  bodyHash?: string;
  createdAt: string;
  updatedAt: string;
  sessions: string[];
}

interface ProjectIndex {
  version: string;
  updatedAt: string;
  context: unknown[];
  sessions: unknown[];
  plans: PlanEntry[];
  subagents?: unknown[];
}

interface PlanWithContent extends PlanEntry {
  content: string;
  absolutePath: string;
}

interface DuplicateGroup {
  canonical: PlanWithContent;
  duplicates: PlanWithContent[];
}

// Configuration
const MIN_SIMILARITY = 0.75;
const DRY_RUN = process.argv.includes("--dry-run");

// Helper functions
function normalizeContent(content: string): string {
  return content.replace(/\s+/g, " ").toLowerCase().trim();
}

function computeContentHash(content: string): string {
  return createHash("sha256").update(normalizeContent(content)).digest("hex");
}

function extractPlanBody(content: string): string {
  const lines = content.split("\n");
  let foundFirstHeading = false;
  const bodyLines: string[] = [];

  for (const line of lines) {
    if (!foundFirstHeading && line.match(/^#\s+/)) {
      foundFirstHeading = true;
      continue;
    }
    bodyLines.push(line);
  }

  if (!foundFirstHeading) {
    return content.trim();
  }

  return bodyLines.join("\n").trim();
}

function computeBodyHash(content: string): string {
  const body = extractPlanBody(content);
  return createHash("sha256").update(normalizeContent(body)).digest("hex");
}

function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(
    text1
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
  const words2 = new Set(
    text2
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

  if (words1.size === 0 || words2.size === 0) {
    return 0;
  }

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

function getLengthRange(content: string): string {
  const length = content.length;
  if (length <= 500) return "0-500";
  if (length <= 2000) return "501-2000";
  return "2001+";
}

async function readIndex(indexPath: string): Promise<ProjectIndex | null> {
  try {
    const raw = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadPlansWithContent(
  projectPath: string,
  plans: PlanEntry[]
): Promise<PlanWithContent[]> {
  const result: PlanWithContent[] = [];

  for (const plan of plans) {
    const absolutePath = join(projectPath, ".jacques", plan.path);
    try {
      const content = await fs.readFile(absolutePath, "utf-8");
      result.push({ ...plan, content, absolutePath });
    } catch {
      console.log(`    ⚠ Missing file: ${plan.path}`);
    }
  }

  return result;
}

function findDuplicateGroups(plans: PlanWithContent[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const processed = new Set<string>();

  // Sort by createdAt to use oldest as canonical
  const sortedPlans = [...plans].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (let i = 0; i < sortedPlans.length; i++) {
    const plan = sortedPlans[i];
    if (processed.has(plan.id)) continue;

    const contentHash = computeContentHash(plan.content);
    const bodyHash = computeBodyHash(plan.content);
    const lengthRange = getLengthRange(plan.content);

    const duplicates: PlanWithContent[] = [];

    for (let j = i + 1; j < sortedPlans.length; j++) {
      const other = sortedPlans[j];
      if (processed.has(other.id)) continue;

      const otherContentHash = computeContentHash(other.content);
      const otherBodyHash = computeBodyHash(other.content);
      const otherLengthRange = getLengthRange(other.content);

      // Tier 1: Exact content hash match
      if (contentHash === otherContentHash) {
        duplicates.push(other);
        processed.add(other.id);
        continue;
      }

      // Tier 2: Body hash match (same body, different title)
      if (bodyHash === otherBodyHash) {
        duplicates.push(other);
        processed.add(other.id);
        continue;
      }

      // Tier 3: Fuzzy similarity >= 75% within same length range
      if (lengthRange === otherLengthRange) {
        const similarity = calculateSimilarity(plan.content, other.content);
        if (similarity >= MIN_SIMILARITY) {
          duplicates.push(other);
          processed.add(other.id);
        }
      }
    }

    if (duplicates.length > 0) {
      groups.push({ canonical: plan, duplicates });
      processed.add(plan.id);
    }
  }

  return groups;
}

async function processProject(projectPath: string, projectName: string) {
  const indexPath = join(projectPath, ".jacques", "index.json");

  const index = await readIndex(indexPath);
  if (!index || !index.plans || index.plans.length === 0) {
    console.log(`  [${projectName}] No plans found, skipping`);
    return;
  }

  console.log(`  [${projectName}] Found ${index.plans.length} plans`);

  // Load all plans with their content
  const plansWithContent = await loadPlansWithContent(projectPath, index.plans);
  if (plansWithContent.length === 0) {
    console.log(`  [${projectName}] No readable plan files found`);
    return;
  }

  // Find duplicate groups
  const groups = findDuplicateGroups(plansWithContent);

  if (groups.length === 0) {
    console.log(`  [${projectName}] No duplicates found`);

    // Still update bodyHash on all plans if missing
    let updatedCount = 0;
    for (const plan of plansWithContent) {
      const bodyHash = computeBodyHash(plan.content);
      const contentHash = computeContentHash(plan.content);
      const indexPlan = index.plans.find((p) => p.id === plan.id);
      if (indexPlan && (!indexPlan.bodyHash || !indexPlan.contentHash)) {
        indexPlan.bodyHash = bodyHash;
        indexPlan.contentHash = contentHash;
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`  [${projectName}] Backfilling hashes for ${updatedCount} plans`);
      if (!DRY_RUN) {
        index.updatedAt = new Date().toISOString();
        await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
      }
    }

    return;
  }

  console.log(`  [${projectName}] Found ${groups.length} duplicate groups:\n`);

  let totalMerged = 0;
  let totalDeleted = 0;

  for (const group of groups) {
    const { canonical, duplicates } = group;

    console.log(`    Canonical: "${canonical.title}"`);
    console.log(`      ID: ${canonical.id}`);
    console.log(`      Created: ${canonical.createdAt}`);
    console.log(`      Sessions: ${canonical.sessions.length}`);

    for (const dup of duplicates) {
      const similarity = calculateSimilarity(canonical.content, dup.content);
      const sameBody = computeBodyHash(canonical.content) === computeBodyHash(dup.content);

      console.log(`    Duplicate: "${dup.title}"`);
      console.log(`      ID: ${dup.id}`);
      console.log(`      Match: ${sameBody ? "body-hash" : `${(similarity * 100).toFixed(0)}% similar`}`);
      console.log(`      Sessions: ${dup.sessions.length}`);

      // Merge sessions into canonical
      const mergedSessions = [...new Set([...canonical.sessions, ...dup.sessions])];
      canonical.sessions = mergedSessions;
      totalMerged += dup.sessions.length;
      totalDeleted++;
    }

    console.log("");
  }

  if (DRY_RUN) {
    console.log(`  [${projectName}] DRY RUN - Would merge ${totalMerged} sessions, delete ${totalDeleted} duplicate entries`);
    return;
  }

  // Apply changes
  console.log(`  [${projectName}] Applying changes...`);

  // Remove duplicate entries from index
  const duplicateIds = new Set(
    groups.flatMap((g) => g.duplicates.map((d) => d.id))
  );

  // Delete duplicate plan files
  for (const group of groups) {
    for (const dup of group.duplicates) {
      try {
        await fs.unlink(dup.absolutePath);
        console.log(`    Deleted: ${dup.path}`);
      } catch (err) {
        console.log(`    ⚠ Could not delete: ${dup.path}`);
      }
    }
  }

  // Update index
  index.plans = index.plans.filter((p) => !duplicateIds.has(p.id));

  // Update canonical entries with merged sessions and hashes
  for (const group of groups) {
    const indexPlan = index.plans.find((p) => p.id === group.canonical.id);
    if (indexPlan) {
      indexPlan.sessions = group.canonical.sessions;
      indexPlan.contentHash = computeContentHash(group.canonical.content);
      indexPlan.bodyHash = computeBodyHash(group.canonical.content);
      indexPlan.updatedAt = new Date().toISOString();
    }
  }

  // Backfill hashes for non-duplicate plans
  for (const plan of plansWithContent) {
    if (duplicateIds.has(plan.id)) continue;
    const indexPlan = index.plans.find((p) => p.id === plan.id);
    if (indexPlan) {
      if (!indexPlan.contentHash) {
        indexPlan.contentHash = computeContentHash(plan.content);
      }
      if (!indexPlan.bodyHash) {
        indexPlan.bodyHash = computeBodyHash(plan.content);
      }
    }
  }

  index.updatedAt = new Date().toISOString();
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");

  console.log(`  [${projectName}] Merged ${totalMerged} sessions, removed ${totalDeleted} duplicate entries`);
}

async function findProjectsWithJacques(): Promise<string[]> {
  const projects: string[] = [];

  // Scan known locations
  const searchPaths = [
    join(homedir(), "Desktop"),
    join(homedir(), "Projects"),
    join(homedir(), "Code"),
    join(homedir(), "dev"),
  ];

  async function scanDir(dir: string, depth: number = 0) {
    if (depth > 3) return; // Limit depth

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".") && entry.name !== ".jacques") continue;

        const fullPath = join(dir, entry.name);

        if (entry.name === ".jacques") {
          // Check if this directory has an index.json
          try {
            await fs.access(join(fullPath, "index.json"));
            // Parent directory is a project
            projects.push(dir);
          } catch {
            // No index.json
          }
        } else {
          await scanDir(fullPath, depth + 1);
        }
      }
    } catch {
      // Can't read directory
    }
  }

  for (const searchPath of searchPaths) {
    await scanDir(searchPath);
  }

  return projects;
}

async function main() {
  console.log("=== Plan Deduplication ===\n");

  if (DRY_RUN) {
    console.log("Mode: DRY RUN (no changes will be made)\n");
  } else {
    console.log("Mode: APPLY CHANGES\n");
  }

  // Find all projects with .jacques/index.json
  console.log("Scanning for projects...\n");
  const projectPaths = await findProjectsWithJacques();

  if (projectPaths.length === 0) {
    console.log("No projects found with .jacques/index.json");
    return;
  }

  console.log(`Found ${projectPaths.length} projects:\n`);

  for (const projectPath of projectPaths) {
    const projectName = basename(projectPath);
    console.log(`\nProcessing: ${projectName}`);
    console.log(`  Path: ${projectPath}`);

    try {
      await processProject(projectPath, projectName);
    } catch (err) {
      console.log(`  ⚠ Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n=== Deduplication Complete ===");

  if (DRY_RUN) {
    console.log("\nTo apply changes, run without --dry-run flag");
  }
}

main().catch((err) => {
  console.error("Deduplication failed:", err);
  process.exit(1);
});
