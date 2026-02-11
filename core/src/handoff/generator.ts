/**
 * Handoff Generator
 *
 * Generates handoff documents directly from transcript files.
 * Uses rule-based extraction (no LLM) for fast, consistent results.
 */

import { promises as fs } from "fs";
import { join, basename } from "path";
import type { ParsedEntry } from "../session/parser.js";
import { parseJSONL } from "../session/parser.js";
import { ensureHandoffsDir, generateHandoffFilename } from "./catalog.js";
import { extractEmbeddedPlans, extractPlanTitle } from "../archive/plan-extractor.js";

/** Max number of recent user messages to include */
const MAX_RECENT_MESSAGES = 5;

/** Max number of recent user messages for skill context (more comprehensive) */
const MAX_SKILL_CONTEXT_MESSAGES = 10;

/** Max length for each message excerpt */
const MAX_MESSAGE_LENGTH = 300;

/** Max number of assistant highlights to extract */
const MAX_ASSISTANT_HIGHLIGHTS = 5;

/** Max length for each assistant highlight */
const MAX_HIGHLIGHT_LENGTH = 150;

/**
 * Data extracted from a transcript for handoff generation
 */
export interface HandoffData {
  /** Session title from summary entry */
  title: string;
  /** Project directory */
  projectDir: string;
  /** Files modified (Write/Edit tool calls) */
  filesModified: string[];
  /** Tools used in the session */
  toolsUsed: string[];
  /** Recent user messages (last N) */
  recentMessages: string[];
  /** Timestamp of extraction */
  timestamp: string;
  /** Total user message count */
  totalUserMessages: number;
  /** Total tool call count */
  totalToolCalls: number;
  /** Plans detected in the session */
  plans?: Array<{ path: string; title: string }>;
  /** Key assistant response snippets (last N, no thinking/tools) */
  assistantHighlights: string[];
  /** Detected decision points from user messages */
  decisions: string[];
  /** Technologies detected in the session */
  technologies: string[];
  /** Detected blockers/errors from messages */
  blockers: string[];
}

/**
 * Result of handoff generation
 */
export interface HandoffResult {
  /** Path to the generated handoff file */
  filePath: string;
  /** Filename of the handoff */
  filename: string;
  /** The handoff content */
  content: string;
  /** Estimated token count */
  tokenEstimate: number;
}

/**
 * Extract session title from entries
 */
function extractTitle(entries: ParsedEntry[], projectDir: string): string {
  // First, try to find a summary entry
  const summaryEntry = entries.find((e) => e.type === "summary");
  if (summaryEntry?.content.summary) {
    return summaryEntry.content.summary;
  }

  // Fallback: first user message (truncated)
  const firstUser = entries.find((e) => e.type === "user_message");
  if (firstUser?.content.text) {
    const text = firstUser.content.text.trim();
    if (text.length <= 80) {
      return text;
    }
    return text.substring(0, 77) + "...";
  }

  // Last resort: project name
  return `Session in ${basename(projectDir)}`;
}

/**
 * Extract files modified from Write/Edit tool calls
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
 * Extract unique tools used
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
 * Extract recent user messages (last N)
 */
function extractRecentMessages(
  entries: ParsedEntry[],
  count: number = MAX_RECENT_MESSAGES
): string[] {
  const userMessages = entries
    .filter((e) => e.type === "user_message" && e.content.text)
    .map((e) => {
      const text = e.content.text!.trim();
      if (text.length <= MAX_MESSAGE_LENGTH) {
        return text;
      }
      return text.substring(0, MAX_MESSAGE_LENGTH - 3) + "...";
    })
    .filter((m) => m.length > 0);

  // Return last N messages
  return userMessages.slice(-count);
}

/**
 * Extract key assistant response snippets (last N, excluding thinking/tools)
 */
