# Context Keeper Analysis

Reference documentation for implementing conversation search & indexing in Jacques.
Based on analysis of https://github.com/Capnjbrown/c0ntextKeeper

**Date**: 2026-01-31
**Purpose**: Provide battle-tested patterns for cross-project conversation search

---

## Overview

Context Keeper uses a **keyword-based inverted index with substring matching**:
- No embeddings, no vector DB, no API costs
- Simple but effective: O(1) keyword lookups
- Search latency: <10ms

---

## Architecture

```
~/.c0ntextkeeper/
├── config.json
└── archive/
    └── projects/
        └── [project-name]/
            ├── sessions/
            │   └── [session-id].json    # Extracted context
            └── search-index.json        # Inverted keyword index
```

---

## 1. Context Extraction (`extractor.ts`)

### Problem Indicators

```typescript
const problemIndicators = [
  // Error-related
  "error", "issue", "problem", "bug", "crash", "exception", "failed", "failing",
  "broken", "wrong", "incorrect", "undefined", "null", "nan", "invalid", "missing",
  "timeout", "404", "500", "503", "cors",

  // Debugging
  "debug", "fix", "solve", "troubleshoot", "diagnose", "not working",
  "doesn't work", "won't work", "stopped working",

  // Questions
  "why", "how do", "how can", "how to", "how should", "what is", "what are",
  "what should", "what would", "where is", "where are", "where do", "where should",
  "when should", "when do", "when to", "which", "who", "whose",

  // Common dev tasks
  "implement", "create", "build", "develop", "add", "integrate", "setup",
  "configure", "install", "migrate", "upgrade", "update", "refactor",
  "optimize", "improve", "enhance", "extend",

  // Architecture & design
  "design", "architect", "structure", "organize", "pattern", "approach",
  "strategy", "best practice",

  // Testing & deployment
  "test", "deploy", "publish", "release", "launch", "ci/cd", "pipeline",
  "workflow", "automation",

  // Documentation & understanding
  "explain", "understand", "clarify", "document", "confused", "unclear",
  "stuck", "lost",

  // Security & performance
  "secure", "vulnerability", "authentication", "authorization", "performance",
  "slow", "optimize", "memory leak",

  // Data & API
  "database", "api", "endpoint", "query", "fetch", "store", "retrieve",
  "parse", "transform",

  // UI/UX
  "display", "render", "style", "layout", "responsive", "accessibility",
  "user experience", "interface",
];
```

### Request Indicators

```typescript
const requestIndicators = [
  // Polite requests
  "can you", "could you", "would you", "will you", "please", "kindly",
  "help me", "assist me",

  // Direct requests
  "i need", "i want", "i'd like", "i would like", "i'm trying",
  "i'm attempting", "i'm looking",

  // Imperative requests
  "show me", "tell me", "teach me", "guide me", "walk me through", "explain to me",

  // Planning requests
  "let's", "we should", "we need to", "we must", "shall we", "should we",

  // Seeking advice
  "recommend", "suggest", "advise", "propose", "what's the best", "which is better",

  // Common dev requests
  "prepare", "convert", "transform", "translate", "extract", "analyze", "review", "check",
];
```

### Solution Indicators

```typescript
const solutionIndicators = [
  "here's how", "the solution", "to fix this", "this works", "resolved",
  "solved", "the answer", "you can", "let me", "i'll", "i will",
  "i'm going to", "let's", "we can", "we should", "try", "use",
  "add", "change", "update", "modify", "create", "implement",
];
```

### Decision Patterns (Regex)

```typescript
const decisionPatterns = [
  /we should (\w+.*)/gi,
  /better to (\w+.*)/gi,
  /i recommend (\w+.*)/gi,
  /the approach is to (\w+.*)/gi,
  /decided to (\w+.*)/gi,
  /going with (\w+.*)/gi,
  /choosing (\w+.*)/gi,
];
```

### Pattern Detection Functions

