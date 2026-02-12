/**
 * Catalog Extractor
 *
 * Extracts lightweight artifacts from JSONL session files into per-project
 * .jacques/ directories for fast dashboard loading.
 *
 * Three artifact types:
 * 1. Session manifests → .jacques/sessions/{id}.json
 * 2. Explore results → .jacques/subagents/explore_{id}_{slug}.md
 * 3. Web search results → .jacques/subagents/search_{hash}_{slug}.md
 *
 * Plans are delegated to the existing plan-cataloger.
 */

import { promises as fs } from "fs";
import { join, basename } from "path";
import { createHash } from "crypto";
import { parseJSONL, getEntryStatistics } from "../session/parser.js";
import type { ParsedEntry } from "../session/parser.js";
import { listSubagentFiles } from "../session/detector.js";
import type { SubagentFile } from "../session/detector.js";
import { extractManifestFromEntries } from "../archive/manifest-extractor.js";
import { detectModeAndPlans } from "../cache/index.js";
import { catalogPlan } from "../archive/plan-cataloger.js";
import { PLAN_TRIGGER_PATTERNS, extractPlanTitle } from "../archive/plan-extractor.js";
import { slugify } from "../archive/filename-utils.js";
import { detectGitInfo, readGitBranchFromJsonl } from "../cache/git-utils.js";
import {
  readProjectIndex,
  addSubagentToIndex,
  addSessionToIndex,
} from "../context/indexer.js";
import type { SubagentEntry, SessionEntry as IndexSessionEntry } from "../context/types.js";
import type {
  SessionManifest,
  ExtractSessionOptions,
  ExtractSessionResult,
} from "./types.js";

const JACQUES_DIR = ".jacques";
const SESSIONS_DIR = "sessions";
const SUBAGENTS_DIR = "subagents";

/**
 * Generate a short hash from text.
 */
function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").substring(0, 8);
}

/**
 * Extract the final assistant response text from a subagent JSONL file.
 * Returns the last substantial assistant message as markdown.
 */
export async function extractExploreResult(
  subagentFile: SubagentFile,
  description: string,
  sessionId: string,
  timestamp: string
): Promise<{ markdown: string; entry: SubagentEntry } | null> {
  let entries: ParsedEntry[];
  try {
    entries = await parseJSONL(subagentFile.filePath);
  } catch {
    return null;
  }

  if (entries.length === 0) {
    return null;
  }

  // Find the last assistant message with text content
  let lastAssistantText: string | null = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "assistant_message" && entry.content.text && entry.content.text.length > 0) {
      lastAssistantText = entry.content.text;
      break;
    }
  }

  if (!lastAssistantText) {
    return null;
  }

  // Compute token cost
  const stats = getEntryStatistics(entries);
  const inputCost = stats.lastInputTokens + stats.lastCacheRead;
  const outputCost = stats.totalOutputTokensEstimated;
  const tokenCost = inputCost + outputCost;

  const slug = slugify(description);
  const filename = `explore_${subagentFile.agentId}_${slug}.md`;

  // Build markdown with metadata header
  const markdown = [
    `# Explore: ${description}`,
    "",
    `> Session: \`${sessionId}\``,
    `> Date: ${new Date(timestamp).toISOString().split("T")[0]}`,
    `> Tokens: ~${tokenCost.toLocaleString()}`,
    "",
    "---",
    "",
    lastAssistantText,
  ].join("\n");

  const entry: SubagentEntry = {
    id: subagentFile.agentId,
    sessionId,
    type: "exploration",
    title: description,
    filename,
    path: `subagents/${filename}`,
    timestamp,
    tokenCost: tokenCost > 0 ? tokenCost : undefined,
    extractedAt: new Date().toISOString(),
  };

  return { markdown, entry };
}

/**
 * Extract web search results from parsed entries.
 * Returns markdown files combining query + URLs + assistant synthesis.
 */
