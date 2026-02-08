/**
 * Manifest Extractor Tests
 */

import {
  extractManifestFromEntries,
  detectPlans,
  detectEmbeddedPlan,
  replaceEmbeddedPlanWithReference,
} from "./manifest-extractor.js";
import type { ParsedEntry } from "../session/parser.js";

describe("extractManifestFromEntries", () => {
  const mockEntries: ParsedEntry[] = [
    {
      type: "user_message",
      uuid: "uuid-1",
      parentUuid: null,
      timestamp: "2026-01-15T10:00:00.000Z",
      sessionId: "session-123",
      content: {
        text: "Help me implement authentication for my React app",
      },
    },
    {
      type: "assistant_message",
      uuid: "uuid-2",
      parentUuid: "uuid-1",
      timestamp: "2026-01-15T10:01:00.000Z",
      sessionId: "session-123",
      content: {
        text: "I'll help you implement authentication using JWT tokens. First, let's set up the backend...",
      },
    },
    {
      type: "tool_call",
      uuid: "uuid-3",
      parentUuid: "uuid-2",
      timestamp: "2026-01-15T10:02:00.000Z",
      sessionId: "session-123",
      content: {
        toolName: "Write",
        toolInput: {
          file_path: "/Users/test/project/src/auth/jwt.ts",
          content: "export const verifyToken = ...",
        },
      },
    },
    {
      type: "tool_call",
      uuid: "uuid-4",
      parentUuid: "uuid-3",
      timestamp: "2026-01-15T10:03:00.000Z",
      sessionId: "session-123",
      content: {
        toolName: "Edit",
        toolInput: {
          file_path: "/Users/test/project/src/components/Login.tsx",
          old_string: "placeholder",
          new_string: "actual code",
        },
      },
    },
    {
      type: "summary",
      uuid: "uuid-5",
      parentUuid: null,
      timestamp: "2026-01-15T10:30:00.000Z",
      sessionId: "session-123",
      content: {
        summary: "JWT Authentication Implementation",
      },
    },
  ];

  it("extracts session ID and project slug", () => {
    const manifest = extractManifestFromEntries(
      mockEntries,
      "/Users/test/project",
      "/path/to/session.jsonl"
    );

    expect(manifest.id).toBe("session-123");
    expect(manifest.projectId).toBe("-Users-test-project");
    expect(manifest.projectSlug).toBe("project");
    expect(manifest.projectPath).toBe("/Users/test/project");
  });

  it("extracts title from summary entry", () => {
    const manifest = extractManifestFromEntries(
      mockEntries,
      "/Users/test/project",
      "/path/to/session.jsonl"
    );

    expect(manifest.title).toBe("JWT Authentication Implementation");
  });

  it("uses first user message as fallback title when no summary", () => {
    const entriesNoSummary = mockEntries.filter((e) => e.type !== "summary");
    const manifest = extractManifestFromEntries(
      entriesNoSummary,
      "/Users/test/project",
      "/path/to/session.jsonl"
    );

    // "Help me" is stripped as noise prefix
    expect(manifest.title).toBe("implement authentication for my React app");
  });

  it("truncates long fallback titles", () => {
    const longMessage = "A".repeat(150);
    const entries: ParsedEntry[] = [
      {
        type: "user_message",
        uuid: "uuid-1",
        parentUuid: null,
        timestamp: "2026-01-15T10:00:00.000Z",
        sessionId: "session-123",
        content: { text: longMessage },
      },
    ];

    const manifest = extractManifestFromEntries(
      entries,
      "/Users/test/project",
      "/path/to/session.jsonl"
    );

    expect(manifest.title.length).toBeLessThanOrEqual(100);
    expect(manifest.title.endsWith("...")).toBe(true);
  });

  it("strips markdown heading markers from summary title", () => {
    const entriesWithHashTitle: ParsedEntry[] = [
      {
        type: "user_message",
        uuid: "uuid-1",
        parentUuid: null,
        timestamp: "2026-01-15T10:00:00.000Z",
        sessionId: "session-123",
        content: { text: "Some message" },
      },
      {
        type: "summary",
        uuid: "uuid-2",
        parentUuid: null,
        timestamp: "2026-01-15T10:01:00.000Z",
        sessionId: "session-123",
        content: { summary: "# GUI Implementation Plan" },
      },
    ];

    const manifest = extractManifestFromEntries(
      entriesWithHashTitle,
      "/Users/test/project",
      "/path/to/session.jsonl"
    );

    expect(manifest.title).toBe("GUI Implementation Plan");
  });

  it("strips XML tags from title", () => {
    const entriesWithXmlTitle: ParsedEntry[] = [
      {
        type: "user_message",
        uuid: "uuid-1",
        parentUuid: null,
        timestamp: "2026-01-15T10:00:00.000Z",
        sessionId: "session-123",
        content: { text: "<local-command-caveat>Caveat: System message</local-command-caveat>" },
      },
    ];

    const manifest = extractManifestFromEntries(
      entriesWithXmlTitle,
      "/Users/test/project",
      "/path/to/session.jsonl"
    );

    expect(manifest.title).toBe("Caveat: System message");
    expect(manifest.title).not.toContain("<");
    expect(manifest.title).not.toContain(">");
  });

  it("extracts user questions", () => {
    const manifest = extractManifestFromEntries(
      mockEntries,
      "/Users/test/project",
      "/path/to/session.jsonl"
    );

    expect(manifest.userQuestions).toHaveLength(1);
    expect(manifest.userQuestions[0]).toBe(
      "Help me implement authentication for my React app"
    );
  });

  it("extracts files modified from Write and Edit tools", () => {
    const manifest = extractManifestFromEntries(
      mockEntries,
      "/Users/test/project",
      "/path/to/session.jsonl"
    );

    expect(manifest.filesModified).toHaveLength(2);
    expect(manifest.filesModified).toContain(
      "/Users/test/project/src/auth/jwt.ts"
    );
    expect(manifest.filesModified).toContain(
      "/Users/test/project/src/components/Login.tsx"
    );
  });

  it("extracts unique tools used", () => {
    const manifest = extractManifestFromEntries(
      mockEntries,
      "/Users/test/project",
      "/path/to/session.jsonl"
    );

    expect(manifest.toolsUsed).toEqual(["Edit", "Write"]);
  });

  it("detects technologies from content and file paths", () => {
    const manifest = extractManifestFromEntries(
      mockEntries,
      "/Users/test/project",
      "/path/to/session.jsonl"
    );

    expect(manifest.technologies).toContain("react");
    expect(manifest.technologies).toContain("typescript");
  });

  it("calculates duration in minutes", () => {
    const manifest = extractManifestFromEntries(
      mockEntries,
      "/Users/test/project",
      "/path/to/session.jsonl"
    );

    // 30 minutes from first to last timestamp
    expect(manifest.durationMinutes).toBe(30);
  });

  it("counts messages and tool calls", () => {
    const manifest = extractManifestFromEntries(
      mockEntries,
      "/Users/test/project",
      "/path/to/session.jsonl"
    );

    expect(manifest.messageCount).toBe(2); // 1 user + 1 assistant
    expect(manifest.toolCallCount).toBe(2); // 2 tool calls
  });

  it("sets autoArchived flag from options", () => {
    const manual = extractManifestFromEntries(
      mockEntries,
      "/Users/test/project",
      "/path/to/session.jsonl",
      { autoArchived: false }
    );
    expect(manual.autoArchived).toBe(false);

    const auto = extractManifestFromEntries(
      mockEntries,
      "/Users/test/project",
      "/path/to/session.jsonl",
      { autoArchived: true }
    );
    expect(auto.autoArchived).toBe(true);
  });

  it("includes user label from options", () => {
    const manifest = extractManifestFromEntries(
      mockEntries,
      "/Users/test/project",
      "/path/to/session.jsonl",
      { userLabel: "auth-implementation" }
    );

    expect(manifest.userLabel).toBe("auth-implementation");
  });

  it("extracts context snippets from assistant responses", () => {
    const manifest = extractManifestFromEntries(
      mockEntries,
      "/Users/test/project",
      "/path/to/session.jsonl"
    );

    expect(manifest.contextSnippets).toBeDefined();
    expect(manifest.contextSnippets!.length).toBeGreaterThan(0);
  });
});

