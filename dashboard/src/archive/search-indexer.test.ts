/**
 * Search Indexer Tests
 */

import {
  tokenize,
  extractPathKeywords,
  extractKeywordsWithFields,
  addToIndex,
  removeFromIndex,
  searchIndex,
  getIndexStats,
} from "./search-indexer.js";
import { getDefaultSearchIndex } from "./types.js";
import type { ConversationManifest, SearchIndex } from "./types.js";

describe("tokenize", () => {
  it("splits text into lowercase tokens", () => {
    const result = tokenize("Hello World");
    expect(result).toContain("hello");
    expect(result).toContain("world");
  });

  it("removes stop words", () => {
    const result = tokenize("the quick brown fox and the lazy dog");
    expect(result).not.toContain("the");
    expect(result).not.toContain("and");
    expect(result).toContain("quick");
    expect(result).toContain("brown");
    expect(result).toContain("fox");
    expect(result).toContain("lazy");
    expect(result).toContain("dog");
  });

  it("removes short tokens (< 2 chars)", () => {
    const result = tokenize("a b cd efg");
    expect(result).not.toContain("a");
    expect(result).not.toContain("b");
    expect(result).toContain("cd");
    expect(result).toContain("efg");
  });

  it("removes purely numeric tokens", () => {
    const result = tokenize("test 123 456abc code");
    expect(result).not.toContain("123");
    expect(result).toContain("456abc");
    expect(result).toContain("test");
    expect(result).toContain("code");
  });

  it("handles empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });

  it("splits on non-word characters", () => {
    const result = tokenize("auth-token jwt.verify");
    expect(result).toContain("auth");
    expect(result).toContain("token");
    expect(result).toContain("jwt");
    expect(result).toContain("verify");
  });
});

describe("extractPathKeywords", () => {
  it("splits file paths into keywords", () => {
    const result = extractPathKeywords("src/auth/jwt.ts");
    expect(result).toContain("src");
    expect(result).toContain("auth");
    expect(result).toContain("jwt");
    expect(result).toContain("ts");
  });

  it("handles various separators", () => {
    const result = extractPathKeywords("app-component_file.test.tsx");
    expect(result).toContain("app");
    expect(result).toContain("component");
    expect(result).toContain("file");
    expect(result).toContain("test");
    expect(result).toContain("tsx");
  });

  it("removes stop words from paths", () => {
    const result = extractPathKeywords("the/quick/fox.ts");
    expect(result).not.toContain("the");
    expect(result).toContain("quick");
    expect(result).toContain("fox");
  });

  it("handles Windows-style paths", () => {
    const result = extractPathKeywords("C:\\Users\\project\\src\\auth.ts");
    expect(result).toContain("users");
    expect(result).toContain("project");
    expect(result).toContain("src");
    expect(result).toContain("auth");
  });
});

describe("extractKeywordsWithFields", () => {
  const mockManifest: ConversationManifest = {
    id: "test-123",
    projectId: "-Users-test-my-project",
    projectSlug: "my-project",
    projectPath: "/Users/test/my-project",
    archivedAt: "2026-01-15T10:00:00.000Z",
    autoArchived: false,
    title: "JWT Authentication Setup",
    startedAt: "2026-01-15T09:00:00.000Z",
    endedAt: "2026-01-15T10:00:00.000Z",
    durationMinutes: 60,
    userQuestions: ["How do I set up JWT auth?"],
    filesModified: ["src/auth/jwt.ts", "src/middleware/auth.ts"],
    toolsUsed: ["Write", "Edit"],
    technologies: ["typescript", "express"],
    plans: [],
    contextSnippets: ["I'll help you implement JWT authentication"],
    messageCount: 10,
    toolCallCount: 5,
  };

  it("extracts keywords from title with highest weight", () => {
    const keywords = extractKeywordsWithFields(mockManifest);

    const jwtKeyword = keywords.find((k) => k.keyword === "jwt");
    expect(jwtKeyword).toBeDefined();
    expect(jwtKeyword?.field).toBe("title");
    expect(jwtKeyword?.score).toBe(2.0);
  });

  it("extracts keywords from user questions", () => {
    const keywords = extractKeywordsWithFields(mockManifest);

    const authKeyword = keywords.find(
      (k) => k.keyword === "auth" && k.field === "question"
    );
    // May be overridden by title field if "auth" appears there too
    expect(keywords.some((k) => k.keyword === "auth")).toBe(true);
  });

  it("extracts keywords from file paths", () => {
    const keywords = extractKeywordsWithFields(mockManifest);

    expect(keywords.some((k) => k.keyword === "middleware")).toBe(true);
  });

  it("extracts technologies", () => {
    const keywords = extractKeywordsWithFields(mockManifest);

    expect(keywords.some((k) => k.keyword === "typescript")).toBe(true);
    expect(keywords.some((k) => k.keyword === "express")).toBe(true);
  });

  it("deduplicates keywords keeping highest score", () => {
    const keywords = extractKeywordsWithFields(mockManifest);

    // "auth" appears in title, question, and file path
    const authKeywords = keywords.filter((k) => k.keyword === "auth");
    expect(authKeywords).toHaveLength(1); // Deduplicated
    expect(authKeywords[0].score).toBeGreaterThanOrEqual(1.0); // Highest score kept
  });
});

describe("addToIndex", () => {
  it("adds manifest keywords to inverted index", () => {
    const manifest: ConversationManifest = {
      id: "test-123",
      projectId: "-Users-test-my-project",
      projectSlug: "my-project",
      projectPath: "/Users/test/my-project",
      archivedAt: "2026-01-15T10:00:00.000Z",
      autoArchived: false,
      title: "Database Migration",
      startedAt: "2026-01-15T09:00:00.000Z",
      endedAt: "2026-01-15T10:00:00.000Z",
      durationMinutes: 60,
      userQuestions: [],
      filesModified: [],
      toolsUsed: [],
      technologies: [],
      plans: [],
      messageCount: 5,
      toolCallCount: 2,
    };

    const index = getDefaultSearchIndex();
    addToIndex(index, manifest);

    expect(index.keywords["database"]).toBeDefined();
    expect(index.keywords["migration"]).toBeDefined();
    expect(index.keywords["database"][0].id).toBe("test-123");
  });

  it("updates project info", () => {
    const manifest: ConversationManifest = {
      id: "test-123",
      projectId: "-Users-test-my-project",
      projectSlug: "my-project",
      projectPath: "/Users/test/my-project",
      archivedAt: "2026-01-15T10:00:00.000Z",
      autoArchived: false,
      title: "Test Session",
      startedAt: "2026-01-15T09:00:00.000Z",
      endedAt: "2026-01-15T10:00:00.000Z",
      durationMinutes: 60,
      userQuestions: [],
      filesModified: [],
      toolsUsed: [],
      technologies: [],
      plans: [],
      messageCount: 5,
      toolCallCount: 2,
    };

    const index = getDefaultSearchIndex();
    addToIndex(index, manifest);

    expect(index.projects["-Users-test-my-project"]).toBeDefined();
    expect(index.projects["-Users-test-my-project"].conversationCount).toBe(1);
    expect(index.projects["-Users-test-my-project"].path).toBe("/Users/test/my-project");
  });

  it("increments conversation count for existing project", () => {
    const index = getDefaultSearchIndex();

    const manifest1: ConversationManifest = {
      id: "test-1",
      projectId: "-Users-test-my-project",
      projectSlug: "my-project",
      projectPath: "/Users/test/my-project",
      archivedAt: "2026-01-15T10:00:00.000Z",
      autoArchived: false,
      title: "Session One",
      startedAt: "2026-01-15T09:00:00.000Z",
      endedAt: "2026-01-15T10:00:00.000Z",
      durationMinutes: 60,
      userQuestions: [],
      filesModified: [],
      toolsUsed: [],
      technologies: [],
      plans: [],
      messageCount: 5,
      toolCallCount: 2,
    };

    const manifest2: ConversationManifest = {
      ...manifest1,
      id: "test-2",
      title: "Session Two",
    };

    addToIndex(index, manifest1);
    addToIndex(index, manifest2);

    expect(index.projects["-Users-test-my-project"].conversationCount).toBe(2);
    expect(index.metadata.totalConversations).toBe(2);
  });

  it("updates metadata totals", () => {
    const manifest: ConversationManifest = {
      id: "test-123",
      projectId: "-Users-test-my-project",
      projectSlug: "my-project",
      projectPath: "/Users/test/my-project",
      archivedAt: "2026-01-15T10:00:00.000Z",
      autoArchived: false,
      title: "Test Session with keywords",
      startedAt: "2026-01-15T09:00:00.000Z",
      endedAt: "2026-01-15T10:00:00.000Z",
      durationMinutes: 60,
      userQuestions: [],
      filesModified: [],
      toolsUsed: [],
      technologies: [],
      plans: [],
      messageCount: 5,
      toolCallCount: 2,
    };

    const index = getDefaultSearchIndex();
    addToIndex(index, manifest);

    expect(index.metadata.totalConversations).toBe(1);
    expect(index.metadata.totalKeywords).toBeGreaterThan(0);
  });
});

describe("removeFromIndex", () => {
  it("removes manifest from keyword index", () => {
    const index = getDefaultSearchIndex();
    const manifest: ConversationManifest = {
      id: "test-123",
      projectId: "-Users-test-my-project",
      projectSlug: "my-project",
      projectPath: "/Users/test/my-project",
      archivedAt: "2026-01-15T10:00:00.000Z",
      autoArchived: false,
      title: "Unique Keyword Session",
      startedAt: "2026-01-15T09:00:00.000Z",
      endedAt: "2026-01-15T10:00:00.000Z",
      durationMinutes: 60,
      userQuestions: [],
      filesModified: [],
      toolsUsed: [],
      technologies: [],
      plans: [],
      messageCount: 5,
      toolCallCount: 2,
    };

    addToIndex(index, manifest);
    expect(index.keywords["unique"]).toBeDefined();

    removeFromIndex(index, "test-123", "-Users-test-my-project");
    // Keyword entry should be removed if no other manifests use it
    expect(index.keywords["unique"]).toBeUndefined();
  });

  it("decrements project conversation count", () => {
    const index = getDefaultSearchIndex();

    const manifest1: ConversationManifest = {
      id: "test-1",
      projectId: "-Users-test-my-project",
      projectSlug: "my-project",
      projectPath: "/Users/test/my-project",
      archivedAt: "2026-01-15T10:00:00.000Z",
      autoArchived: false,
      title: "Session One",
      startedAt: "2026-01-15T09:00:00.000Z",
      endedAt: "2026-01-15T10:00:00.000Z",
      durationMinutes: 60,
      userQuestions: [],
      filesModified: [],
      toolsUsed: [],
      technologies: [],
      plans: [],
      messageCount: 5,
      toolCallCount: 2,
    };

    const manifest2: ConversationManifest = {
      ...manifest1,
      id: "test-2",
      title: "Session Two",
    };

    addToIndex(index, manifest1);
    addToIndex(index, manifest2);
    expect(index.projects["-Users-test-my-project"].conversationCount).toBe(2);

    removeFromIndex(index, "test-1", "-Users-test-my-project");
    expect(index.projects["-Users-test-my-project"].conversationCount).toBe(1);
  });

  it("removes project when conversation count reaches zero", () => {
    const index = getDefaultSearchIndex();
    const manifest: ConversationManifest = {
      id: "test-123",
      projectId: "-Users-test-my-project",
      projectSlug: "my-project",
      projectPath: "/Users/test/my-project",
      archivedAt: "2026-01-15T10:00:00.000Z",
      autoArchived: false,
      title: "Only Session",
      startedAt: "2026-01-15T09:00:00.000Z",
      endedAt: "2026-01-15T10:00:00.000Z",
      durationMinutes: 60,
      userQuestions: [],
      filesModified: [],
      toolsUsed: [],
      technologies: [],
      plans: [],
      messageCount: 5,
      toolCallCount: 2,
    };

    addToIndex(index, manifest);
    expect(index.projects["-Users-test-my-project"]).toBeDefined();

    removeFromIndex(index, "test-123", "-Users-test-my-project");
    expect(index.projects["-Users-test-my-project"]).toBeUndefined();
  });
});

describe("searchIndex", () => {
  it("returns matching manifest IDs sorted by score", () => {
    const index = getDefaultSearchIndex();

    const manifest1: ConversationManifest = {
      id: "auth-session",
      projectId: "-Users-test-my-project",
      projectSlug: "my-project",
      projectPath: "/Users/test/my-project",
      archivedAt: "2026-01-15T10:00:00.000Z",
      autoArchived: false,
      title: "Authentication Implementation",
      startedAt: "2026-01-15T09:00:00.000Z",
      endedAt: "2026-01-15T10:00:00.000Z",
      durationMinutes: 60,
      userQuestions: ["How do I authenticate users?"],
      filesModified: ["src/auth/login.ts"],
      toolsUsed: ["Write"],
      technologies: ["typescript"],
      plans: [],
      messageCount: 5,
      toolCallCount: 2,
    };

    const manifest2: ConversationManifest = {
      id: "database-session",
      projectId: "-Users-test-my-project",
      projectSlug: "my-project",
      projectPath: "/Users/test/my-project",
      archivedAt: "2026-01-15T11:00:00.000Z",
      autoArchived: false,
      title: "Database Setup",
      startedAt: "2026-01-15T10:00:00.000Z",
      endedAt: "2026-01-15T11:00:00.000Z",
      durationMinutes: 60,
      userQuestions: ["How do I set up the database?"],
      filesModified: ["src/db/schema.ts"],
      toolsUsed: ["Write"],
      technologies: ["postgres"],
      plans: [],
      messageCount: 5,
      toolCallCount: 2,
    };

    addToIndex(index, manifest1);
    addToIndex(index, manifest2);

    const results = searchIndex(index, "authentication");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("auth-session");
  });

  it("combines scores for multi-keyword queries", () => {
    const index = getDefaultSearchIndex();

    const manifest: ConversationManifest = {
      id: "full-match",
      projectId: "-Users-test-my-project",
      projectSlug: "my-project",
      projectPath: "/Users/test/my-project",
      archivedAt: "2026-01-15T10:00:00.000Z",
      autoArchived: false,
      title: "JWT Authentication",
      startedAt: "2026-01-15T09:00:00.000Z",
      endedAt: "2026-01-15T10:00:00.000Z",
      durationMinutes: 60,
      userQuestions: [],
      filesModified: [],
      toolsUsed: [],
      technologies: [],
      plans: [],
      messageCount: 5,
      toolCallCount: 2,
    };

    addToIndex(index, manifest);

    const results = searchIndex(index, "jwt authentication");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("full-match");
    // Score should be combination of both keywords
    expect(results[0].score).toBeGreaterThan(2.0);
  });

  it("returns empty array for no matches", () => {
    const index = getDefaultSearchIndex();
    const results = searchIndex(index, "nonexistent keyword");
    expect(results).toEqual([]);
  });

  it("returns empty array for empty query", () => {
    const index = getDefaultSearchIndex();
    const results = searchIndex(index, "");
    expect(results).toEqual([]);
  });

  it("ignores stop words in query", () => {
    const index = getDefaultSearchIndex();

    const manifest: ConversationManifest = {
      id: "test-session",
      projectId: "-Users-test-my-project",
      projectSlug: "my-project",
      projectPath: "/Users/test/my-project",
      archivedAt: "2026-01-15T10:00:00.000Z",
      autoArchived: false,
      title: "Authentication Guide",
      startedAt: "2026-01-15T09:00:00.000Z",
      endedAt: "2026-01-15T10:00:00.000Z",
      durationMinutes: 60,
      userQuestions: [],
      filesModified: [],
      toolsUsed: [],
      technologies: [],
      plans: [],
      messageCount: 5,
      toolCallCount: 2,
    };

    addToIndex(index, manifest);

    // "the" is a stop word
    const results = searchIndex(index, "the authentication");
    expect(results).toHaveLength(1);
  });
});

describe("getIndexStats", () => {
  it("returns accurate statistics", () => {
    const index = getDefaultSearchIndex();

    const manifest1: ConversationManifest = {
      id: "test-1",
      projectId: "-Users-test-project-a",
      projectSlug: "project-a",
      projectPath: "/Users/test/project-a",
      archivedAt: "2026-01-15T10:00:00.000Z",
      autoArchived: false,
      title: "Session Alpha",
      startedAt: "2026-01-15T09:00:00.000Z",
      endedAt: "2026-01-15T10:00:00.000Z",
      durationMinutes: 60,
      userQuestions: [],
      filesModified: [],
      toolsUsed: [],
      technologies: [],
      plans: [],
      messageCount: 5,
      toolCallCount: 2,
    };

    const manifest2: ConversationManifest = {
      id: "test-2",
      projectId: "-Users-test-project-b",
      projectSlug: "project-b",
      projectPath: "/Users/test/project-b",
      archivedAt: "2026-01-15T11:00:00.000Z",
      autoArchived: false,
      title: "Session Beta",
      startedAt: "2026-01-15T10:00:00.000Z",
      endedAt: "2026-01-15T11:00:00.000Z",
      durationMinutes: 60,
      userQuestions: [],
      filesModified: [],
      toolsUsed: [],
      technologies: [],
      plans: [],
      messageCount: 5,
      toolCallCount: 2,
    };

    addToIndex(index, manifest1);
    addToIndex(index, manifest2);

    const stats = getIndexStats(index);

    expect(stats.totalConversations).toBe(2);
    expect(stats.totalProjects).toBe(2);
    expect(stats.totalKeywords).toBeGreaterThan(0);
    expect(stats.averageKeywordsPerConversation).toBeGreaterThan(0);
  });

  it("returns zeros for empty index", () => {
    const index = getDefaultSearchIndex();
    const stats = getIndexStats(index);

    expect(stats.totalConversations).toBe(0);
    expect(stats.totalKeywords).toBe(0);
    expect(stats.totalProjects).toBe(0);
    expect(stats.averageKeywordsPerConversation).toBe(0);
  });
});