export function extractSearchResults(
  entries: ParsedEntry[],
  sessionId: string
): Array<{ markdown: string; entry: SubagentEntry }> {
  const results: Array<{ markdown: string; entry: SubagentEntry }> = [];
  const seenQueries = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== "web_search" || entry.content.searchType !== "results") {
      continue;
    }

    const query = entry.content.searchQuery;
    if (!query || seenQueries.has(query)) {
      continue;
    }
    seenQueries.add(query);

    const resultCount = entry.content.searchResultCount || 0;
    const urls = entry.content.searchUrls || [];

    // Find the next substantial assistant response
    let synthesis = "";
    for (let j = i + 1; j < entries.length; j++) {
      const next = entries[j];
      if (next.type === "assistant_message" && next.content.text && next.content.text.length >= 200) {
        synthesis = next.content.text;
        break;
      }
      if (next.type === "user_message" || (next.type === "web_search" && next.content.searchType === "results")) {
        break;
      }
    }

    const slug = slugify(query);
    const date = new Date(entry.timestamp).toISOString().split("T")[0];
    const id = `search_${shortHash(query + entry.timestamp)}`;
    const filename = `search_${id}_${slug}.md`;

    // Build markdown
    const urlSection = urls.length > 0
      ? urls.map((u) => `- [${u.title}](${u.url})`).join("\n")
      : "_No URLs captured_";

    const markdown = [
      `# Search: ${query}`,
      "",
      `> Session: \`${sessionId}\``,
      `> Date: ${date}`,
      `> Results: ${resultCount}`,
      "",
      "## Sources",
      "",
      urlSection,
      "",
      "---",
      "",
      synthesis || "_No synthesis captured_",
    ].join("\n");

    const subagentEntry: SubagentEntry = {
      id,
      sessionId,
      type: "search",
      title: query,
      filename,
      path: `subagents/${filename}`,
      timestamp: entry.timestamp,
      resultCount: resultCount > 0 ? resultCount : undefined,
      extractedAt: new Date().toISOString(),
    };

    results.push({ markdown, entry: subagentEntry });
  }

  return results;
}

/**
 * Create a session manifest from parsed entries.
 *
 * @param deduplicatedPlanRefs - Pre-deduplicated plan refs from extractSessionCatalog().
 *   If provided, these are used directly instead of detecting from entries.
 */
