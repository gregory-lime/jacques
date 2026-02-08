/**
 * Manifest Extractor
 *
 * Extracts ConversationManifest from JSONL session files.
 * Reuses existing parser for JSONL parsing.
 */

import { promises as fs } from "fs";
import * as path from "path";
import { homedir } from "os";
import type { ParsedEntry } from "../session/parser.js";
import { parseJSONL } from "../session/parser.js";
import type { ConversationManifest, PlanReference } from "./types.js";
import { extractEmbeddedPlans } from "./plan-extractor.js";
import { catalogPlan } from "./plan-cataloger.js";

/** Max chars for truncated user questions */
const MAX_QUESTION_LENGTH = 200;

/** Max chars for context snippets */
const MAX_SNIPPET_LENGTH = 300;

/** Max number of context snippets to store */
const MAX_SNIPPETS = 20;

/** Technology detection patterns */
const TECH_PATTERNS: Array<{ pattern: RegExp; tech: string }> = [
  // Languages
  { pattern: /typescript|\.tsx?$/i, tech: "typescript" },
  { pattern: /javascript|\.jsx?$/i, tech: "javascript" },
  { pattern: /python|\.py$/i, tech: "python" },
  { pattern: /rust|\.rs$/i, tech: "rust" },
  { pattern: /golang|\.go$/i, tech: "go" },
  { pattern: /java(?!script)|\.java$/i, tech: "java" },
  { pattern: /c\+\+|\.cpp$|\.cc$/i, tech: "cpp" },
  { pattern: /c#|csharp|\.cs$/i, tech: "csharp" },
  { pattern: /ruby|\.rb$/i, tech: "ruby" },
  { pattern: /php|\.php$/i, tech: "php" },
  { pattern: /swift|\.swift$/i, tech: "swift" },
  { pattern: /kotlin|\.kt$/i, tech: "kotlin" },
  // Frameworks
  { pattern: /\breact\b/i, tech: "react" },
  { pattern: /\bvue\b/i, tech: "vue" },
  { pattern: /\bangular\b/i, tech: "angular" },
  { pattern: /\bsvelte\b/i, tech: "svelte" },
  { pattern: /\bnextjs?\b|next\.config/i, tech: "nextjs" },
  { pattern: /\bnuxt\b/i, tech: "nuxt" },
  { pattern: /\bexpress\b/i, tech: "express" },
  { pattern: /\bfastapi\b/i, tech: "fastapi" },
  { pattern: /\bdjango\b/i, tech: "django" },
  { pattern: /\bflask\b/i, tech: "flask" },
  { pattern: /\brails\b/i, tech: "rails" },
  { pattern: /\bspring\b/i, tech: "spring" },
  // Databases
  { pattern: /\bpostgres|psql\b/i, tech: "postgres" },
  { pattern: /\bmysql\b/i, tech: "mysql" },
  { pattern: /\bmongodb?\b/i, tech: "mongodb" },
  { pattern: /\bredis\b/i, tech: "redis" },
  { pattern: /\bsqlite\b/i, tech: "sqlite" },
  { pattern: /\bprisma\b/i, tech: "prisma" },
  // Tools/Infrastructure
  { pattern: /\bdocker\b/i, tech: "docker" },
  { pattern: /\bkubernetes|k8s\b/i, tech: "kubernetes" },
  { pattern: /\baws\b/i, tech: "aws" },
  { pattern: /\bgcp\b|google cloud/i, tech: "gcp" },
  { pattern: /\bazure\b/i, tech: "azure" },
  { pattern: /\bgraphql\b/i, tech: "graphql" },
  { pattern: /\brest\s*api\b/i, tech: "rest" },
  { pattern: /\bwebsocket\b/i, tech: "websocket" },
  { pattern: /\bjest\b/i, tech: "jest" },
  { pattern: /\bpytest\b/i, tech: "pytest" },
  { pattern: /\bink\b.*\breact\b|\breact\b.*\bink\b/i, tech: "ink" },
  { pattern: /\btailwind\b/i, tech: "tailwind" },
  // Build tools
  { pattern: /\bwebpack\b/i, tech: "webpack" },
  { pattern: /\bvite\b/i, tech: "vite" },
  { pattern: /\besbuild\b/i, tech: "esbuild" },
  { pattern: /\brollup\b/i, tech: "rollup" },
];

/**
 * Get the plans directory from Claude Code settings
 */
export function getPlansDirectory(): string {
  const settingsPath = path.join(homedir(), ".claude", "settings.json");
  try {
    // Use require("fs") for sync read to avoid top-level await
    const fsSync = require("fs");
    const content = fsSync.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(content);
    return settings.plansDirectory || path.join(homedir(), ".claude", "plans");
  } catch {
    return path.join(homedir(), ".claude", "plans");
  }
}

/**
 * Extract a manifest from a JSONL session file.
 */
export async function extractManifest(
  jsonlPath: string,
  projectPath: string,
  options: {
    userLabel?: string;
    autoArchived?: boolean;
  } = {}
): Promise<ConversationManifest> {
  const entries = await parseJSONL(jsonlPath);
  return await extractManifestFromEntries(entries, projectPath, jsonlPath, options);
}

/**
 * Extract a manifest from already-parsed entries.
 */
export async function extractManifestFromEntries(
  entries: ParsedEntry[],
  projectPath: string,
  jsonlPath: string,
  options: {
    userLabel?: string;
    autoArchived?: boolean;
  } = {}
): Promise<ConversationManifest> {
  // Extract session ID from first entry or filename
  const sessionId =
    entries[0]?.sessionId || path.basename(jsonlPath, ".jsonl");

  // Generate unique projectId from full path (dash-encoding pattern)
  const projectId = projectPath.replace(/\//g, "-");
  // Keep projectSlug for human-readable display
  const projectSlug = path.basename(projectPath);

  // Find timestamps
  const timestamps = entries
    .map((e) => e.timestamp)
    .filter((t) => t)
    .sort();
  const startedAt = timestamps[0] || new Date().toISOString();
  const endedAt = timestamps[timestamps.length - 1] || startedAt;

  // Calculate duration
  const durationMs =
    new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const durationMinutes = Math.round(durationMs / 1000 / 60);

  // Extract title from summary entry
  const summaryEntry = entries.find((e) => e.type === "summary");
  const title = summaryEntry?.content.summary || extractFallbackTitle(entries);

  // Extract user questions
  const userQuestions = extractUserQuestions(entries);

  // Extract files modified (from Write/Edit tool calls)
  const filesModified = extractFilesModified(entries);

  // Extract tools used
  const toolsUsed = extractToolsUsed(entries);

  // Extract technologies
  const technologies = extractTechnologies(entries, filesModified);

  // Detect plans from Write tool calls and catalog them
  const writePlanPaths = detectWrittenPlanPaths(entries);
  const writePlans = await catalogWrittenPlans(
    writePlanPaths,
    projectPath,
    sessionId
  );

  // Detect transient plans (created by plan mode, stored in ~/.claude/plans/)
  const transientPlans = await catalogTransientPlans(
    entries,
    projectPath,
    sessionId
  );

  // Detect embedded plans from user messages (already catalogs them)
  const embeddedPlans = await extractEmbeddedPlans(
    entries,
    projectPath,
    sessionId
  );

  // Combine all sources (dedup happens via cataloging)
  const plans = [...writePlans, ...transientPlans, ...embeddedPlans];

  // Extract context snippets
  const contextSnippets = extractContextSnippets(entries);

  // Count messages and tool calls
  const messageCount = entries.filter(
    (e) => e.type === "user_message" || e.type === "assistant_message"
  ).length;
  const toolCallCount = entries.filter((e) => e.type === "tool_call").length;

  return {
    id: sessionId,
    projectId,
    projectSlug,
    projectPath,
    archivedAt: new Date().toISOString(),
    autoArchived: options.autoArchived ?? false,
    title,
    startedAt,
    endedAt,
    durationMinutes,
    userQuestions,
    filesModified,
    toolsUsed,
    technologies,
    plans,
    contextSnippets,
    messageCount,
    toolCallCount,
    userLabel: options.userLabel,
  };
}

/**
 * Extract a fallback title from entries when no summary exists.
 * Uses multiple strategies to find a meaningful title.
 */
function extractFallbackTitle(entries: ParsedEntry[]): string {
  // Strategy 1: Look for a plan title in the conversation
  // Plans often have good titles like "# Authentication System Design"
  for (const entry of entries) {
    if (entry.type === "tool_call" && entry.content.toolName === "Write") {
      const filePath = entry.content.toolInput?.file_path as string | undefined;
      const content = entry.content.toolInput?.content as string | undefined;
      if (
        filePath &&
        content &&
        (filePath.includes("/plans/") || filePath.includes("plan"))
      ) {
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (titleMatch && titleMatch[1].length <= 80) {
          return titleMatch[1].trim();
        }
      }
    }
  }

  // Strategy 2: Extract action from first real user message (skip internal commands)
  const firstUser = entries.find((e) => {
    if (e.type !== "user_message" || !e.content.text) return false;
    const text = e.content.text.trim();
    // Skip internal Claude Code messages
    if (text.startsWith("<local-command")) return false;
    if (text.startsWith("<command-")) return false;
    if (text.length === 0) return false;
    return true;
  });
  if (firstUser?.content.text) {
    const text = firstUser.content.text.trim();

    // Skip common noise prefixes
    const noisePrefixes = [
      /^implement the following plan[:\s]*/i,
      /^here is the plan[:\s]*/i,
      /^please implement[:\s]*/i,
      /^can you[:\s]*/i,
      /^i want to[:\s]*/i,
      /^i need to[:\s]*/i,
      /^help me[:\s]*/i,
      /^let's[:\s]*/i,
    ];

    let cleanText = text;
    for (const prefix of noisePrefixes) {
      cleanText = cleanText.replace(prefix, "");
    }
    cleanText = cleanText.trim();

    // If it's still too long, try to extract first sentence or phrase
    if (cleanText.length > 80) {
      // Try to get first sentence
      const sentenceMatch = cleanText.match(/^[^.!?\n]+[.!?]?/);
      if (sentenceMatch && sentenceMatch[0].length <= 80) {
        return sentenceMatch[0].trim();
      }
      // Just truncate
      return cleanText.substring(0, 77) + "...";
    }

    if (cleanText.length > 0) {
      return cleanText;
    }
  }

  // Strategy 3: Use project name + date as last resort
  return "Session " + new Date().toISOString().split("T")[0];
}

/**
 * Extract user questions from entries (truncated).
 */
function extractUserQuestions(entries: ParsedEntry[]): string[] {
  return entries
    .filter((e) => e.type === "user_message" && e.content.text)
    .map((e) => {
      const text = e.content.text!.trim();
      if (text.length <= MAX_QUESTION_LENGTH) {
        return text;
      }
      return text.substring(0, MAX_QUESTION_LENGTH - 3) + "...";
    })
    .filter((q) => q.length > 0);
}

/**
 * Extract files modified from Write/Edit tool calls.
 */
function extractFilesModified(entries: ParsedEntry[]): string[] {
  const files = new Set<string>();

  for (const entry of entries) {
    if (entry.type === "tool_call") {
      const toolName = entry.content.toolName;
      const input = entry.content.toolInput;

      if (toolName === "Write" || toolName === "Edit") {
        const filePath = input?.file_path as string | undefined;
        if (filePath) {
          files.add(filePath);
        }
      }
    }
  }

  return Array.from(files);
}

/**
 * Extract unique tools used.
 */
function extractToolsUsed(entries: ParsedEntry[]): string[] {
  const tools = new Set<string>();

  for (const entry of entries) {
    if (entry.type === "tool_call" && entry.content.toolName) {
      tools.add(entry.content.toolName);
    }
  }

  return Array.from(tools).sort();
}

/**
 * Extract technologies from content and file paths.
 */
function extractTechnologies(
  entries: ParsedEntry[],
  filesModified: string[]
): string[] {
  const techs = new Set<string>();

  // Build combined text for pattern matching
  const textParts: string[] = [];

  for (const entry of entries) {
    if (entry.content.text) {
      textParts.push(entry.content.text);
    }
  }

  // Add file paths
  textParts.push(...filesModified);

  const combinedText = textParts.join(" ");

  // Check each pattern
  for (const { pattern, tech } of TECH_PATTERNS) {
    if (pattern.test(combinedText)) {
      techs.add(tech);
    }
  }

  return Array.from(techs).sort();
}

/**
 * Detect plan file paths written in this conversation.
 * Returns paths to plan files that were written via the Write tool.
 */
export function detectWrittenPlanPaths(entries: ParsedEntry[]): string[] {
  const planPaths = new Set<string>();
  const plansDir = getPlansDirectory();

  for (const entry of entries) {
    if (entry.type === "tool_call" && entry.content.toolName === "Write") {
      const filePath = entry.content.toolInput?.file_path as string | undefined;
      if (filePath) {
        // Detect plans in ~/.claude/plans/ or custom plansDirectory
        const isPlanPath =
          filePath.startsWith(plansDir) ||
          filePath.includes("/plans/") ||
          (filePath.includes("plan") && filePath.endsWith(".md"));

        if (isPlanPath) {
          planPaths.add(filePath);
        }
      }
    }
  }

  return Array.from(planPaths);
}

/**
 * Catalog written plans into the project index.
 * Reads plan content and catalogs it using the standard cataloger (with dedup).
 */
async function catalogWrittenPlans(
  planPaths: string[],
  projectPath: string,
  sessionId: string
): Promise<PlanReference[]> {
  const references: PlanReference[] = [];

  for (const planPath of planPaths) {
    try {
      const content = await fs.readFile(planPath, "utf-8");

      // Extract title from content
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch
        ? titleMatch[1].trim().replace(/^Plan:\s*/i, "")
        : path.basename(planPath, ".md");

      // Catalog the plan (handles dedup automatically)
      const planEntry = await catalogPlan(projectPath, {
        title,
        content,
        sessionId,
      });

      // Return reference pointing to the cataloged plan
      references.push({
        path: path.join(projectPath, ".jacques", planEntry.path),
        name: planEntry.filename,
        archivedPath: planEntry.path,
        source: "write" as const,
      });
    } catch (error) {
      // Plan file doesn't exist or can't be read - still track it as reference
      references.push({
        path: planPath,
        name: path.basename(planPath),
        archivedPath: `plans/${path.basename(planPath)}`,
        source: "write" as const,
      });
    }
  }

  return references;
}

/**
 * Catalog transient plans created by Claude Code's plan mode.
 * These are stored in ~/.claude/plans/ with the session's slug as filename.
 */
async function catalogTransientPlans(
  entries: ParsedEntry[],
  projectPath: string,
  sessionId: string
): Promise<PlanReference[]> {
  const references: PlanReference[] = [];
  const plansDir = getPlansDirectory();

  // Find the session slug from entries (stored in "progress" type entries)
  const slugs = new Set<string>();
  for (const entry of entries) {
    // The slug is stored in progress entries or can be found in the raw entry
    const rawEntry = entry as { slug?: string };
    if (rawEntry.slug) {
      slugs.add(rawEntry.slug);
    }
  }

  // Check each slug for a corresponding plan file
  for (const slug of slugs) {
    const planPath = path.join(plansDir, `${slug}.md`);

    try {
      const content = await fs.readFile(planPath, "utf-8");

      // Extract title from content
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch
        ? titleMatch[1].trim().replace(/^Plan:\s*/i, "")
        : slug;

      // Catalog the plan (handles dedup automatically)
      const planEntry = await catalogPlan(projectPath, {
        title,
        content,
        sessionId,
      });

      // Return reference pointing to the cataloged plan
      references.push({
        path: path.join(projectPath, ".jacques", planEntry.path),
        name: planEntry.filename,
        archivedPath: planEntry.path,
        source: "write" as const, // Treat as "write" since it's from a file
      });
    } catch (error) {
      // Plan file doesn't exist for this slug - that's fine, not all sessions have plans
    }
  }

  return references;
}

/**
 * @deprecated Use detectWrittenPlanPaths instead
 */
export function detectPlans(entries: ParsedEntry[]): PlanReference[] {
  const paths = detectWrittenPlanPaths(entries);
  return paths.map((p) => ({
    path: p,
    name: path.basename(p),
    archivedPath: `plans/${path.basename(p)}`,
    source: "write" as const,
  }));
}

/**
 * Extract context snippets from key assistant responses.
 */
function extractContextSnippets(entries: ParsedEntry[]): string[] {
  const snippets: string[] = [];

  for (const entry of entries) {
    if (entry.type === "assistant_message" && entry.content.text) {
      const text = entry.content.text.trim();
      if (text.length > 0) {
        // Only take first part of response
        const snippet =
          text.length <= MAX_SNIPPET_LENGTH
            ? text
            : text.substring(0, MAX_SNIPPET_LENGTH - 3) + "...";
        snippets.push(snippet);

        if (snippets.length >= MAX_SNIPPETS) {
          break;
        }
      }
    }
  }

  return snippets;
}

/**
 * Read a plan file's content.
 */
export async function readPlanContent(
  planPath: string
): Promise<string | null> {
  try {
    return await fs.readFile(planPath, "utf-8");
  } catch {
    return null;
  }
}