```typescript
function isProblemIndicator(content: string): boolean {
  const contentStr = typeof content === "string" ? content : JSON.stringify(content);
  const lowerContent = contentStr.toLowerCase();

  // Questions always indicate problems to solve
  if (contentStr.includes("?")) return true;

  // Check for problem or request indicators
  return (
    problemIndicators.some((ind) => lowerContent.includes(ind)) ||
    requestIndicators.some((ind) => lowerContent.includes(ind))
  );
}

function isSolutionIndicator(content: string): boolean {
  const contentStr = typeof content === "string" ? content : JSON.stringify(content);
  const lowerContent = contentStr.toLowerCase();

  // Any response with code blocks is likely a solution
  if (contentStr.includes("```")) return true;

  return solutionIndicators.some((ind) => lowerContent.includes(ind));
}
```

### Helper Functions

```typescript
function extractTags(content: string | any): string[] {
  const tags: string[] = [];
  const contentStr = typeof content === "string" ? content : JSON.stringify(content);
  const techPatterns =
    /\b(react|typescript|javascript|node|python|api|database|css|html|json|yaml|docker|kubernetes|aws|git)\b/gi;
  const matches = contentStr.match(techPatterns);
  if (matches) {
    tags.push(...matches.map((m) => m.toLowerCase()));
  }
  return [...new Set(tags)];
}

function assessImpact(decision: string): "high" | "medium" | "low" {
  const highImpact = ["architecture", "database", "api", "security", "framework"];
  const mediumImpact = ["refactor", "optimize", "structure", "design"];

  const lowerDecision = decision.toLowerCase();

  if (highImpact.some((term) => lowerDecision.includes(term))) return "high";
  if (mediumImpact.some((term) => lowerDecision.includes(term))) return "medium";
  return "low";
}

function normalizeCommand(command: string): string {
  return command
    .replace(/\/[^\s]+/g, "<path>")
    .replace(/\d+/g, "<number>")
    .slice(0, 50);
}

function isTrivialCommand(command: string): boolean {
  const trivialCommands = ["ls", "pwd", "cd", "echo", "cat"];
  const firstWord = command.split(" ")[0];
  return trivialCommands.includes(firstWord);
}

function classifyError(error: string): string | null {
  if (error.includes("permission")) return "permission";
  if (error.includes("not found")) return "not-found";
  if (error.includes("syntax")) return "syntax";
  if (error.includes("type")) return "type-error";
  if (error.includes("undefined") || error.includes("null")) return "null-reference";
  return null;
}
```

---

## 2. Search Indexer (`indexer.ts`)

### Interfaces

```typescript
interface SearchIndex {
  version: string;
  lastUpdated: string;
  projectName: string;
  sessions: {
    [sessionId: string]: SessionIndexEntry;
  };
  keywords: {
    [keyword: string]: string[]; // keyword -> array of sessionIds
  };
  metadata: {
    totalSessions: number;
    totalKeywords: number;
    avgKeywordsPerSession: number;
  };
}

interface SessionIndexEntry {
  sessionId: string;
  timestamp: string;
  keywords: string[];
  relevance: number;
  problemCount: number;
  implementationCount: number;
  decisionCount: number;
  toolsUsed: string[];
  filesModified: string[];
  summary: string;
}

interface SearchResult {
  sessionId: string;
  score: number;
  timestamp: string;
  summary: string;
  metadata: {
    problemCount: number;
    toolsUsed: string[];
    filesModified: string[];
    relevance: number;
  };
}
```

### Stop Words (59)

```typescript
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "by", "for", "from",
  "has", "he", "in", "is", "it", "its", "of", "on", "that", "the", "to",
  "was", "will", "with", "the", "this", "but", "they", "have", "had",
  "what", "when", "where", "who", "which", "why", "how", "all", "would",
  "there", "their", "or", "if", "can", "may", "could", "should", "would",
  "might", "must", "shall", "will", "do", "does", "did", "done", "doing",
  "i", "you", "he", "she", "we", "they", "them", "your", "our", "my",
]);
```

### Keyword Extraction

```typescript
private maxKeywordLength = 50;
private minKeywordLength = 2;
private maxKeywordsPerSession = 500;