export async function createSessionManifest(
  entries: ParsedEntry[],
  jsonlPath: string,
  projectPath: string,
  jsonlMtime: string,
  planIds: string[],
  subagentIds: string[],
  deduplicatedPlanRefs?: SessionManifest["planRefs"]
): Promise<SessionManifest> {
  const sessionId = basename(jsonlPath, ".jsonl");

  // Reuse manifest extractor for shared logic
  const manifest = await extractManifestFromEntries(entries, projectPath, jsonlPath);

  // Detect mode (always needed) and plan references (only if not provided)
  const { mode, planRefs: detectedPlanRefs } = detectModeAndPlans(entries);
  const planRefs = deduplicatedPlanRefs ?? (detectedPlanRefs.length > 0 ? detectedPlanRefs : undefined);

  // Get token stats
  const stats = getEntryStatistics(entries);
  const totalInput = stats.lastInputTokens + stats.lastCacheRead;
  const totalOutput = stats.totalOutputTokensEstimated;
  const hasTokens = totalInput > 0 || totalOutput > 0;

  // Detect git info for persistence (survives index rebuilds after worktree deletion)
  const gitInfo = await detectGitInfo(projectPath);
  if (!gitInfo.branch) {
    gitInfo.branch = await readGitBranchFromJsonl(jsonlPath) || undefined;
  }

  // Check for subagents
  const subagentFiles = await listSubagentFiles(jsonlPath);
  const userVisibleSubagents = subagentFiles.filter(
    (f) =>
      !f.agentId.startsWith("aprompt_suggestion-") &&
      !f.agentId.startsWith("acompact-")
  );
  const autoCompactFile = subagentFiles.find((f) =>
    f.agentId.startsWith("acompact-")
  );

  return {
    id: sessionId,
    title: manifest.title,
    projectPath: manifest.projectPath,
    projectSlug: manifest.projectSlug,
    gitRepoRoot: gitInfo.repoRoot || undefined,
    gitBranch: gitInfo.branch || undefined,
    gitWorktree: gitInfo.worktree || undefined,
    startedAt: manifest.startedAt,
    endedAt: manifest.endedAt,
    durationMinutes: manifest.durationMinutes,
    userQuestions: manifest.userQuestions,
    filesModified: manifest.filesModified,
    toolsUsed: manifest.toolsUsed,
    technologies: manifest.technologies,
    messageCount: manifest.messageCount,
    toolCallCount: manifest.toolCallCount,
    tokens: hasTokens
      ? {
          input: totalInput,
          output: totalOutput,
          cacheCreation: stats.lastCacheCreation,
          cacheRead: stats.lastCacheRead,
        }
      : undefined,
    hasSubagents: userVisibleSubagents.length > 0,
    hadAutoCompact: autoCompactFile ? true : undefined,
    mode: mode || undefined,
    planIds,
    subagentIds,
    planRefs: planRefs && planRefs.length > 0 ? planRefs : undefined,
    jsonlModifiedAt: jsonlMtime,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Extract catalog for a single session.
 *
 * 1. Check mtime for incremental skip
 * 2. Parse JSONL
 * 3. Extract explore agent results as markdown
 * 4. Extract web search results as markdown
 * 5. Delegate plan extraction to plan-cataloger
 * 6. Write session manifest
 * 7. Update .jacques/index.json
 */
export async function extractSessionCatalog(
  jsonlPath: string,
  projectPath: string,
  options: ExtractSessionOptions = {}
): Promise<ExtractSessionResult> {
  const sessionId = basename(jsonlPath, ".jsonl");

  // Skip extraction if projectPath no longer exists (deleted worktree)
  // This prevents fs.mkdir from recreating deleted directories as ghost dirs
  try {
    await fs.access(projectPath);
  } catch {
    return { sessionId, skipped: true, subagentsExtracted: 0, plansExtracted: 0 };
  }

  const sessionsDir = join(projectPath, JACQUES_DIR, SESSIONS_DIR);
  const subagentsDir = join(projectPath, JACQUES_DIR, SUBAGENTS_DIR);
  const manifestPath = join(sessionsDir, `${sessionId}.json`);

  try {
    // Get JSONL file stats
    const jsonlStats = await fs.stat(jsonlPath);
    const jsonlMtime = jsonlStats.mtime.toISOString();

    // Incremental check: compare mtime
    if (!options.force) {
      try {
        const existingContent = await fs.readFile(manifestPath, "utf-8");
        const existingManifest = JSON.parse(existingContent) as SessionManifest;
        if (existingManifest.jsonlModifiedAt === jsonlMtime) {
          return {
            sessionId,
            skipped: true,
            subagentsExtracted: 0,
            plansExtracted: 0,
          };
        }
      } catch {
        // No existing manifest, proceed with extraction
      }
    }

    // Parse JSONL
    const entries = await parseJSONL(jsonlPath);
    if (entries.length === 0) {
      return {
        sessionId,
        skipped: true,
        subagentsExtracted: 0,
        plansExtracted: 0,
      };
    }

    // Ensure output directories exist
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.mkdir(subagentsDir, { recursive: true });

    const extractedSubagentIds: string[] = [];
    const extractedPlanIds: string[] = [];
    let subagentsExtracted = 0;

    // --- Extract explore agent results ---
    const subagentFiles = await listSubagentFiles(jsonlPath);
    const userVisibleSubagents = subagentFiles.filter(
      (f) =>
        !f.agentId.startsWith("aprompt_suggestion-") &&
        !f.agentId.startsWith("acompact-")
    );

    // Build a map of agentId → description from entries
    const agentDescriptions = new Map<string, { description: string; timestamp: string }>();
    for (const entry of entries) {
      if (entry.type === "agent_progress" && entry.content.agentId) {
        const agentType = entry.content.agentType?.toLowerCase();
        if (agentType === "explore" && !agentDescriptions.has(entry.content.agentId)) {
          agentDescriptions.set(entry.content.agentId, {
            description: entry.content.agentDescription || "Explore codebase",
            timestamp: entry.timestamp,
          });
        }
      }
    }

    // Extract each explore agent's final result
    for (const subFile of userVisibleSubagents) {
      const agentInfo = agentDescriptions.get(subFile.agentId);
      if (!agentInfo) continue; // Not an explore agent

      const result = await extractExploreResult(
        subFile,
        agentInfo.description,
        sessionId,
        agentInfo.timestamp
      );

      if (result) {
        // Write markdown file
        await fs.writeFile(join(subagentsDir, result.entry.filename), result.markdown, "utf-8");
        // Add to index
        await addSubagentToIndex(projectPath, result.entry);
        extractedSubagentIds.push(result.entry.id);
        subagentsExtracted++;
      }
    }

    // --- Extract web search results ---
    const searchResults = extractSearchResults(entries, sessionId);
    for (const sr of searchResults) {
      await fs.writeFile(join(subagentsDir, sr.entry.filename), sr.markdown, "utf-8");
      await addSubagentToIndex(projectPath, sr.entry);
      extractedSubagentIds.push(sr.entry.id);
      subagentsExtracted++;
    }

    // --- Extract plans (delegate to plan-cataloger) ---
    const { planRefs } = detectModeAndPlans(entries);

    // Track planRef → catalogId mapping (parallel arrays)
    const planRefCatalogIds: Array<string | null> = [];

    for (const ref of planRefs) {
      if (ref.source === "embedded") {
        // Get plan content from the entry
        const entry = entries[ref.messageIndex];
        if (entry?.type === "user_message" && entry.content.text) {
          let planContent = entry.content.text;
          for (const pattern of PLAN_TRIGGER_PATTERNS) {
            const match = planContent.match(pattern);
            if (match) {
              planContent = planContent.substring(match[0].length).trim();
              break;
            }
          }
          if (planContent.length >= 100 && planContent.includes("#")) {
            const title = extractPlanTitle(planContent);
            const planEntry = await catalogPlan(projectPath, {
              title,
              content: planContent,
              sessionId,
            });
            extractedPlanIds.push(planEntry.id);
            planRefCatalogIds.push(planEntry.id);
          } else {
            planRefCatalogIds.push(null);
          }
        } else {
          planRefCatalogIds.push(null);
        }
      } else if (ref.source === "agent" && ref.agentId) {
        // Read Plan agent's subagent JSONL, extract last assistant message as plan content
        const subagentFile = userVisibleSubagents.find(f => f.agentId === ref.agentId);
        if (subagentFile) {
          try {
            const subEntries = await parseJSONL(subagentFile.filePath);
            // Find last substantial assistant text (the plan output)
            let planContent: string | null = null;
            for (let i = subEntries.length - 1; i >= 0; i--) {
              if (subEntries[i].type === "assistant_message" && subEntries[i].content.text && subEntries[i].content.text!.length >= 100) {
                planContent = subEntries[i].content.text!;
                break;
              }
            }
            if (planContent && planContent.includes("#")) {
              const title = extractPlanTitle(planContent);
              const planEntry = await catalogPlan(projectPath, {
                title,
                content: planContent,
                sessionId,
              });
              extractedPlanIds.push(planEntry.id);
              planRefCatalogIds.push(planEntry.id);
            } else {
              planRefCatalogIds.push(null);
            }
          } catch {
            // Subagent file unreadable, skip
            planRefCatalogIds.push(null);
          }
        } else {
          planRefCatalogIds.push(null);
        }
      } else if (ref.source === "write" && ref.filePath) {
        // Read plan content from the file
        try {
          const content = await fs.readFile(ref.filePath, "utf-8");
          if (content.length >= 100 && content.includes("#")) {
            const title = extractPlanTitle(content);
            const planEntry = await catalogPlan(projectPath, {
              title,
              content,
              sessionId,
            });
            extractedPlanIds.push(planEntry.id);
            planRefCatalogIds.push(planEntry.id);
          } else {
            planRefCatalogIds.push(null);
          }
        } catch {
          // File doesn't exist anymore, skip
          planRefCatalogIds.push(null);
        }
      } else {
        planRefCatalogIds.push(null);
      }
    }

    // --- Deduplicate planRefs using logical grouping ---
    // Within a session, each `embedded` plan starts a new logical group.
    // Subsequent `agent` and `write` detections are intermediate steps of
    // the preceding plan. Pick the best entry per group (write > embedded > agent).
    //
    // Cross-session dedup is already handled by catalogPlan() (SHA-256 + Jaccard).

    // Pair each planRef with its catalogId and sort by messageIndex
    const paired = planRefs.map((ref, i) => ({ ref, catalogId: planRefCatalogIds[i] }));
    paired.sort((a, b) => a.ref.messageIndex - b.ref.messageIndex);

    // Group: each `embedded` starts a new group; `agent`/`write` join current group
    const groups: Array<Array<{ ref: typeof planRefs[0]; catalogId: string | null }>> = [];
    for (const item of paired) {
      if (item.ref.source === "embedded" || groups.length === 0) {
        groups.push([item]);
      } else {
        groups[groups.length - 1].push(item);
      }
    }

    // Priority: write > embedded > agent
    const SOURCE_PRIORITY: Record<string, number> = { write: 3, embedded: 2, agent: 1 };

    const deduplicatedPlanRefs: NonNullable<SessionManifest["planRefs"]> = [];

    for (const group of groups) {
      // Pick best entry by source priority
      let best = group[0];
      for (const item of group) {
        if ((SOURCE_PRIORITY[item.ref.source] || 0) > (SOURCE_PRIORITY[best.ref.source] || 0)) {
          best = item;
        }
      }

      // Merge all sources from the group
      const allSources = [...new Set(group.map(item => item.ref.source))];

      // Collect filePath and agentId from any member
      const filePath = group.find(item => item.ref.filePath)?.ref.filePath;
      const agentId = group.find(item => item.ref.agentId)?.ref.agentId;

      // Prefer the best item's catalogId, fall back to any catalogId in the group
      const catalogId = best.catalogId || group.find(item => item.catalogId)?.catalogId || undefined;

      deduplicatedPlanRefs.push({
        title: best.ref.title,
        source: best.ref.source,
        sources: allSources,
        messageIndex: best.ref.messageIndex,
        filePath: filePath || best.ref.filePath,
        agentId: agentId || best.ref.agentId,
        catalogId,
      });
    }

    // Deduplicate extractedPlanIds too
    const uniquePlanIds = [...new Set(extractedPlanIds)];

    // --- Write session manifest ---
    const sessionManifest = await createSessionManifest(
      entries,
      jsonlPath,
      projectPath,
      jsonlMtime,
      uniquePlanIds,
      extractedSubagentIds,
      deduplicatedPlanRefs.length > 0 ? deduplicatedPlanRefs : undefined
    );
    await fs.writeFile(manifestPath, JSON.stringify(sessionManifest, null, 2), "utf-8");

    // --- Update session entry in index.json ---
    const projectSlug = basename(projectPath);
    const indexSessionEntry: IndexSessionEntry = {
      id: sessionId,
      title: sessionManifest.title,
      filename: `${sessionId}.json`,
      path: `sessions/${sessionId}.json`,
      savedAt: sessionManifest.extractedAt,
      startedAt: sessionManifest.startedAt,
      endedAt: sessionManifest.endedAt,
      durationMinutes: sessionManifest.durationMinutes,
      messageCount: sessionManifest.messageCount,
      toolCallCount: sessionManifest.toolCallCount,
      technologies: sessionManifest.technologies,
      filesModified: sessionManifest.filesModified,
      toolsUsed: sessionManifest.toolsUsed,
      tokens: sessionManifest.tokens,
      hasSubagents: sessionManifest.hasSubagents,
      hadAutoCompact: sessionManifest.hadAutoCompact,
      mode: sessionManifest.mode,
      planCount: uniquePlanIds.length > 0 ? uniquePlanIds.length : undefined,
      subagentCount: extractedSubagentIds.length > 0 ? extractedSubagentIds.length : undefined,
      planIds: uniquePlanIds.length > 0 ? uniquePlanIds : undefined,
      subagentIds: extractedSubagentIds.length > 0 ? extractedSubagentIds : undefined,
    };
    await addSessionToIndex(projectPath, indexSessionEntry);

    return {
      sessionId,
      skipped: false,
      subagentsExtracted,
      plansExtracted: uniquePlanIds.length,
    };
  } catch (error) {
    return {
      sessionId,
      skipped: false,
      subagentsExtracted: 0,
      plansExtracted: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