function extractAssistantHighlights(
  entries: ParsedEntry[],
  count: number = MAX_ASSISTANT_HIGHLIGHTS
): string[] {
  const highlights = entries
    .filter((e) => e.type === "assistant_message" && e.content.text)
    .map((e) => {
      const text = e.content.text!.trim();
      if (text.length <= MAX_HIGHLIGHT_LENGTH) {
        return text;
      }
      return text.substring(0, MAX_HIGHLIGHT_LENGTH - 3) + "...";
    })
    .filter((h) => h.length > 0);

  // Return last N highlights
  return highlights.slice(-count);
}

/** Decision detection patterns */
const DECISION_PATTERNS = [
  /\b(?:yes|yeah|yep|sure),?\s+(?:do that|go with|use|let's)/i,
  /\b(?:let's|lets)\s+(?:go with|use|do|try|stick with)/i,
  /\b(?:use|go with|switch to|prefer)\s+\w+\s+instead/i,
  /\b(?:sounds good|that works|perfect|great idea)/i,
  /\b(?:i want|i prefer|i'd like|i would like)\s+(?:to|the)/i,
  /\b(?:don't|do not|shouldn't|should not)\s+(?:use|add|include)/i,
  /\b(?:keep|remove|delete|add|include)\s+(?:the|that|this)/i,
  /\bapproved?\b/i,
  /\b(?:option|choice|approach)\s+(?:\d|[a-c])\b/i,
];

/**
 * Extract user decision points from messages
 */
function extractDecisionPoints(entries: ParsedEntry[]): string[] {
  const decisions: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (entry.type !== "user_message" || !entry.content.text) continue;

    const text = entry.content.text.trim();

    for (const pattern of DECISION_PATTERNS) {
      if (pattern.test(text)) {
        // Extract the relevant sentence/phrase (up to 150 chars)
        const excerpt =
          text.length <= 150 ? text : text.substring(0, 147) + "...";

        // Deduplicate similar decisions
        const normalized = excerpt.toLowerCase().replace(/\s+/g, " ");
        if (!seen.has(normalized)) {
          seen.add(normalized);
          decisions.push(excerpt);
        }
        break; // Only one decision per message
      }
    }
  }

  return decisions;
}

/** Blocker/error detection patterns */
const BLOCKER_PATTERNS = [
  /\b(?:blocked|blocking|stuck)\b/i,
  /\b(?:error|exception|failed|failure|failing)\b/i,
  /\b(?:bug|issue|problem)\b/i,
  /\b(?:doesn't work|doesn't compile|won't compile)\b/i,
  /\b(?:can't|cannot|unable to)\s+(?:find|get|access|connect)/i,
  /\b(?:missing|not found|undefined)\b/i,
  /\b(?:timeout|timed out)\b/i,
  /\b(?:permission denied|access denied)\b/i,
  /\b(?:crash|crashed|crashing)\b/i,
];

/**
 * Extract blockers/errors from user and assistant messages
 */
function extractBlockers(entries: ParsedEntry[]): string[] {
  const blockers: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (
      (entry.type !== "user_message" && entry.type !== "assistant_message") ||
      !entry.content.text
    ) {
      continue;
    }

    const text = entry.content.text.trim();

    for (const pattern of BLOCKER_PATTERNS) {
      if (pattern.test(text)) {
        // Extract the relevant portion (up to 150 chars)
        const excerpt =
          text.length <= 150 ? text : text.substring(0, 147) + "...";

        // Deduplicate
        const normalized = excerpt.toLowerCase().replace(/\s+/g, " ");
        if (!seen.has(normalized)) {
          seen.add(normalized);
          blockers.push(excerpt);
        }
        break;
      }
    }
  }

  return blockers;
}

/** Technology detection patterns (same as manifest-extractor.ts) */
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
 * Extract technologies from content and file paths
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
 * Extract session ID from parsed entries.
 */
function extractSessionId(entries: ParsedEntry[]): string {
  // Try first entry
  if (entries.length > 0 && entries[0].sessionId) {
    return entries[0].sessionId;
  }

  // Fallback: generate timestamp-based ID (better than "handoff-temp")
  return `handoff-${Date.now()}`;
}

/**
 * Extract handoff data from parsed entries
 */
export async function extractHandoffData(
  entries: ParsedEntry[],
  projectDir: string
): Promise<HandoffData> {
  const userMessageCount = entries.filter(
    (e) => e.type === "user_message"
  ).length;
  const toolCallCount = entries.filter((e) => e.type === "tool_call").length;

  // Extract session ID from entries
  const sessionId = extractSessionId(entries);

  // Extract embedded plans with real session ID
  const embeddedPlans = await extractEmbeddedPlans(
    entries,
    projectDir,
    sessionId
  );

  // Process plans with error handling for file reads
  let plans: Array<{ path: string; title: string }> | undefined;
  if (embeddedPlans.length > 0) {
    const planResults = await Promise.all(
      embeddedPlans.map(async (p) => {
        try {
          const content = await fs.readFile(p.path, "utf-8");
          return {
            path: p.path,
            title: extractPlanTitle(content) || p.name,
          };
        } catch {
          // File doesn't exist or can't be read - use name as title
          return {
            path: p.path,
            title: p.name,
          };
        }
      })
    );
    plans = planResults;
  }

  const filesModified = extractFilesModified(entries);

  return {
    title: extractTitle(entries, projectDir),
    projectDir,
    filesModified,
    toolsUsed: extractToolsUsed(entries),
    recentMessages: extractRecentMessages(entries),
    timestamp: new Date().toISOString(),
    totalUserMessages: userMessageCount,
    totalToolCalls: toolCallCount,
    plans,
    assistantHighlights: extractAssistantHighlights(entries),
    decisions: extractDecisionPoints(entries),
    technologies: extractTechnologies(entries, filesModified),
    blockers: extractBlockers(entries),
  };
}

/**
 * Format handoff data into markdown document
 */
export function formatHandoffMarkdown(data: HandoffData): string {
  const lines: string[] = [];

  // Header
  lines.push("# Session Handoff");
  lines.push("");
  lines.push(`**Title:** ${data.title}`);
  lines.push(`**Project:** ${data.projectDir}`);
  lines.push(`**Generated:** ${data.timestamp}`);
  lines.push(`**Messages:** ${data.totalUserMessages} | **Tool calls:** ${data.totalToolCalls}`);
  lines.push("");

  // Files Modified
  lines.push("## Files Modified");
  if (data.filesModified.length > 0) {
    for (const file of data.filesModified) {
      lines.push(`- ${file}`);
    }
  } else {
    lines.push("_No files were modified in this session._");
  }
  lines.push("");

  // Tools Used
  lines.push("## Tools Used");
  if (data.toolsUsed.length > 0) {
    lines.push(data.toolsUsed.join(", "));
  } else {
    lines.push("_No tools were used in this session._");
  }
  lines.push("");

  // Plan Context
  if (data.plans && data.plans.length > 0) {
    lines.push("## Plan Context");
    if (data.plans.length === 1) {
      lines.push(`This session is implementing: **${data.plans[0].title}**`);
      lines.push(`Plan file: ${data.plans[0].path}`);
    } else {
      lines.push(`This session is implementing ${data.plans.length} plans:`);
      data.plans.forEach((plan, i) => {
        lines.push(`${i + 1}. **${plan.title}**`);
        lines.push(`   File: ${plan.path}`);
      });
    }
    lines.push("");
  }

  // Recent Context (last user messages)
  lines.push("## Recent Context");
  lines.push("");
  if (data.recentMessages.length > 0) {
    lines.push("Last user messages from the session:");
    lines.push("");
    for (let i = 0; i < data.recentMessages.length; i++) {
      const num = data.recentMessages.length - data.recentMessages.length + i + 1;
      lines.push(`${num}. ${data.recentMessages[i]}`);
    }
  } else {
    lines.push("_No user messages in this session._");
  }
  lines.push("");

  // Instructions for continuing
  lines.push("## How to Continue");
  lines.push("");
  lines.push("In a new Claude Code session, run `/jacques-continue` to load this handoff and resume work.");
  lines.push("");

  // Footer
  lines.push("---");
  lines.push("_Generated by Jacques Context Manager_");

  return lines.join("\n");
}

/**
 * Generate a handoff document from a transcript file
 */
export async function generateHandoffFromTranscript(
  transcriptPath: string,
  projectDir: string
): Promise<HandoffResult> {
  try {
    // Parse the JSONL file
    const entries = await parseJSONL(transcriptPath);

    // Extract handoff data
    const data = await extractHandoffData(entries, projectDir);

    // Format as markdown
    const content = formatHandoffMarkdown(data);

    // Ensure handoffs directory exists
    const handoffsDir = await ensureHandoffsDir(projectDir);

    // Generate filename
    const filename = generateHandoffFilename();
    const filePath = join(handoffsDir, filename);

    // Write the file
    await fs.writeFile(filePath, content, "utf-8");

    // Estimate tokens (~4.5 chars per token)
    const tokenEstimate = Math.ceil(content.length / 4.5);

    return {
      filePath,
      filename,
      content,
      tokenEstimate,
    };
  } catch (error) {
    // Re-throw with more context
    const errMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to generate handoff from ${transcriptPath}: ${errMsg}`
    );
  }
}

/**
 * Generate handoff from already-parsed entries (avoids re-parsing)
 */
export async function generateHandoffFromEntries(
  entries: ParsedEntry[],
  projectDir: string
): Promise<HandoffResult> {
  // Extract handoff data
  const data = await extractHandoffData(entries, projectDir);

  // Format as markdown
  const content = formatHandoffMarkdown(data);

  // Ensure handoffs directory exists
  const handoffsDir = await ensureHandoffsDir(projectDir);

  // Generate filename
  const filename = generateHandoffFilename();
  const filePath = join(handoffsDir, filename);

  // Write the file
  await fs.writeFile(filePath, content, "utf-8");

  // Estimate tokens (~4.5 chars per token)
  const tokenEstimate = Math.ceil(content.length / 4.5);

  return {
    filePath,
    filename,
    content,
    tokenEstimate,
  };
}

// ============================================================
// Skill Context Functions (for external/LLM-enhanced handoffs)
// ============================================================

/**
 * Result of compact context extraction for skill consumption
 */
export interface CompactContextResult {
  /** Formatted context string for LLM skill (~2k tokens) */
  context: string;
  /** Estimated token count for the context */
  tokenEstimate: number;
  /** Raw extracted data for reference */
  data: HandoffData;
}

/**
 * Format extracted handoff data as compact context for skill consumption.
 * This creates a structured prompt that maps to the 8 sections the
 * skill/orchestrator expects, but at ~2k tokens instead of 60k.
 */
export function formatAsSkillContext(data: HandoffData): string {
  const lines: string[] = [];

  lines.push("## Pre-Extracted Session Context");
  lines.push("");
  lines.push(
    "Use this extracted data to generate the handoff. The data has been pre-processed from the full conversation."
  );
  lines.push("");

  // Project Info
  lines.push("### Project Info");
  lines.push(`- **Project:** ${data.projectDir}`);
  lines.push(`- **Title:** ${data.title}`);
  if (data.technologies.length > 0) {
    lines.push(`- **Technologies:** ${data.technologies.join(", ")}`);
  }
  if (data.filesModified.length > 0) {
    lines.push(`- **Files Modified:**`);
    for (const file of data.filesModified.slice(0, 15)) {
      lines.push(`  - ${file}`);
    }
    if (data.filesModified.length > 15) {
      lines.push(`  - ... and ${data.filesModified.length - 15} more`);
    }
  }
  if (data.toolsUsed.length > 0) {
    lines.push(`- **Tools Used:** ${data.toolsUsed.join(", ")}`);
  }
  lines.push(`- **Total Messages:** ${data.totalUserMessages}`);
  lines.push(`- **Total Tool Calls:** ${data.totalToolCalls}`);
  lines.push("");

  // Plan Context (if any)
  if (data.plans && data.plans.length > 0) {
    lines.push("### Plan Context");
    for (const plan of data.plans) {
      lines.push(`- **${plan.title}** (${plan.path})`);
    }
    lines.push("");
  }

  // User Messages (chronological, last 10)
  lines.push("### User Messages (chronological, last 10)");
  const messages = extractRecentMessages(
    [],
    MAX_SKILL_CONTEXT_MESSAGES
  ); // Will be empty, use data.recentMessages instead
  // Use the data's recentMessages but with extended count
  if (data.recentMessages.length > 0) {
    data.recentMessages.forEach((m, i) => {
      lines.push(`${i + 1}. ${m}`);
    });
  } else {
    lines.push("_(No user messages recorded)_");
  }
  lines.push("");

  // Assistant Highlights
  lines.push("### Assistant Highlights (key responses)");
  if (data.assistantHighlights.length > 0) {
    for (const highlight of data.assistantHighlights) {
      lines.push(`- ${highlight}`);
    }
  } else {
    lines.push("_(No assistant highlights extracted)_");
  }
  lines.push("");

  // Detected Decisions
  lines.push("### Detected User Decisions");
  if (data.decisions.length > 0) {
    for (const decision of data.decisions) {
      lines.push(`- ${decision}`);
    }
  } else {
    lines.push(
      '_(Review user messages for decision patterns like "yes do that", "let\'s go with X")_'
    );
  }
  lines.push("");

  // Detected Blockers/Errors
  lines.push("### Detected Blockers/Errors");
  if (data.blockers.length > 0) {
    for (const blocker of data.blockers) {
      lines.push(`- ${blocker}`);
    }
  } else {
    lines.push("_(None detected - check assistant highlights for any issues)_");
  }
  lines.push("");

  // Instructions
  lines.push("---");
  lines.push(
    "Now follow the skill instructions to generate a ~1000 token handoff document from this context."
  );

  return lines.join("\n");
}

/**
 * Extract handoff data with extended user messages for skill context.
 * Uses more messages (10 instead of 5) for better LLM comprehension.
 */
async function extractHandoffDataForSkill(
  entries: ParsedEntry[],
  projectDir: string
): Promise<HandoffData> {
  const baseData = await extractHandoffData(entries, projectDir);

  // Override with extended message count for skill context
  const extendedMessages = extractRecentMessages(
    entries,
    MAX_SKILL_CONTEXT_MESSAGES
  );

  return {
    ...baseData,
    recentMessages: extendedMessages,
  };
}

/**
 * Get compact context for LLM skill consumption.
 * This is the main export for external interfaces like Dbook.
 *
 * Returns ~2k token context instead of sending 60k raw conversation.
 *
 * @param transcriptPath - Path to the JSONL transcript file
 * @param projectDir - Project directory path
 * @returns Compact context, token estimate, and raw data
 */
export async function getCompactContextForSkill(
  transcriptPath: string,
  projectDir: string
): Promise<CompactContextResult> {
  // Parse the JSONL file
  const entries = await parseJSONL(transcriptPath);

  // Extract handoff data with extended messages
  const data = await extractHandoffDataForSkill(entries, projectDir);

  // Format as compact context
  const context = formatAsSkillContext(data);

  // Estimate tokens (~4.5 chars per token)
  const tokenEstimate = Math.ceil(context.length / 4.5);

  return {
    context,
    tokenEstimate,
    data,
  };
}

/**
 * Get compact context from already-parsed entries (avoids re-parsing).
 *
 * @param entries - Already parsed JSONL entries
 * @param projectDir - Project directory path
 * @returns Compact context, token estimate, and raw data
 */
export async function getCompactContextFromEntries(
  entries: ParsedEntry[],
  projectDir: string
): Promise<CompactContextResult> {
  // Extract handoff data with extended messages
  const data = await extractHandoffDataForSkill(entries, projectDir);

  // Format as compact context
  const context = formatAsSkillContext(data);

  // Estimate tokens (~4.5 chars per token)
  const tokenEstimate = Math.ceil(context.length / 4.5);

  return {
    context,
    tokenEstimate,
    data,
  };
}
