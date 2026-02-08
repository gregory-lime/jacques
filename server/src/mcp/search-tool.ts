/**
 * MCP Search Tool
 *
 * Implements the search_conversations tool for the MCP server.
 */

import { z } from "zod";
import { promises as fs } from "fs";
import * as path from "path";
import { homedir } from "os";

// ============================================================
// Types (duplicated from dashboard to avoid cross-package imports)
// ============================================================

interface ConversationManifest {
  id: string;
  projectId: string;
  projectSlug: string;
  projectPath: string;
  archivedAt: string;
  autoArchived: boolean;
  title: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  userQuestions: string[];
  filesModified: string[];
  toolsUsed: string[];
  technologies: string[];
  plans: Array<{ path: string; name: string; archivedPath: string }>;
  contextSnippets?: string[];
  messageCount: number;
  toolCallCount: number;
  userLabel?: string;
}

interface IndexReference {
  id: string;
  score: number;
  field: string;
}

interface SearchIndex {
  version: string;
  lastUpdated: string;
  keywords: { [keyword: string]: IndexReference[] };
  projects: {
    [projectId: string]: {
      path: string;
      conversationCount: number;
      lastActivity: string;
    };
  };
  metadata: {
    totalConversations: number;
    totalKeywords: number;
  };
}

interface SearchResult {
  rank: number;
  id: string;
  score: number;
  title: string;
  project: string;
  date: string;
  preview: string;
  filesModified: string[];
  technologies: string[];
  messageCount: number;
  durationMinutes: number;
}

interface SearchOutput {
  query: string;
  filters: {
    project?: string;
    dateFrom?: string;
    dateTo?: string;
    technologies?: string[];
  };
  totalMatches: number;
  showing: { from: number; to: number };
  hasMore: boolean;
  results: SearchResult[];
}

// ============================================================
// Tool Schema
// ============================================================

export const searchConversationsSchema = z.object({
  query: z.string().describe("Keywords to search for in archived conversations"),
  project: z.string().optional().describe("Filter by project slug (e.g., 'my-project')"),
  dateFrom: z.string().optional().describe("Filter conversations from this date (ISO format: YYYY-MM-DD)"),
  dateTo: z.string().optional().describe("Filter conversations up to this date (ISO format: YYYY-MM-DD)"),
  technologies: z.array(z.string()).optional().describe("Filter by technologies (e.g., ['react', 'typescript'])"),
  limit: z.number().min(1).max(50).default(10).describe("Maximum number of results (default: 10, max: 50)"),
  offset: z.number().min(0).default(0).describe("Pagination offset (default: 0)"),
});

export type SearchConversationsInput = z.infer<typeof searchConversationsSchema>;

// ============================================================
// Constants
// ============================================================

const GLOBAL_ARCHIVE_PATH = path.join(homedir(), ".jacques", "archive");
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "by", "for", "from",
  "has", "he", "in", "is", "it", "its", "of", "on", "that", "the", "to",
  "was", "will", "with", "this", "but", "they", "have", "had", "what",
  "when", "where", "who", "which", "why", "how", "all", "would", "there",
  "their", "or", "if", "can", "may", "could", "should", "might", "must",
  "do", "does", "did", "done", "doing", "i", "you", "we", "them", "your",
  "our", "my", "not", "just", "about", "here", "first", "create", "make",
  "let", "me", "see", "also", "so", "then", "now", "new", "get", "use",
  "want", "need", "please", "thanks", "help", "like", "know", "think", "look",
]);

// ============================================================
// Helper Functions
// ============================================================

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 2 && w.length <= 50)
    .filter((w) => !STOP_WORDS.has(w))
    .filter((w) => !/^\d+$/.test(w));
}

async function readIndex(): Promise<SearchIndex> {
  try {
    const indexPath = path.join(GLOBAL_ARCHIVE_PATH, "index.json");
    const content = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(content) as SearchIndex;
  } catch {
    return {
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
      keywords: {},
      projects: {},
      metadata: { totalConversations: 0, totalKeywords: 0 },
    };
  }
}

async function readManifest(id: string): Promise<ConversationManifest | null> {
  try {
    const manifestPath = path.join(GLOBAL_ARCHIVE_PATH, "manifests", `${id}.json`);
    const content = await fs.readFile(manifestPath, "utf-8");
    return JSON.parse(content) as ConversationManifest;
  } catch {
    return null;
  }
}

function searchIndexKeywords(
  index: SearchIndex,
  query: string
): Array<{ id: string; score: number }> {
  const queryKeywords = tokenize(query);

  if (queryKeywords.length === 0) {
    return [];
  }

  const scores = new Map<string, number>();

  for (const keyword of queryKeywords) {
    const refs = index.keywords[keyword];
    if (!refs) continue;

    for (const ref of refs) {
      const currentScore = scores.get(ref.id) || 0;
      scores.set(ref.id, currentScore + ref.score);
    }
  }

  const results: Array<{ id: string; score: number }> = [];
  for (const [id, score] of scores) {
    results.push({ id, score });
  }

  return results.sort((a, b) => b.score - a.score);
}

// ============================================================
// Main Search Function
// ============================================================

export async function searchConversations(
  input: SearchConversationsInput
): Promise<SearchOutput> {
  const index = await readIndex();

  // Get initial results from index
  const indexResults = searchIndexKeywords(index, input.query);

  // Load manifests and apply filters
  const filteredResults: Array<{
    manifest: ConversationManifest;
    score: number;
  }> = [];

  for (const { id, score } of indexResults) {
    const manifest = await readManifest(id);
    if (!manifest) continue;

    // Apply filters (support both projectId and projectSlug for backward compat)
    if (input.project && manifest.projectId !== input.project && manifest.projectSlug !== input.project) {
      continue;
    }

    if (input.dateFrom && manifest.endedAt < input.dateFrom) {
      continue;
    }

    if (input.dateTo && manifest.endedAt > input.dateTo) {
      continue;
    }

    if (input.technologies && input.technologies.length > 0) {
      const hasTech = input.technologies.some((t) =>
        manifest.technologies.includes(t.toLowerCase())
      );
      if (!hasTech) continue;
    }

    filteredResults.push({ manifest, score });
  }

  // Apply pagination
  const limit = Math.min(input.limit || 10, 50);
  const offset = input.offset || 0;
  const totalMatches = filteredResults.length;
  const paginatedResults = filteredResults.slice(offset, offset + limit);

  // Transform to SearchResult format
  const results: SearchResult[] = paginatedResults.map(
    ({ manifest, score }, idx) => ({
      rank: offset + idx + 1,
      id: manifest.id,
      score,
      title: manifest.title,
      project: manifest.projectSlug,
      date: manifest.endedAt.split("T")[0],
      preview: manifest.userQuestions[0] || "",
      filesModified: manifest.filesModified.slice(0, 5),
      technologies: manifest.technologies,
      messageCount: manifest.messageCount,
      durationMinutes: manifest.durationMinutes,
    })
  );

  return {
    query: input.query,
    filters: {
      project: input.project,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      technologies: input.technologies,
    },
    totalMatches,
    showing: {
      from: totalMatches > 0 ? offset + 1 : 0,
      to: Math.min(offset + limit, totalMatches),
    },
    hasMore: offset + limit < totalMatches,
    results,
  };
}

// ============================================================
// Tool Handler
// ============================================================

export async function handleSearchConversations(
  args: unknown
): Promise<string> {
  // Parse and validate input
  const parsed = searchConversationsSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({
      error: "Invalid input",
      details: parsed.error.issues,
    });
  }

  const result = await searchConversations(parsed.data);
  return JSON.stringify(result, null, 2);
}
