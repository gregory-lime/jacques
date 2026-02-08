/**
 * Search Indexer
 *
 * Builds and maintains a keyword inverted index for conversation search.
 */

import type {
  ConversationManifest,
  SearchIndex,
  IndexReference,
} from "./types.js";

/**
 * Words to exclude from keyword indexing.
 * Reduced from original 102 words to focus on actual stop words,
 * keeping tech-relevant verbs and terms that might be meaningful in searches.
 *
 * Removed from original: create, make, use, new, get, help, look, need, want
 * These can be meaningful in technical contexts (e.g., "create user", "use api", "get data")
 */
const STOP_WORDS = new Set([
  // Articles and determiners
  "a",
  "an",
  "the",
  // Pronouns
  "i",
  "you",
  "we",
  "he",
  "she",
  "it",
  "they",
  "them",
  "me",
  "my",
  "your",
  "our",
  "their",
  "its",
  // Prepositions
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "to",
  "with",
  "as",
  "about",
  // Conjunctions
  "and",
  "or",
  "but",
  "if",
  "so",
  // Common verbs (that don't carry meaning)
  "are",
  "be",
  "been",
  "is",
  "was",
  "has",
  "have",
  "had",
  "do",
  "does",
  "did",
  "done",
  "doing",
  "will",
  "would",
  "can",
  "could",
  "may",
  "might",
  "must",
  "should",
  // Other common words without technical meaning
  "that",
  "this",
  "what",
  "when",
  "where",
  "who",
  "which",
  "why",
  "how",
  "all",
  "there",
  "here",
  "not",
  "just",
  "also",
  "then",
  "now",
  "please",
  "thanks",
]);

/** Score weights by field type */
const FIELD_WEIGHTS: Record<string, number> = {
  title: 2.0,
  question: 1.5,
  tool: 1.2,      // Tools used (Read, Write, Bash, etc.)
  file: 1.0,
  tech: 1.0,
  subagent: 0.8,  // Subagent prompts
  snippet: 0.5,
};

/**
 * Tokenize text into keywords.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 2 && w.length <= 50)
    .filter((w) => !STOP_WORDS.has(w))
    .filter((w) => !/^\d+$/.test(w));
}

/**
 * Extract keywords from a file path.
 * "src/auth/jwt.ts" → ["src", "auth", "jwt", "ts"]
 */
export function extractPathKeywords(filePath: string): string[] {
  return filePath
    .split(/[\/\\\-_\.]/)
    .map((p) => p.toLowerCase())
    .filter((p) => p.length >= 2 && !STOP_WORDS.has(p));
}

/**
 * Extract all keywords from a manifest with field attribution.
 */
export function extractKeywordsWithFields(
  manifest: ConversationManifest
): Array<{ keyword: string; field: string; score: number }> {
  const results: Array<{ keyword: string; field: string; score: number }> = [];
  const seenKeywords = new Map<string, { field: string; score: number }>();

  // Helper to add keyword with deduplication (keep highest score)
  const addKeyword = (keyword: string, field: string) => {
    const score = FIELD_WEIGHTS[field] || 1.0;
    const existing = seenKeywords.get(keyword);
    if (!existing || existing.score < score) {
      seenKeywords.set(keyword, { field, score });
    }
  };

  // From title (highest weight)
  tokenize(manifest.title).forEach((w) => addKeyword(w, "title"));

  // From user questions (all of them, not limited)
  manifest.userQuestions.forEach((q) =>
    tokenize(q).forEach((w) => addKeyword(w, "question"))
  );

  // From tools used (meaningful for search - "used Bash", "used Write", etc.)
  manifest.toolsUsed.forEach((tool) => {
    // Add the tool name itself
    addKeyword(tool.toLowerCase(), "tool");
    // Also tokenize for compound names
    tokenize(tool).forEach((w) => addKeyword(w, "tool"));
  });

  // From file paths
  manifest.filesModified.forEach((f) =>
    extractPathKeywords(f).forEach((w) => addKeyword(w, "file"))
  );

  // Technologies (exact match)
  manifest.technologies.forEach((t) => addKeyword(t.toLowerCase(), "tech"));

  // From context snippets (increased from 5 to capture more)
  manifest.contextSnippets?.forEach((s) =>
    tokenize(s).forEach((w) => addKeyword(w, "snippet"))
  );

  // From subagent information if available
  if (manifest.subagents && manifest.subagents.ids.length > 0) {
    // Add "subagent" as a keyword so users can search for sessions with subagents
    addKeyword("subagent", "subagent");
    addKeyword("agent", "subagent");
    // Note: Full subagent prompts are stored separately and indexed when archived
  }

  // From plan references if available
  manifest.plans.forEach((plan) => {
    // Index plan names
    extractPathKeywords(plan.name).forEach((w) => addKeyword(w, "file"));
    addKeyword("plan", "file");
  });

  // Convert map to array
  for (const [keyword, { field, score }] of seenKeywords) {
    results.push({ keyword, field, score });
  }

  return results;
}

