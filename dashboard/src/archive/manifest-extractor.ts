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

/** Max chars for truncated user questions */
const MAX_QUESTION_LENGTH = 200;

/** Max chars for context snippets */
const MAX_SNIPPET_LENGTH = 150;

/** Max number of context snippets to store */
const MAX_SNIPPETS = 5;

/**
 * Clean a title string by removing:
 * - Leading markdown heading markers (# ## etc.)
 * - XML/HTML tags
 * - System message artifacts
 */
function cleanTitle(title: string): string {
  let clean = title.trim();

  // Remove leading markdown heading markers
  clean = clean.replace(/^#+\s*/, "");

  // Remove XML/HTML tags (including system message tags like <local-command-caveat>)
  clean = clean.replace(/<[^>]+>/g, "");

  // Clean up any double spaces or leading/trailing whitespace
  clean = clean.replace(/\s+/g, " ").trim();

  // If the title is now empty or just whitespace, return a default
  if (!clean || clean.length < 3) {
    return "Untitled Session";
  }

  // Truncate if too long (max 100 chars)
  if (clean.length > 100) {
    clean = clean.substring(0, 97) + "...";
  }

  return clean;
}

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
    const content = require("fs").readFileSync(settingsPath, "utf-8");
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
  return extractManifestFromEntries(entries, projectPath, jsonlPath, options);
}

/**
 * Extract a manifest from already-parsed entries.
 */
export function extractManifestFromEntries(
  entries: ParsedEntry[],
  projectPath: string,
  jsonlPath: string,
  options: {
    userLabel?: string;
    autoArchived?: boolean;
  } = {}
): ConversationManifest {
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
  const rawTitle = summaryEntry?.content.summary || extractFallbackTitle(entries);
  const title = cleanTitle(rawTitle);

  // Extract user questions
  const userQuestions = extractUserQuestions(entries);

  // Extract files modified (from Write/Edit tool calls)
  const filesModified = extractFilesModified(entries);

  // Extract tools used
  const toolsUsed = extractToolsUsed(entries);

  // Extract technologies
  const technologies = extractTechnologies(entries, filesModified);

  // Detect plans
  const plans = detectPlans(entries);

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
      if (filePath && content && (filePath.includes("/plans/") || filePath.includes("plan"))) {
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (titleMatch && titleMatch[1].length <= 80) {
          return titleMatch[1].trim();
        }
      }
    }
  }

  // Strategy 2: Extract action from first user message
  const firstUser = entries.find((e) => e.type === "user_message");
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
 * Detect plan files written in this conversation.
 */
export function detectPlans(entries: ParsedEntry[]): PlanReference[] {
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

  return Array.from(planPaths).map((p) => ({
    path: p,
    name: path.basename(p),
    archivedPath: `plans/${path.basename(p)}`,
  }));
}

/** Pattern to detect "Implement the following plan" messages from Claude Code */
const EMBEDDED_PLAN_PATTERNS = [
  /^implement the following plan[.:\s]*/i,
  /^here is the plan to implement[.:\s]*/i,
  /^please implement this plan[.:\s]*/i,
];

export interface EmbeddedPlan {
  /** The extracted plan content (markdown) */
  content: string;
  /** Title extracted from the plan's first # heading */
  title: string;
  /** The replacement text to use in the conversation */
  reference: string;
}

/**
 * Detect and extract an embedded plan from the first user message.
 * Claude Code pastes the full plan when starting a new session with
 * "Implement the following plan..."
 *
 * Returns the extracted plan if found, or null if no embedded plan detected.
 */
export function detectEmbeddedPlan(entries: ParsedEntry[]): EmbeddedPlan | null {
  // Find first user message
  const firstUser = entries.find((e) => e.type === "user_message");
  if (!firstUser?.content.text) {
    return null;
  }

  const text = firstUser.content.text.trim();

  // Check if it matches any embedded plan pattern
  let planContent: string | null = null;
  for (const pattern of EMBEDDED_PLAN_PATTERNS) {
    if (pattern.test(text)) {
      planContent = text.replace(pattern, "").trim();
      break;
    }
  }

  if (!planContent) {
    return null;
  }

  // Verify it looks like a plan (should start with # heading or have plan-like structure)
  if (!planContent.startsWith("#") && !planContent.includes("\n##")) {
    return null;
  }

  // Extract title from first # heading
  const titleMatch = planContent.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "Embedded Plan";

  return {
    content: planContent,
    title,
    reference: `[Plan: ${title}]`,
  };
}

/**
 * Replace embedded plan in entries with a reference.
 * Returns a new array of entries with the plan content replaced.
 */
export function replaceEmbeddedPlanWithReference(
  entries: ParsedEntry[],
  embeddedPlan: EmbeddedPlan
): ParsedEntry[] {
  return entries.map((entry) => {
    if (entry.type !== "user_message") {
      return entry;
    }

    const text = entry.content.text?.trim() || "";

    // Check if this is the message with the embedded plan
    for (const pattern of EMBEDDED_PLAN_PATTERNS) {
      if (pattern.test(text)) {
        // Replace the full plan with just the reference
        return {
          ...entry,
          content: {
            ...entry.content,
            text: `Implement the following plan:\n\n${embeddedPlan.reference}\n\n(Full plan content saved separately)`,
          },
        };
      }
    }

    return entry;
  });
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
export async function readPlanContent(planPath: string): Promise<string | null> {
  try {
    return await fs.readFile(planPath, "utf-8");
  } catch {
    return null;
  }
}