private extractKeywords(text: string): string[] {
  if (!text) return [];

  // Convert to lowercase and split on non-word characters
  const words = text.toLowerCase().split(/\W+/);
  const keywords = new Set<string>();

  for (const word of words) {
    // Skip if too short or too long
    if (word.length < this.minKeywordLength || word.length > this.maxKeywordLength) {
      continue;
    }

    // Skip stop words
    if (STOP_WORDS.has(word)) {
      continue;
    }

    // Skip numbers
    if (/^\d+$/.test(word)) {
      continue;
    }

    keywords.add(word);

    // Limit keywords per session
    if (keywords.size >= this.maxKeywordsPerSession) {
      break;
    }
  }

  return Array.from(keywords);
}
```

### Search Function

```typescript
async search(query: string, limit = 10): Promise<SearchResult[]> {
  const index = await this.loadIndex();
  const queryKeywords = this.extractKeywords(query);

  if (queryKeywords.length === 0) {
    return [];
  }

  // Score sessions by keyword matches
  const sessionScores = new Map<string, number>();

  for (const keyword of queryKeywords) {
    const sessions = index.keywords[keyword] || [];
    for (const sessionId of sessions) {
      const currentScore = sessionScores.get(sessionId) || 0;
      sessionScores.set(sessionId, currentScore + 1);
    }
  }

  // Sort by score and convert to results
  const results: SearchResult[] = Array.from(sessionScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([sessionId, score]) => {
      const session = index.sessions[sessionId];
      return {
        sessionId,
        score: score / queryKeywords.length, // Normalize score
        timestamp: session.timestamp,
        summary: session.summary,
        metadata: {
          problemCount: session.problemCount,
          toolsUsed: session.toolsUsed,
          filesModified: session.filesModified,
          relevance: session.relevance,
        },
      };
    });

  return results;
}
```

### Atomic Save

```typescript
private async saveIndex(): Promise<void> {
  // Write atomically using temp file
  const tempPath = this.indexPath + ".tmp";
  fs.writeFileSync(tempPath, JSON.stringify(this.index, null, 2));
  fs.renameSync(tempPath, this.indexPath);
}
```

---

## 3. Relevance Scorer (`scorer.ts`)

### Scoring Weights

```typescript
const weights = {
  codeChanges: 0.8,
  errorResolution: 0.7,
  decisions: 0.6,
  problemSolution: 0.6,
  toolComplexity: 0.4,
  userEngagement: 0.3,
};
```

### Score Entry Function

```typescript
scoreEntry(entry: TranscriptEntry): number {
  // CRITICAL: User messages should score high relevance
  if (entry.type === "user" && entry.message?.content) {
    const contentStr = typeof entry.message.content === "string"
      ? entry.message.content
      : JSON.stringify(entry.message.content);
    const lowerContent = contentStr.toLowerCase();

    // Any user message with a question mark gets maximum relevance
    if (contentStr.includes("?")) {
      return 1.0;
    }

    // User requests and commands get high relevance
    const requestIndicators = [
      "implement", "create", "build", "add", "fix", "refactor", "optimize",
      "migrate", "deploy", "write", "test", "setup", "configure", "install",
      "document", "explain", "help", "debug", "solve",
    ];

    if (requestIndicators.some((ind) => lowerContent.includes(ind))) {
      return 0.9;
    }

    // Problem statements get high relevance
    const problemIndicators = [
      "error", "issue", "problem", "broken", "crash", "fail", "wrong", "bug",
      "doesn't work", "not working", "confused", "stuck", "slow", "vulnerability", "leak",
    ];

    if (problemIndicators.some((ind) => lowerContent.includes(ind))) {
      return 0.9;
    }
  }

  let score = 0;
  const factors = this.extractFactors(entry);

  if (factors.hasCodeChanges) score += this.weights.codeChanges;
  if (factors.hasErrorResolution) score += this.weights.errorResolution;
  if (factors.hasDecision) score += this.weights.decisions;
  if (factors.hasProblemSolution) score += this.weights.problemSolution;

  score += factors.toolComplexity * this.weights.toolComplexity;
  score += factors.userEngagement * this.weights.userEngagement;

  return Math.min(score, 1);
}
```

### Tool Complexity

```typescript
private calculateToolComplexity(toolName: string, input: any): number {
  let complexity = 0;

  switch (toolName) {
    case "MultiEdit":
      complexity = 0.8;
      if (input?.edits && Array.isArray(input.edits)) {
        complexity = Math.min(0.5 + input.edits.length * 0.1, 1);
      }
      break;

    case "Write":
      complexity = 0.7;
      if (input?.content && input.content.length > 1000) {
        complexity = 0.9;
      }
      break;

    case "Edit":
      complexity = 0.6;
      if (input?.old_string && input.old_string.length > 100) {
        complexity = 0.7;
      }
      break;

    case "NotebookEdit":
      complexity = 0.7;
      break;

    case "TodoWrite":
      complexity = 0.5;
      if (input?.todos && Array.isArray(input.todos)) {
        complexity = Math.min(0.5 + input.todos.length * 0.05, 0.8);
      }
      break;

    case "Bash":
      complexity = 0.4;
      if (input?.command && input.command.includes("git")) {
        complexity = 0.5;
      }
      break;

    case "Grep":
    case "Search":
      complexity = 0.3;
      if (input?.pattern && input.pattern.length > 20) {
        complexity = 0.4;
      }
      break;

    default:
      complexity = 0.3;
  }

  return complexity;
}
```

### Temporal Decay

```typescript
calculateTemporalDecay(timestamp: string, referenceTime?: Date): number {
  const entryTime = new Date(timestamp).getTime();
  const refTime = (referenceTime || new Date()).getTime();
  const ageInDays = (refTime - entryTime) / (1000 * 60 * 60 * 24);

  // Exponential decay with half-life of 30 days
  const halfLife = 30;
  return Math.exp((-0.693 * ageInDays) / halfLife);
}
```

### Decision & Explanation Indicators

```typescript
private containsDecisionIndicators(content: string): boolean {
  const indicators = [
    "should we", "better to", "recommend", "suggest", "approach", "strategy",
    "decision", "choose", "prefer", "optimal", "best practice",
  ];
  return indicators.some((indicator) => content.includes(indicator));
}

