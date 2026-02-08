/**
 * Catalog Extractor Tests
 *
 * Tests for extracting catalog artifacts from JSONL session files.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { ParsedEntry } from "../session/parser.js";
import type { SubagentEntry } from "../context/types.js";
import {
  extractExploreResult,
  extractSearchResults,
  createSessionManifest,
  extractSessionCatalog,
} from "./extractor.js";
import { readProjectIndex } from "../context/indexer.js";
import type { SubagentFile } from "../session/detector.js";

// ============================================================
// Test Helpers
// ============================================================

function createUserMessage(text: string, timestamp?: string): ParsedEntry {
  return {
    type: "user_message",
    uuid: "test-uuid-" + Math.random().toString(36).substring(7),
    parentUuid: null,
    timestamp: timestamp || new Date().toISOString(),
    sessionId: "test-session-id",
    content: { text },
  };
}

function createAssistantMessage(
  text: string,
  options?: {
    timestamp?: string;
    usage?: { inputTokens: number; outputTokens: number; cacheCreation?: number; cacheRead?: number };
  }
): ParsedEntry {
  return {
    type: "assistant_message",
    uuid: "test-uuid-" + Math.random().toString(36).substring(7),
    parentUuid: null,
    timestamp: options?.timestamp || new Date().toISOString(),
    sessionId: "test-session-id",
    content: {
      text,
      usage: options?.usage,
    },
  };
}

function createToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  options?: {
    timestamp?: string;
    usage?: { inputTokens: number; outputTokens: number; cacheCreation?: number; cacheRead?: number };
  }
): ParsedEntry {
  return {
    type: "tool_call",
    uuid: "test-uuid-" + Math.random().toString(36).substring(7),
    parentUuid: null,
    timestamp: options?.timestamp || new Date().toISOString(),
    sessionId: "test-session-id",
    content: {
      toolName,
      toolInput,
      usage: options?.usage,
    },
  };
}

function createAgentProgress(
  agentId: string,
  agentType: string,
  description: string,
  timestamp?: string
): ParsedEntry {
  return {
    type: "agent_progress",
    uuid: "test-uuid-" + Math.random().toString(36).substring(7),
    parentUuid: null,
    timestamp: timestamp || new Date().toISOString(),
    sessionId: "test-session-id",
    content: {
      agentId,
      agentType,
      agentDescription: description,
    },
  };
}

function createWebSearch(
  query: string,
  resultCount: number,
  searchType: "query" | "results",
  options?: {
    timestamp?: string;
    urls?: Array<{ title: string; url: string }>;
  }
): ParsedEntry {
  return {
    type: "web_search",
    uuid: "test-uuid-" + Math.random().toString(36).substring(7),
    parentUuid: null,
    timestamp: options?.timestamp || new Date().toISOString(),
    sessionId: "test-session-id",
    content: {
      searchType,
      searchQuery: query,
      searchResultCount: resultCount,
      searchUrls: options?.urls,
    },
  };
}

function createSummary(summary: string): ParsedEntry {
  return {
    type: "summary",
    uuid: "test-uuid-" + Math.random().toString(36).substring(7),
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: "test-session-id",
    content: { summary },
  };
}

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `jacques-catalog-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
  await fs.mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Cleanup best-effort
  }
});

// ============================================================
// Suite 1: Exploration Extraction
// ============================================================

describe("Exploration Extraction", () => {
  it("extracts final assistant message from subagent JSONL as markdown", async () => {
    // Create a mock subagent JSONL file
    const subagentDir = join(testDir, "subagents");
    await fs.mkdir(subagentDir, { recursive: true });
    const subagentPath = join(subagentDir, "agent-a1234.jsonl");

    // Write mock JSONL content (raw format that parseJSONL expects)
    const lines = [
      JSON.stringify({
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00Z",
        sessionId: "sub-session",
        message: { role: "user", content: "Find all error handlers" },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-01-01T00:01:00Z",
        sessionId: "sub-session",
        message: {
          id: "msg1",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Found 3 error handlers in the codebase:\n\n1. `src/api.ts:42` - Global error handler\n2. `src/db.ts:15` - Database error handler\n3. `src/ws.ts:88` - WebSocket error handler" }],
          usage: { input_tokens: 5000, output_tokens: 100, cache_read_input_tokens: 3000 },
        },
      }),
    ];
    await fs.writeFile(subagentPath, lines.join("\n"), "utf-8");

    const subagentFile: SubagentFile = {
      filePath: subagentPath,
      agentId: "a1234",
      modifiedAt: new Date(),
      sizeBytes: 500,
    };

    const result = await extractExploreResult(subagentFile, "Find error handlers", "session-123", "2026-01-01T00:00:00Z");

    expect(result).not.toBeNull();
    expect(result!.markdown).toContain("# Explore: Find error handlers");
    expect(result!.markdown).toContain("Found 3 error handlers");
    expect(result!.markdown).toContain("Session: `session-123`");
    expect(result!.entry.id).toBe("a1234");
    expect(result!.entry.type).toBe("exploration");
    expect(result!.entry.title).toBe("Find error handlers");
    expect(result!.entry.filename).toContain("explore_a1234_");
  });

  it("handles subagent JSONL with no assistant messages", async () => {
    const subagentDir = join(testDir, "subagents");
    await fs.mkdir(subagentDir, { recursive: true });
    const subagentPath = join(subagentDir, "agent-a5678.jsonl");

    const lines = [
      JSON.stringify({
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00Z",
        sessionId: "sub-session",
        message: { role: "user", content: "Explore something" },
      }),
    ];
    await fs.writeFile(subagentPath, lines.join("\n"), "utf-8");

    const subagentFile: SubagentFile = {
      filePath: subagentPath,
      agentId: "a5678",
      modifiedAt: new Date(),
      sizeBytes: 200,
    };

    const result = await extractExploreResult(subagentFile, "Explore something", "session-123", "2026-01-01T00:00:00Z");
    expect(result).toBeNull();
  });

  it("uses last assistant message when multiple exist", async () => {
    const subagentDir = join(testDir, "subagents");
    await fs.mkdir(subagentDir, { recursive: true });
    const subagentPath = join(subagentDir, "agent-amulti.jsonl");

    const lines = [
      JSON.stringify({
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00Z",
        sessionId: "sub-session",
        message: { role: "user", content: "Search code" },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-01-01T00:01:00Z",
        sessionId: "sub-session",
        message: {
          id: "msg1",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "First partial result" }],
        },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "a2",
        timestamp: "2026-01-01T00:02:00Z",
        sessionId: "sub-session",
        message: {
          id: "msg2",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Complete final result with all findings" }],
        },
      }),
    ];
    await fs.writeFile(subagentPath, lines.join("\n"), "utf-8");

    const subagentFile: SubagentFile = {
      filePath: subagentPath,
      agentId: "amulti",
      modifiedAt: new Date(),
      sizeBytes: 600,
    };

    const result = await extractExploreResult(subagentFile, "Search code", "session-123", "2026-01-01T00:00:00Z");
    expect(result).not.toBeNull();
    expect(result!.markdown).toContain("Complete final result");
    expect(result!.markdown).not.toContain("First partial result");
  });

  it("generates correct filename slug from description", async () => {
    const subagentDir = join(testDir, "subagents");
    await fs.mkdir(subagentDir, { recursive: true });
    const subagentPath = join(subagentDir, "agent-aslug.jsonl");

    const lines = [
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-01-01T00:00:00Z",
        sessionId: "sub-session",
        message: {
          id: "msg1",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Result text" }],
        },
      }),
    ];
    await fs.writeFile(subagentPath, lines.join("\n"), "utf-8");

    const subagentFile: SubagentFile = {
      filePath: subagentPath,
      agentId: "aslug",
      modifiedAt: new Date(),
      sizeBytes: 200,
    };

    const result = await extractExploreResult(
      subagentFile,
      "Find all API endpoints & handlers!",
      "s1",
      "2026-01-01T00:00:00Z"
    );

    expect(result).not.toBeNull();
    expect(result!.entry.filename).toBe("explore_aslug_find-all-api-endpoints-handlers.md");
  });
});

// ============================================================
// Suite 2: Search Extraction
// ============================================================

describe("Search Extraction", () => {
  it("extracts web search query + URLs + assistant synthesis as markdown", () => {
    const entries: ParsedEntry[] = [
      createWebSearch("JWT authentication best practices", 10, "results", {
        timestamp: "2026-01-15T10:00:00Z",
        urls: [
          { title: "JWT Auth Guide", url: "https://example.com/jwt" },
          { title: "OAuth vs JWT", url: "https://example.com/oauth" },
        ],
      }),
      createAssistantMessage(
        "Based on the search results, JWT authentication best practices include: " +
        "1. Use short-lived access tokens. 2. Implement refresh token rotation. " +
        "3. Store tokens securely in httpOnly cookies. These are established security patterns."
      ),
    ];

    const results = extractSearchResults(entries, "session-456");

    expect(results).toHaveLength(1);
    expect(results[0].markdown).toContain("# Search: JWT authentication best practices");
    expect(results[0].markdown).toContain("[JWT Auth Guide](https://example.com/jwt)");
    expect(results[0].markdown).toContain("refresh token rotation");
    expect(results[0].entry.type).toBe("search");
    expect(results[0].entry.title).toBe("JWT authentication best practices");
    expect(results[0].entry.resultCount).toBe(10);
  });

  it("handles search with no results", () => {
    const entries: ParsedEntry[] = [
      createWebSearch("nonexistent obscure query", 0, "results", {
        timestamp: "2026-01-15T10:00:00Z",
      }),
    ];

    const results = extractSearchResults(entries, "session-789");

    expect(results).toHaveLength(1);
    expect(results[0].markdown).toContain("Results: 0");
    expect(results[0].markdown).toContain("_No URLs captured_");
    expect(results[0].entry.resultCount).toBeUndefined(); // 0 becomes undefined
  });

  it("handles multiple searches in one session", () => {
    const entries: ParsedEntry[] = [
      createWebSearch("React hooks tutorial", 5, "results", {
        timestamp: "2026-01-15T10:00:00Z",
      }),
      createAssistantMessage(
        "React hooks are a way to use state and other React features in functional components. " +
        "The most common hooks are useState, useEffect, useContext, and useReducer. " +
        "Here's a comprehensive guide to getting started with hooks."
      ),
      createWebSearch("TypeScript generics guide", 8, "results", {
        timestamp: "2026-01-15T10:05:00Z",
      }),
      createAssistantMessage(
        "TypeScript generics allow you to create reusable components that work with multiple types. " +
        "They provide type safety while maintaining flexibility. " +
        "Key concepts include type parameters, constraints, and conditional types."
      ),
    ];

    const results = extractSearchResults(entries, "session-multi");

    expect(results).toHaveLength(2);
    expect(results[0].entry.title).toBe("React hooks tutorial");
    expect(results[1].entry.title).toBe("TypeScript generics guide");
  });

  it("deduplicates searches by query", () => {
    const entries: ParsedEntry[] = [
      createWebSearch("duplicate query", 5, "results", {
        timestamp: "2026-01-15T10:00:00Z",
      }),
      createWebSearch("duplicate query", 5, "results", {
        timestamp: "2026-01-15T10:01:00Z",
      }),
    ];

    const results = extractSearchResults(entries, "session-dedup");
    expect(results).toHaveLength(1);
  });

  it("generates correct filename slug from query", () => {
    const entries: ParsedEntry[] = [
      createWebSearch("How to implement OAuth 2.0?", 3, "results", {
        timestamp: "2026-01-15T10:00:00Z",
      }),
    ];

    const results = extractSearchResults(entries, "session-slug");
    expect(results).toHaveLength(1);
    expect(results[0].entry.filename).toContain("search_");
    expect(results[0].entry.filename).toContain("how-to-implement-oauth-2-0");
    expect(results[0].entry.filename.endsWith(".md")).toBe(true);
  });
});

// ============================================================
// Suite 3: Session Manifest Creation
// ============================================================

describe("Session Manifest Creation", () => {
  it("creates manifest with title from summary entry", async () => {
    const jsonlPath = join(testDir, "abc123.jsonl");
    const entries: ParsedEntry[] = [
      createUserMessage("Fix the login bug", "2026-01-01T09:00:00Z"),
      createAssistantMessage("I'll investigate the login issue.", {
        timestamp: "2026-01-01T09:01:00Z",
        usage: { inputTokens: 5000, outputTokens: 200, cacheCreation: 1000, cacheRead: 3000 },
      }),
      createSummary("Fixed login authentication bug"),
    ];

    // Create a mock JSONL file (needed by listSubagentFiles)
    await fs.writeFile(jsonlPath, "", "utf-8");

    const manifest = await createSessionManifest(
      entries,
      jsonlPath,
      testDir,
      "2026-01-01T10:00:00Z",
      ["plan-1"],
      ["agent-1"]
    );

    expect(manifest.id).toBe("abc123");
    expect(manifest.title).toBe("Fixed login authentication bug");
    expect(manifest.planIds).toEqual(["plan-1"]);
    expect(manifest.subagentIds).toEqual(["agent-1"]);
    expect(manifest.jsonlModifiedAt).toBe("2026-01-01T10:00:00Z");
  });

  it("extracts user questions truncated to 200 chars", async () => {
    const jsonlPath = join(testDir, "truncate.jsonl");
    const longMessage = "A".repeat(300);
    const entries: ParsedEntry[] = [
      createUserMessage(longMessage, "2026-01-01T09:00:00Z"),
    ];

    await fs.writeFile(jsonlPath, "", "utf-8");

    const manifest = await createSessionManifest(
      entries,
      jsonlPath,
      testDir,
      "2026-01-01T10:00:00Z",
      [],
      []
    );

    expect(manifest.userQuestions[0].length).toBeLessThanOrEqual(200);
  });

  it("extracts files modified from Write/Edit tool calls", async () => {
    const jsonlPath = join(testDir, "files.jsonl");
    const entries: ParsedEntry[] = [
      createToolCall("Write", { file_path: "/src/api.ts", content: "code" }),
      createToolCall("Edit", { file_path: "/src/db.ts", old_string: "old", new_string: "new" }),
      createToolCall("Read", { file_path: "/src/config.ts" }), // Should not be included
    ];

    await fs.writeFile(jsonlPath, "", "utf-8");

    const manifest = await createSessionManifest(
      entries,
      jsonlPath,
      testDir,
      "2026-01-01T10:00:00Z",
      [],
      []
    );

    expect(manifest.filesModified).toContain("/src/api.ts");
    expect(manifest.filesModified).toContain("/src/db.ts");
    expect(manifest.filesModified).not.toContain("/src/config.ts");
  });

  it("detects technologies from content", async () => {
    const jsonlPath = join(testDir, "tech.jsonl");
    const entries: ParsedEntry[] = [
      createUserMessage("Update the React component"),
      createToolCall("Write", { file_path: "/src/App.tsx", content: "import React from 'react'" }),
      createAssistantMessage("I updated the TypeScript React component"),
    ];

    await fs.writeFile(jsonlPath, "", "utf-8");

    const manifest = await createSessionManifest(
      entries,
      jsonlPath,
      testDir,
      "2026-01-01T10:00:00Z",
      [],
      []
    );

    expect(manifest.technologies).toContain("react");
    expect(manifest.technologies).toContain("typescript");
  });

  it("extracts token usage stats", async () => {
    const jsonlPath = join(testDir, "tokens.jsonl");
    const entries: ParsedEntry[] = [
      createAssistantMessage("Response text", {
        usage: { inputTokens: 10000, outputTokens: 500, cacheCreation: 2000, cacheRead: 5000 },
      }),
    ];

    await fs.writeFile(jsonlPath, "", "utf-8");

    const manifest = await createSessionManifest(
      entries,
      jsonlPath,
      testDir,
      "2026-01-01T10:00:00Z",
      [],
      []
    );

    expect(manifest.tokens).toBeDefined();
    expect(manifest.tokens!.input).toBeGreaterThan(0);
  });

  it("falls back to first user message when no summary", async () => {
    const jsonlPath = join(testDir, "nosummary.jsonl");
    const entries: ParsedEntry[] = [
      createUserMessage("Help me debug the WebSocket connection issue"),
      createAssistantMessage("Let me investigate the WebSocket issue."),
    ];

    await fs.writeFile(jsonlPath, "", "utf-8");

    const manifest = await createSessionManifest(
      entries,
      jsonlPath,
      testDir,
      "2026-01-01T10:00:00Z",
      [],
      []
    );

    expect(manifest.title).toContain("WebSocket");
  });
});

// ============================================================
// Suite 4: Incremental Extraction
// ============================================================

describe("Incremental Extraction", () => {
  let projectDir: string;
  let claudeProjectDir: string;

  beforeEach(async () => {
    projectDir = join(testDir, "project");
    claudeProjectDir = join(testDir, "claude-projects");
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(claudeProjectDir, { recursive: true });
  });

  function createMinimalJSONL(): string {
    return [
      JSON.stringify({
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00Z",
        sessionId: "test-session",
        message: { role: "user", content: "Hello world" },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-01-01T00:01:00Z",
        sessionId: "test-session",
        message: {
          id: "msg1",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Hi there! How can I help?" }],
          usage: { input_tokens: 100, output_tokens: 20 },
        },
      }),
    ].join("\n");
  }

  it("skips extraction when JSONL mtime matches stored manifest", async () => {
    const jsonlPath = join(claudeProjectDir, "session1.jsonl");
    await fs.writeFile(jsonlPath, createMinimalJSONL(), "utf-8");

    // First extraction
    const result1 = await extractSessionCatalog(jsonlPath, projectDir);
    expect(result1.skipped).toBe(false);

    // Second extraction (same file, should skip)
    const result2 = await extractSessionCatalog(jsonlPath, projectDir);
    expect(result2.skipped).toBe(true);
  });

  it("re-extracts when JSONL mtime is newer", async () => {
    const jsonlPath = join(claudeProjectDir, "session2.jsonl");
    await fs.writeFile(jsonlPath, createMinimalJSONL(), "utf-8");

    // First extraction
    const result1 = await extractSessionCatalog(jsonlPath, projectDir);
    expect(result1.skipped).toBe(false);

    // Modify the JSONL file (new content = new mtime)
    await new Promise((resolve) => setTimeout(resolve, 50));
    const updatedContent = createMinimalJSONL() + "\n" + JSON.stringify({
      type: "user",
      uuid: "u2",
      timestamp: "2026-01-01T00:02:00Z",
      sessionId: "test-session",
      message: { role: "user", content: "Another question" },
    });
    await fs.writeFile(jsonlPath, updatedContent, "utf-8");

    // Second extraction (different mtime, should re-extract)
    const result2 = await extractSessionCatalog(jsonlPath, projectDir);
    expect(result2.skipped).toBe(false);
  });

  it("force flag bypasses mtime check", async () => {
    const jsonlPath = join(claudeProjectDir, "session3.jsonl");
    await fs.writeFile(jsonlPath, createMinimalJSONL(), "utf-8");

    // First extraction
    await extractSessionCatalog(jsonlPath, projectDir);

    // Force extraction (same file, should not skip)
    const result = await extractSessionCatalog(jsonlPath, projectDir, { force: true });
    expect(result.skipped).toBe(false);
  });

  it("handles missing manifest (first extraction)", async () => {
    const jsonlPath = join(claudeProjectDir, "session4.jsonl");
    await fs.writeFile(jsonlPath, createMinimalJSONL(), "utf-8");

    const result = await extractSessionCatalog(jsonlPath, projectDir);
    expect(result.skipped).toBe(false);
    expect(result.error).toBeUndefined();

    // Verify manifest was written
    const manifestPath = join(projectDir, ".jacques", "sessions", "session4.json");
    const manifestContent = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestContent);
    expect(manifest.id).toBe("session4");
  });
});

// ============================================================
// Suite 5: Index Integration
// ============================================================

describe("Index Integration", () => {
  let projectDir: string;
  let claudeProjectDir: string;

  beforeEach(async () => {
    projectDir = join(testDir, "project");
    claudeProjectDir = join(testDir, "claude-projects");
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(claudeProjectDir, { recursive: true });
  });

  it("adds session entry to ProjectIndex on extraction", async () => {
    const jsonlPath = join(claudeProjectDir, "idx-session.jsonl");
    const content = [
      JSON.stringify({
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00Z",
        sessionId: "idx-session",
        message: { role: "user", content: "Test question" },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-01-01T00:01:00Z",
        sessionId: "idx-session",
        message: {
          id: "msg1",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Test answer" }],
          usage: { input_tokens: 100, output_tokens: 20 },
        },
      }),
    ].join("\n");
    await fs.writeFile(jsonlPath, content, "utf-8");

    await extractSessionCatalog(jsonlPath, projectDir);

    const index = await readProjectIndex(projectDir);
    expect(index.sessions.length).toBe(1);
    expect(index.sessions[0].id).toBe("idx-session");
    expect(index.sessions[0].title).toBeTruthy();
  });

  it("handles v1 to v2 migration (adds missing subagents array)", async () => {
    // Write a v1 index without subagents field
    const jacquesDir = join(projectDir, ".jacques");
    await fs.mkdir(jacquesDir, { recursive: true });
    await fs.writeFile(
      join(jacquesDir, "index.json"),
      JSON.stringify({
        version: "1.0.0",
        updatedAt: "2026-01-01T00:00:00Z",
        context: [],
        sessions: [],
        plans: [],
        // Note: no subagents field
      }),
      "utf-8"
    );

    const index = await readProjectIndex(projectDir);
    expect(index.subagents).toBeDefined();
    expect(Array.isArray(index.subagents)).toBe(true);
    expect(index.subagents.length).toBe(0);
  });

  it("updates existing session entry on re-extraction", async () => {
    const jsonlPath = join(claudeProjectDir, "update-session.jsonl");
    const content = [
      JSON.stringify({
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00Z",
        sessionId: "update-session",
        message: { role: "user", content: "First question" },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-01-01T00:01:00Z",
        sessionId: "update-session",
        message: {
          id: "msg1",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "First answer" }],
          usage: { input_tokens: 100, output_tokens: 20 },
        },
      }),
    ].join("\n");
    await fs.writeFile(jsonlPath, content, "utf-8");

    // First extraction
    await extractSessionCatalog(jsonlPath, projectDir);
    let index = await readProjectIndex(projectDir);
    expect(index.sessions.length).toBe(1);

    // Modify and re-extract (force)
    await new Promise((resolve) => setTimeout(resolve, 50));
    const updatedContent = content + "\n" + JSON.stringify({
      type: "user",
      uuid: "u2",
      timestamp: "2026-01-01T00:02:00Z",
      sessionId: "update-session",
      message: { role: "user", content: "Second question" },
    });
    await fs.writeFile(jsonlPath, updatedContent, "utf-8");

    await extractSessionCatalog(jsonlPath, projectDir, { force: true });
    index = await readProjectIndex(projectDir);
    // Should still be 1 session (updated, not duplicated)
    expect(index.sessions.length).toBe(1);
    expect(index.sessions[0].messageCount).toBeGreaterThanOrEqual(2);
  });
});