/**
 * Add a conversation to the search index.
 */
export function addToIndex(
  index: SearchIndex,
  manifest: ConversationManifest
): SearchIndex {
  // Extract keywords
  const keywordData = extractKeywordsWithFields(manifest);

  // Update inverted index
  for (const { keyword, field, score } of keywordData) {
    if (!index.keywords[keyword]) {
      index.keywords[keyword] = [];
    }

    // Check if this manifest is already indexed for this keyword
    const existingIdx = index.keywords[keyword].findIndex(
      (r) => r.id === manifest.id
    );

    const ref: IndexReference = {
      id: manifest.id,
      score,
      field,
    };

    if (existingIdx >= 0) {
      // Update if new score is higher
      if (index.keywords[keyword][existingIdx].score < score) {
        index.keywords[keyword][existingIdx] = ref;
      }
    } else {
      index.keywords[keyword].push(ref);
    }
  }

  // Update project info (keyed by projectId for uniqueness)
  const projectKey = manifest.projectId || manifest.projectSlug;
  if (!index.projects[projectKey]) {
    index.projects[projectKey] = {
      path: manifest.projectPath,
      conversationCount: 0,
      lastActivity: manifest.endedAt,
    };
  }

  const projectInfo = index.projects[projectKey];
  projectInfo.conversationCount++;

  // Update last activity if newer
  if (manifest.endedAt > projectInfo.lastActivity) {
    projectInfo.lastActivity = manifest.endedAt;
  }

  // Update metadata
  index.metadata.totalConversations++;
  index.metadata.totalKeywords = Object.keys(index.keywords).length;
  index.lastUpdated = new Date().toISOString();

  return index;
}

/**
 * Remove a conversation from the search index.
 * @param projectId The projectId (encoded path) or projectSlug for old data
 */
export function removeFromIndex(
  index: SearchIndex,
  manifestId: string,
  projectId: string
): SearchIndex {
  // Remove from keyword index
  for (const keyword of Object.keys(index.keywords)) {
    index.keywords[keyword] = index.keywords[keyword].filter(
      (r) => r.id !== manifestId
    );

    // Remove empty keyword entries
    if (index.keywords[keyword].length === 0) {
      delete index.keywords[keyword];
    }
  }

  // Update project info
  if (index.projects[projectId]) {
    index.projects[projectId].conversationCount--;

    // Remove project if no more conversations
    if (index.projects[projectId].conversationCount <= 0) {
      delete index.projects[projectId];
    }
  }

  // Update metadata
  index.metadata.totalConversations = Math.max(
    0,
    index.metadata.totalConversations - 1
  );
  index.metadata.totalKeywords = Object.keys(index.keywords).length;
  index.lastUpdated = new Date().toISOString();

  return index;
}

/**
 * Search the index for matching conversations.
 * Returns manifest IDs sorted by relevance score.
 */
export function searchIndex(
  index: SearchIndex,
  query: string
): Array<{ id: string; score: number }> {
  const queryKeywords = tokenize(query);

  if (queryKeywords.length === 0) {
    return [];
  }

  // Aggregate scores for each manifest
  const scores = new Map<string, number>();

  for (const keyword of queryKeywords) {
    const refs = index.keywords[keyword];
    if (!refs) continue;

    for (const ref of refs) {
      const currentScore = scores.get(ref.id) || 0;
      scores.set(ref.id, currentScore + ref.score);
    }
  }

  // Convert to array and sort by score
  const results: Array<{ id: string; score: number }> = [];
  for (const [id, score] of scores) {
    results.push({ id, score });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Get index statistics.
 */
export function getIndexStats(index: SearchIndex): {
  totalConversations: number;
  totalKeywords: number;
  totalProjects: number;
  averageKeywordsPerConversation: number;
} {
  const totalProjects = Object.keys(index.projects).length;
  const avgKeywords =
    index.metadata.totalConversations > 0
      ? index.metadata.totalKeywords / index.metadata.totalConversations
      : 0;

  return {
    totalConversations: index.metadata.totalConversations,
    totalKeywords: index.metadata.totalKeywords,
    totalProjects,
    averageKeywordsPerConversation: Math.round(avgKeywords * 10) / 10,
  };
}
