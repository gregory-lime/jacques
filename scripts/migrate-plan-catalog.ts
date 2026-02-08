/**
 * Plan Catalog Migration Script
 *
 * Cleans up and migrates the plan catalog:
 * 1. Reads each project's .jacques/index.json
 * 2. Removes entries pointing to missing files
 * 3. Computes contentHash for all plans (content-based dedup)
 * 4. Merges duplicates (same content hash → merge sessions[])
 * 5. Fixes absolute paths → relative
 * 6. Scans session history for plans not yet in catalog
 * 7. Writes back the cleaned index
 */

import { promises as fs } from "fs";
import { createHash } from "crypto";
import { join, basename } from "path";
import { homedir } from "os";

interface PlanEntry {
  id: string;
  title: string;
  filename: string;
  path: string;
  contentHash?: string;
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
}

function normalizeContent(content: string): string {
  return content.replace(/\s+/g, " ").toLowerCase().trim();
}

function computeHash(content: string): string {
  return createHash("sha256").update(normalizeContent(content)).digest("hex");
}

async function readIndex(indexPath: string): Promise<ProjectIndex | null> {
  try {
    const raw = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function processProject(projectPath: string, projectName: string) {
  const indexPath = join(projectPath, ".jacques", "index.json");
  const plansDir = join(projectPath, ".jacques", "plans");

  const index = await readIndex(indexPath);
  if (!index || !index.plans || index.plans.length === 0) {
    console.log(`  [${projectName}] No plans in index, skipping`);
    return;
  }

  console.log(`  [${projectName}] Found ${index.plans.length} plan entries in index`);

  // Phase 1: Check which plan files actually exist
  const validPlans: Array<PlanEntry & { content: string }> = [];
  const removedEntries: string[] = [];

  for (const plan of index.plans) {
    // Fix path: normalize absolute paths to relative
    let planFilePath: string;
    if (plan.path.startsWith("/")) {
      // Absolute path → derive relative
      plan.path = `plans/${plan.filename}`;
      planFilePath = join(plansDir, plan.filename);
      console.log(`    Fixed absolute path for: ${plan.title}`);
    } else {
      planFilePath = join(projectPath, ".jacques", plan.path);
    }

    try {
      const content = await fs.readFile(planFilePath, "utf-8");
      validPlans.push({ ...plan, content });
    } catch {
      removedEntries.push(plan.title);
    }
  }

  if (removedEntries.length > 0) {
    console.log(`    Removing ${removedEntries.length} entries with missing files:`);
    for (const title of removedEntries) {
      console.log(`      - ${title}`);
    }
  }

  // Phase 2: Deduplicate by content hash
  const hashMap = new Map<string, PlanEntry & { content: string }>();
  let mergedCount = 0;

  for (const plan of validPlans) {
    const hash = computeHash(plan.content);
    const existing = hashMap.get(hash);

    if (existing) {
      // Merge sessions
      const mergedSessions = [...new Set([...existing.sessions, ...plan.sessions])];
      existing.sessions = mergedSessions;
      // Keep the earlier createdAt
      if (new Date(plan.createdAt) < new Date(existing.createdAt)) {
        existing.createdAt = plan.createdAt;
      }
      // Keep the later updatedAt
      if (new Date(plan.updatedAt) > new Date(existing.updatedAt)) {
        existing.updatedAt = plan.updatedAt;
      }
      mergedCount++;
      console.log(`    Merged duplicate: "${plan.title}" (id: ${plan.id}) → merged into ${existing.id}`);
    } else {
      hashMap.set(hash, { ...plan, contentHash: hash });
    }
  }

  if (mergedCount > 0) {
    console.log(`    Merged ${mergedCount} duplicate entries`);
  }

  // Phase 3: Build clean plan list
  const cleanPlans: PlanEntry[] = Array.from(hashMap.values()).map(
    ({ content: _content, ...plan }) => ({
      ...plan,
      // Ensure consistent relative path format
      path: `plans/${plan.filename}`,
    })
  );

  // Sort by updatedAt (newest first)
  cleanPlans.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  // Phase 4: Scan for .md files in plans/ dir not in catalog
  try {
    const files = await fs.readdir(plansDir);
    const catalogedFiles = new Set(cleanPlans.map((p) => p.filename));
    const uncataloged = files.filter(
      (f) => f.endsWith(".md") && !catalogedFiles.has(f)
    );

    if (uncataloged.length > 0) {
      console.log(`    Found ${uncataloged.length} uncataloged .md files in plans/:`);
      for (const filename of uncataloged) {
        try {
          const content = await fs.readFile(join(plansDir, filename), "utf-8");
          const hash = computeHash(content);

          // Check if content already exists under different filename
          if (hashMap.has(hash)) {
            console.log(`      - ${filename} (content already in catalog, skipping)`);
            continue;
          }

          // Extract title from content
          const headingMatch = content.match(/^#\s+(.+)$/m);
          const title = headingMatch
            ? headingMatch[1].trim()
            : filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}_/, "");

          const now = new Date().toISOString();
          const newEntry: PlanEntry = {
            id: filename.replace(".md", ""),
            title,
            filename,
            path: `plans/${filename}`,
            contentHash: hash,
            createdAt: now,
            updatedAt: now,
            sessions: [],
          };
          cleanPlans.push(newEntry);
          console.log(`      + Added: ${filename} → "${title}"`);
        } catch (err) {
          console.log(`      ! Failed to read: ${filename}`);
        }
      }
    }
  } catch {
    // plans dir doesn't exist or can't be read
  }

  // Phase 5: Write back
  const originalCount = index.plans.length;
  index.plans = cleanPlans;
  index.updatedAt = new Date().toISOString();

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
  console.log(
    `    Result: ${originalCount} entries → ${cleanPlans.length} entries (${cleanPlans.filter((p) => p.contentHash).length} with hashes)`
  );
}

async function scanSessionHistory(projectPath: string, projectName: string) {
  /**
   * Scan the session cache for planRefs pointing to content we can catalog.
   * This finds plans from session history that weren't previously extracted.
   */
  const cachePath = join(homedir(), ".jacques", "cache", "sessions-index.json");

  try {
    const raw = await fs.readFile(cachePath, "utf-8");
    const cache = JSON.parse(raw);

    if (!cache.sessions) return;

    // Filter sessions for this project
    const projectSessions = cache.sessions.filter(
      (s: { projectPath: string }) => s.projectPath === projectPath
    );

    let planSessionCount = 0;
    for (const session of projectSessions) {
      if (session.planRefs && session.planRefs.length > 0) {
        planSessionCount++;
      }
    }

    if (planSessionCount > 0) {
      console.log(
        `    [${projectName}] ${planSessionCount} sessions with planRefs in cache`
      );
    }
  } catch {
    // Cache doesn't exist
  }
}

async function main() {
  console.log("=== Plan Catalog Migration ===\n");

  // Find all projects with .jacques/index.json
  const projectPaths = [
    "/Users/gole/Desktop/jacques-context-manager",
    "/Users/gole/Desktop/jacques/context/manager",
    "/Users/gole/Desktop/marriage/story",
  ];

  for (const projectPath of projectPaths) {
    const projectName = basename(projectPath) === "manager"
      ? "jacques/context/manager"
      : basename(projectPath) === "story"
      ? "marriage/story"
      : basename(projectPath);

    console.log(`\nProcessing: ${projectName}`);
    console.log(`  Path: ${projectPath}`);

    await processProject(projectPath, projectName);
    await scanSessionHistory(projectPath, projectName);
  }

  console.log("\n=== Migration Complete ===");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
