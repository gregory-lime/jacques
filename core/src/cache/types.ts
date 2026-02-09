/**
 * Cache Module Types
 *
 * Shared interfaces and constants for session indexing.
 */

import * as path from "path";
import { homedir } from "os";
import { getClaudeProjectsDir, decodeProjectPath } from "../session/detector.js";

/** Claude projects directory (resolved via config/env) */
export const CLAUDE_PROJECTS_PATH = getClaudeProjectsDir();

/** Jacques cache directory */
export const JACQUES_CACHE_PATH = path.join(homedir(), ".jacques", "cache");

/** Session index filename */
export const SESSION_INDEX_FILE = "sessions-index.json";

/** Path to hidden projects file */
export const HIDDEN_PROJECTS_FILE = path.join(homedir(), ".jacques", "hidden-projects.json");

// Re-export for backwards compatibility (cache/index.ts exports this)
export { decodeProjectPath };

/**
 * Plan reference for session display
 */
export interface PlanRef {
  title: string;
  source: 'embedded' | 'write' | 'agent';
  /** All detection methods that found this plan (when deduplicated) */
  sources?: Array<'embedded' | 'write' | 'agent'>;
  messageIndex: number;
  filePath?: string;
  agentId?: string;
  catalogId?: string;
}

/**
 * Explore agent reference for session display
 */
export interface ExploreAgentRef {
  id: string;
  description: string;
  timestamp: string;
  /** Estimated total token cost (input + output) from subagent JSONL */
  tokenCost?: number;
}

/**
 * Web search reference for session display
 */
export interface WebSearchRef {
  query: string;
  resultCount: number;
  timestamp: string;
}

/**
 * Git repository info for a project path
 */
export interface GitInfo {
  repoRoot?: string;
  branch?: string;
  worktree?: string;
}

/**
 * Entry in the session index
 * Contains only metadata - content is read directly from JSONL
 */
export interface SessionEntry {
  /** Session UUID */
  id: string;
  /** Full path to JSONL file */
  jsonlPath: string;
  /** Decoded project path (e.g., "/Users/gole/Desktop/my-project") */
  projectPath: string;
  /** Project name (basename of project path) */
  projectSlug: string;
  /** Session title (from summary or first user message) */
  title: string;
  /** First timestamp in session */
  startedAt: string;
  /** Last timestamp in session */
  endedAt: string;
  /** Count of user + assistant messages */
  messageCount: number;
  /** Count of tool calls */
  toolCallCount: number;
  /** Whether user-visible subagents exist (excludes internal agents) */
  hasSubagents: boolean;
  /** User-visible subagent IDs (excludes prompt_suggestion, acompact) */
  subagentIds?: string[];
  /** Whether auto-compact occurred during this session */
  hadAutoCompact?: boolean;
  /** Timestamp when auto-compact occurred (ISO string) */
  autoCompactAt?: string;
  /** Token usage stats */
  tokens?: {
    /** Fresh input tokens (non-cached) */
    input: number;
    /** Output tokens generated */
    output: number;
    /** Tokens written to cache */
    cacheCreation: number;
    /** Tokens read from cache */
    cacheRead: number;
  };
  /** Canonical git repo root path (main worktree root, shared across all worktrees) */
  gitRepoRoot?: string;
  /** Git branch name at time of indexing */
  gitBranch?: string;
  /** Git worktree name (basename of project dir, only set for worktrees) */
  gitWorktree?: string;
  /** File size in bytes */
  fileSizeBytes: number;
  /** File modification time */
  modifiedAt: string;
  /** Session mode: 'planning' if EnterPlanMode tool was called, 'execution' if started with plan trigger */
  mode?: 'planning' | 'execution' | null;
  /** Number of plans detected in this session */
  planCount?: number;
  /** Plan references for display */
  planRefs?: Array<PlanRef>;
  /** Explore agent references */
  exploreAgents?: Array<ExploreAgentRef>;
  /** Web search references */
  webSearches?: Array<WebSearchRef>;
}

/**
 * Session index structure
 */
export interface SessionIndex {
  version: "2.0.0";
  lastScanned: string;
  sessions: SessionEntry[];
}

/**
 * Get default empty session index
 */
export function getDefaultSessionIndex(): SessionIndex {
  return {
    version: "2.0.0",
    lastScanned: new Date().toISOString(),
    sessions: [],
  };
}

/**
 * A discovered project, grouped by git repo root for git projects.
 * Non-git projects are standalone (one entry per directory).
 */
export interface DiscoveredProject {
  /** Display name — basename of gitRepoRoot, or projectSlug for non-git */
  name: string;
  /** Canonical git repo root path (null for non-git projects) */
  gitRepoRoot: string | null;
  /** Whether this is a git-based project */
  isGitProject: boolean;
  /** All decoded project paths that map to this project (multiple for worktrees) */
  projectPaths: string[];
  /** All encoded directory names in ~/.claude/projects/ */
  encodedPaths: string[];
  /** Total number of indexed sessions across all paths */
  sessionCount: number;
  /** Most recent session activity (ISO string), or null if no sessions */
  lastActivity: string | null;
}