private containsExplanationIndicators(content: string): boolean {
  const indicators = [
    "because", "reason", "since", "therefore", "this means", "this allows",
    "the purpose", "in order to", "so that", "which enables",
  ];
  return indicators.some((indicator) => content.toLowerCase().includes(indicator));
}
```

---

## 4. Extracted Context Types

```typescript
interface ExtractedContext {
  sessionId: string;
  projectPath: string;
  timestamp: string;
  extractedAt: "preCompact" | "sessionEnd";

  problems: Problem[];
  implementations: Implementation[];
  decisions: Decision[];
  patterns: Pattern[];

  metadata: {
    entryCount: number;
    duration: number;
    toolsUsed: string[];
    toolCounts: Record<string, number>;
    filesModified: string[];
    relevanceScore: number;
    extractionVersion: string;
  };
}

interface Problem {
  id: string;
  question: string;
  timestamp: string;
  solution?: Solution;
  tags: string[];
  relevance: number;
}

interface Solution {
  approach: string;
  files: string[];
  successful: boolean;
}

interface Implementation {
  id: string;
  tool: string;
  file: string;
  description: string;
  timestamp: string;
  relevance: number;
  changes?: CodeChange[];
}

interface Decision {
  id: string;
  decision: string;
  context: string;
  rationale: string;
  timestamp: string;
  impact: "high" | "medium" | "low";
  tags: string[];
}

interface Pattern {
  id: string;
  type: "command" | "code" | "error-handling";
  value: string;
  frequency: number;
  firstSeen: string;
  lastSeen: string;
  examples: string[];
}
```

---

## 5. Key Insights

### Pattern Matching is Simple

No stemming or lemmatization needed. Simple substring matching works because:
- "fix" matches "fixed", "fixes", "fixing"
- "error" matches "errors", "error-handling", "TypeError"

```typescript
function matchesPattern(content: string, patterns: string[]): boolean {
  const lower = content.toLowerCase();
  return patterns.some(pattern => lower.includes(pattern));
}
```

### Questions Get Maximum Relevance

Any content with `?` gets `1.0` relevance. This is the most important pattern.

### Temporal Decay is Exponential

30-day half-life means:
- After 30 days: 50% relevance
- After 60 days: 25% relevance
- After 90 days: 12.5% relevance

### Atomic Writes Prevent Corruption

Always write to `.tmp` file first, then rename. This prevents partial writes.

---

## 6. Cost Analysis

| Component | Cost |
|-----------|------|
| Embedding API | $0 (none) |
| Vector DB | $0 (none) |
| Storage | Local JSON files |
| Search | In-memory, <10ms |

**Total: $0**

---

## 7. Implementation for Jacques

### Proposed Storage Path

```
~/.jacques/
├── config.json
└── archive/
    └── projects/
        └── [project-name]/
            ├── sessions/
            │   └── [session-id].json
            └── search-index.json
```

### Files to Create

| File | Purpose |
|------|---------|
| `server/src/context-extractor.ts` | Extract semantic patterns |
| `server/src/search-indexer.ts` | Build inverted index |
| `server/src/relevance-scorer.ts` | Relevance scoring |
| `server/src/archive-store.ts` | File storage management |

### Hook Trigger

Archive on `SessionEnd` hook automatically.

### CLI Commands

```bash
jacques search "authentication jwt"              # Global search
jacques search "authentication" --project my-api # Project-scoped
jacques index                                    # Rebuild all indexes
```

---

## Source

All code in this document is extracted from:
https://github.com/Capnjbrown/c0ntextKeeper

Files analyzed:
- `src/core/extractor.ts`
- `src/core/indexer.ts`
- `src/core/scorer.ts`
- `src/core/types.ts`