describe("detectPlans", () => {
  it("detects plans written to ~/.claude/plans/", () => {
    const entries: ParsedEntry[] = [
      {
        type: "tool_call",
        uuid: "uuid-1",
        parentUuid: null,
        timestamp: "2026-01-15T10:00:00.000Z",
        sessionId: "session-123",
        content: {
          toolName: "Write",
          toolInput: {
            file_path: `${process.env.HOME}/.claude/plans/auth-plan.md`,
            content: "# Authentication Plan",
          },
        },
      },
    ];

    const plans = detectPlans(entries);

    expect(plans).toHaveLength(1);
    expect(plans[0].name).toBe("auth-plan.md");
    expect(plans[0].archivedPath).toBe("plans/auth-plan.md");
  });

  it("detects plans with /plans/ in path", () => {
    const entries: ParsedEntry[] = [
      {
        type: "tool_call",
        uuid: "uuid-1",
        parentUuid: null,
        timestamp: "2026-01-15T10:00:00.000Z",
        sessionId: "session-123",
        content: {
          toolName: "Write",
          toolInput: {
            file_path: "/some/custom/plans/my-plan.md",
            content: "# My Plan",
          },
        },
      },
    ];

    const plans = detectPlans(entries);

    expect(plans).toHaveLength(1);
    expect(plans[0].name).toBe("my-plan.md");
  });

  it("detects plan files by naming convention", () => {
    const entries: ParsedEntry[] = [
      {
        type: "tool_call",
        uuid: "uuid-1",
        parentUuid: null,
        timestamp: "2026-01-15T10:00:00.000Z",
        sessionId: "session-123",
        content: {
          toolName: "Write",
          toolInput: {
            file_path: "/project/.cursor/implementation-plan.md",
            content: "# Implementation Plan",
          },
        },
      },
    ];

    const plans = detectPlans(entries);

    expect(plans).toHaveLength(1);
    expect(plans[0].name).toBe("implementation-plan.md");
  });

  it("ignores non-Write tool calls", () => {
    const entries: ParsedEntry[] = [
      {
        type: "tool_call",
        uuid: "uuid-1",
        parentUuid: null,
        timestamp: "2026-01-15T10:00:00.000Z",
        sessionId: "session-123",
        content: {
          toolName: "Read",
          toolInput: {
            file_path: "/some/plans/plan.md",
          },
        },
      },
    ];

    const plans = detectPlans(entries);

    expect(plans).toHaveLength(0);
  });

  it("returns unique plans only", () => {
    const entries: ParsedEntry[] = [
      {
        type: "tool_call",
        uuid: "uuid-1",
        parentUuid: null,
        timestamp: "2026-01-15T10:00:00.000Z",
        sessionId: "session-123",
        content: {
          toolName: "Write",
          toolInput: {
            file_path: "/plans/plan.md",
            content: "Version 1",
          },
        },
      },
      {
        type: "tool_call",
        uuid: "uuid-2",
        parentUuid: null,
        timestamp: "2026-01-15T10:01:00.000Z",
        sessionId: "session-123",
        content: {
          toolName: "Write",
          toolInput: {
            file_path: "/plans/plan.md",
            content: "Version 2",
          },
        },
      },
    ];

    const plans = detectPlans(entries);

    expect(plans).toHaveLength(1);
  });
});

describe("detectEmbeddedPlan", () => {
  it("detects 'Implement the following plan' pattern", () => {
    const entries: ParsedEntry[] = [
      {
        type: "user_message",
        uuid: "uuid-1",
        parentUuid: null,
        timestamp: "2026-01-15T10:00:00.000Z",
        sessionId: "session-123",
        content: {
          text: "Implement the following plan:\n\n# Authentication System\n\n## Overview\n\nBuild a JWT-based auth system.",
        },
      },
    ];

    const embeddedPlan = detectEmbeddedPlan(entries);

    expect(embeddedPlan).not.toBeNull();
    expect(embeddedPlan!.title).toBe("Authentication System");
    expect(embeddedPlan!.content).toContain("# Authentication System");
    expect(embeddedPlan!.reference).toBe("[Plan: Authentication System]");
  });

  it("returns null when no embedded plan pattern", () => {
    const entries: ParsedEntry[] = [
      {
        type: "user_message",
        uuid: "uuid-1",
        parentUuid: null,
        timestamp: "2026-01-15T10:00:00.000Z",
        sessionId: "session-123",
        content: {
          text: "Help me build an authentication system",
        },
      },
    ];

    const embeddedPlan = detectEmbeddedPlan(entries);

    expect(embeddedPlan).toBeNull();
  });

  it("returns null when content doesn't look like a plan", () => {
    const entries: ParsedEntry[] = [
      {
        type: "user_message",
        uuid: "uuid-1",
        parentUuid: null,
        timestamp: "2026-01-15T10:00:00.000Z",
        sessionId: "session-123",
        content: {
          text: "Implement the following plan: just add a button",
        },
      },
    ];

    const embeddedPlan = detectEmbeddedPlan(entries);

    expect(embeddedPlan).toBeNull();
  });

  it("replaces embedded plan with reference", () => {
    const entries: ParsedEntry[] = [
      {
        type: "user_message",
        uuid: "uuid-1",
        parentUuid: null,
        timestamp: "2026-01-15T10:00:00.000Z",
        sessionId: "session-123",
        content: {
          text: "Implement the following plan:\n\n# Auth Plan\n\n## Steps\n\n1. Do something",
        },
      },
      {
        type: "assistant_message",
        uuid: "uuid-2",
        parentUuid: "uuid-1",
        timestamp: "2026-01-15T10:01:00.000Z",
        sessionId: "session-123",
        content: {
          text: "I'll implement this plan.",
        },
      },
    ];

    const embeddedPlan = detectEmbeddedPlan(entries);
    expect(embeddedPlan).not.toBeNull();

    const modified = replaceEmbeddedPlanWithReference(entries, embeddedPlan!);

    expect(modified[0].content.text).toContain("[Plan: Auth Plan]");
    expect(modified[0].content.text).not.toContain("## Steps");
    expect(modified[1].content.text).toBe("I'll implement this plan.");
  });
});
