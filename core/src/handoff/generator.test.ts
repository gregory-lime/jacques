/**
 * Generator Tests
 *
 * Tests for handoff generation including the new compact context functions.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { ParsedEntry } from "../session/parser.js";

import {
  formatHandoffMarkdown,
  formatAsSkillContext,
  extractHandoffData,
  getCompactContextFromEntries,
  type HandoffData,
} from "./generator.js";

describe("Generator", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temp directory for tests
    testDir = join(tmpdir(), `generator-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // Sample parsed entries for testing
  const createUserMessage = (
    text: string,
    uuid: string = `uuid-${Date.now()}-${Math.random()}`
  ): ParsedEntry => ({
    type: "user_message",
    uuid,
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: "test-session",
    content: { text },
  });

  const createAssistantMessage = (
    text: string,
    uuid: string = `uuid-${Date.now()}-${Math.random()}`
  ): ParsedEntry => ({
    type: "assistant_message",
    uuid,
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: "test-session",
    content: { text },
  });

  const createToolCall = (
    toolName: string,
    filePath?: string
  ): ParsedEntry => ({
    type: "tool_call",
    uuid: `uuid-${Date.now()}-${Math.random()}`,
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: "test-session",
    content: {
      toolName,
      toolInput: filePath ? { file_path: filePath } : {},
    },
  });

  const createSummary = (summary: string): ParsedEntry => ({
    type: "summary",
    uuid: `uuid-${Date.now()}-${Math.random()}`,
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: "test-session",
    content: { summary },
  });

  describe("extractHandoffData", () => {
    it("should extract basic handoff data from entries", async () => {
      const entries: ParsedEntry[] = [
        createSummary("Test Session Summary"),
        createUserMessage("First user message"),
        createAssistantMessage("First assistant response"),
        createToolCall("Write", "/path/to/file.ts"),
        createUserMessage("Second user message"),
      ];

      const data = await extractHandoffData(entries, testDir);

      expect(data.title).toBe("Test Session Summary");
      expect(data.projectDir).toBe(testDir);
      expect(data.filesModified).toContain("/path/to/file.ts");
      expect(data.toolsUsed).toContain("Write");
      expect(data.totalUserMessages).toBe(2);
      expect(data.totalToolCalls).toBe(1);
    });

    it("should extract technologies from file paths", async () => {
      const entries: ParsedEntry[] = [
        createUserMessage("Working with TypeScript"),
        createToolCall("Write", "/path/to/component.tsx"),
        createToolCall("Edit", "/path/to/styles.css"),
      ];

      const data = await extractHandoffData(entries, testDir);

      expect(data.technologies).toContain("typescript");
    });

    it("should extract assistant highlights", async () => {
      const entries: ParsedEntry[] = [
        createUserMessage("Help me"),
        createAssistantMessage("Here is the first response"),
        createAssistantMessage("Here is the second response"),
        createAssistantMessage("Here is the third response"),
      ];

      const data = await extractHandoffData(entries, testDir);

      expect(data.assistantHighlights).toHaveLength(3);
      expect(data.assistantHighlights[0]).toBe("Here is the first response");
    });

    it("should truncate long assistant highlights", async () => {
      const longText = "A".repeat(200);
      const entries: ParsedEntry[] = [
        createUserMessage("Help me"),
        createAssistantMessage(longText),
      ];

      const data = await extractHandoffData(entries, testDir);

      expect(data.assistantHighlights[0].length).toBeLessThanOrEqual(150);
      expect(data.assistantHighlights[0]).toContain("...");
    });

    it("should extract decision points from user messages", async () => {
      const entries: ParsedEntry[] = [
        createUserMessage("Let's go with option A"),
        createUserMessage("Yes, do that approach"),
        createUserMessage("Use TypeScript instead of JavaScript"),
        createUserMessage("Just a regular message"),
      ];

      const data = await extractHandoffData(entries, testDir);

      expect(data.decisions.length).toBeGreaterThanOrEqual(2);
      expect(data.decisions.some((d) => d.includes("option A"))).toBe(true);
    });

    it("should extract blockers from messages", async () => {
      const entries: ParsedEntry[] = [
        createUserMessage("The build is failing with an error"),
        createAssistantMessage("I found a bug in the code"),
        createUserMessage("I'm blocked by this issue"),
      ];

      const data = await extractHandoffData(entries, testDir);

      expect(data.blockers.length).toBeGreaterThanOrEqual(2);
      expect(data.blockers.some((b) => b.includes("error") || b.includes("failing"))).toBe(true);
    });

    it("should deduplicate similar blockers", async () => {
      const entries: ParsedEntry[] = [
        createUserMessage("There is an error"),
        createUserMessage("there is an error"), // Same message, different case
      ];

      const data = await extractHandoffData(entries, testDir);

      // Should deduplicate (normalized comparison)
      expect(data.blockers.length).toBe(1);
    });
  });

  describe("formatAsSkillContext", () => {
    const sampleData: HandoffData = {
      title: "Test Session",
      projectDir: "/test/project",
      filesModified: ["/path/to/file1.ts", "/path/to/file2.ts"],
      toolsUsed: ["Read", "Write", "Edit"],
      recentMessages: ["First message", "Second message", "Third message"],
      timestamp: new Date().toISOString(),
      totalUserMessages: 5,
      totalToolCalls: 10,
      assistantHighlights: ["Response one", "Response two"],
      decisions: ["Let's use TypeScript", "Go with option A"],
      technologies: ["typescript", "react"],
      blockers: ["Build failing"],
    };

    it("should format data into skill context string", () => {
      const context = formatAsSkillContext(sampleData);

      expect(context).toContain("## Pre-Extracted Session Context");
      expect(context).toContain("### Project Info");
      expect(context).toContain("/test/project");
      expect(context).toContain("typescript, react");
    });

    it("should include files modified", () => {
      const context = formatAsSkillContext(sampleData);

      expect(context).toContain("file1.ts");
      expect(context).toContain("file2.ts");
    });

    it("should include user messages", () => {
      const context = formatAsSkillContext(sampleData);

      expect(context).toContain("First message");
      expect(context).toContain("Second message");
    });

    it("should include assistant highlights", () => {
      const context = formatAsSkillContext(sampleData);

      expect(context).toContain("Response one");
      expect(context).toContain("Response two");
    });

    it("should include decisions", () => {
      const context = formatAsSkillContext(sampleData);

      expect(context).toContain("Let's use TypeScript");
      expect(context).toContain("Go with option A");
    });

    it("should include blockers", () => {
      const context = formatAsSkillContext(sampleData);

      expect(context).toContain("Build failing");
    });

    it("should handle empty arrays gracefully", () => {
      const emptyData: HandoffData = {
        ...sampleData,
        filesModified: [],
        recentMessages: [],
        assistantHighlights: [],
        decisions: [],
        blockers: [],
        technologies: [],
      };

      const context = formatAsSkillContext(emptyData);

      expect(context).toContain("No user messages");
      expect(context).toContain("No assistant highlights");
      expect(context).toContain("None detected");
    });

    it("should truncate files list when too many", () => {
      const manyFiles = Array.from(
        { length: 20 },
        (_, i) => `/path/to/file${i}.ts`
      );
      const dataWithManyFiles: HandoffData = {
        ...sampleData,
        filesModified: manyFiles,
      };

      const context = formatAsSkillContext(dataWithManyFiles);

      expect(context).toContain("... and 5 more");
    });

    it("should include skill instructions prompt", () => {
      const context = formatAsSkillContext(sampleData);

      expect(context).toContain("follow the skill instructions");
      expect(context).toContain("~1000 token handoff");
    });
  });

  describe("getCompactContextFromEntries", () => {
    it("should return compact context with token estimate", async () => {
      const entries: ParsedEntry[] = [
        createSummary("Test Session"),
        createUserMessage("First message"),
        createAssistantMessage("First response"),
        createToolCall("Write", "/path/to/file.ts"),
      ];

      const result = await getCompactContextFromEntries(entries, testDir);

      expect(result.context).toBeDefined();
      expect(result.tokenEstimate).toBeGreaterThan(0);
      expect(result.data).toBeDefined();
      expect(result.data.title).toBe("Test Session");
    });

    it("should produce context under 3k tokens for typical session", async () => {
      // Create a realistic session with multiple messages
      const entries: ParsedEntry[] = [
        createSummary("Implementing user authentication"),
      ];

      // Add 10 user messages
      for (let i = 0; i < 10; i++) {
        entries.push(createUserMessage(`User message ${i}: ${" some content".repeat(10)}`));
        entries.push(createAssistantMessage(`Response ${i}: ${" some response".repeat(10)}`));
      }

      // Add some tool calls
      for (let i = 0; i < 5; i++) {
        entries.push(createToolCall("Write", `/path/to/file${i}.ts`));
      }

      const result = await getCompactContextFromEntries(entries, testDir);

      // Should be well under 3k tokens
      expect(result.tokenEstimate).toBeLessThan(3000);
    });

    it("should include extended messages (10 instead of 5)", async () => {
      const entries: ParsedEntry[] = [];

      // Add 12 user messages
      for (let i = 0; i < 12; i++) {
        entries.push(createUserMessage(`Message ${i}`));
      }

      const result = await getCompactContextFromEntries(entries, testDir);

      // Should have up to 10 messages (extended count)
      expect(result.data.recentMessages.length).toBeLessThanOrEqual(10);
      expect(result.data.recentMessages.length).toBeGreaterThan(5);
    });
  });

  describe("formatHandoffMarkdown", () => {
    const sampleData: HandoffData = {
      title: "Test Session",
      projectDir: "/test/project",
      filesModified: ["/path/to/file.ts"],
      toolsUsed: ["Write"],
      recentMessages: ["User message"],
      timestamp: "2024-01-01T00:00:00.000Z",
      totalUserMessages: 1,
      totalToolCalls: 1,
      assistantHighlights: [],
      decisions: [],
      technologies: [],
      blockers: [],
    };

    it("should format as markdown document", () => {
      const markdown = formatHandoffMarkdown(sampleData);

      expect(markdown).toContain("# Session Handoff");
      expect(markdown).toContain("**Title:** Test Session");
      expect(markdown).toContain("## Files Modified");
      expect(markdown).toContain("## Tools Used");
    });

    it("should include plan context when plans exist", () => {
      const dataWithPlans: HandoffData = {
        ...sampleData,
        plans: [{ path: "/path/to/plan.md", title: "Authentication Plan" }],
      };

      const markdown = formatHandoffMarkdown(dataWithPlans);

      expect(markdown).toContain("## Plan Context");
      expect(markdown).toContain("Authentication Plan");
    });
  });

  describe("Decision Pattern Detection", () => {
    const testDecisionPatterns = async (
      input: string,
      shouldMatch: boolean
    ): Promise<void> => {
      const entries: ParsedEntry[] = [createUserMessage(input)];
      const data = await extractHandoffData(entries, testDir);

      if (shouldMatch) {
        expect(data.decisions.length).toBeGreaterThan(0);
      } else {
        expect(data.decisions.length).toBe(0);
      }
    };

    it("should detect 'Yes, do that'", async () => {
      await testDecisionPatterns("Yes, do that", true);
    });

    it("should detect 'Let's go with option A'", async () => {
      await testDecisionPatterns("Let's go with option A", true);
    });

    it("should detect 'Use Redis instead of Postgres'", async () => {
      await testDecisionPatterns("Use Redis instead of Postgres", true);
    });

    it("should detect 'Sounds good to me'", async () => {
      await testDecisionPatterns("Sounds good to me", true);
    });

    it("should detect 'I want to use TypeScript'", async () => {
      await testDecisionPatterns("I want to use TypeScript", true);
    });

    it("should detect 'Don't add that feature'", async () => {
      await testDecisionPatterns("Don't add that feature", true);
    });

    it("should detect 'Keep the current implementation'", async () => {
      await testDecisionPatterns("Keep the current implementation", true);
    });

    it("should detect 'Approved'", async () => {
      await testDecisionPatterns("Approved", true);
    });

    it("should detect 'Option 2 please'", async () => {
      await testDecisionPatterns("Option 2 please", true);
    });

    it("should not detect 'Hello world'", async () => {
      await testDecisionPatterns("Hello world", false);
    });

    it("should not detect 'What is the status?'", async () => {
      await testDecisionPatterns("What is the status?", false);
    });
  });

  describe("Blocker Pattern Detection", () => {
    const testBlockerPatterns = async (
      input: string,
      shouldMatch: boolean
    ): Promise<void> => {
      const entries: ParsedEntry[] = [createUserMessage(input)];
      const data = await extractHandoffData(entries, testDir);

      if (shouldMatch) {
        expect(data.blockers.length).toBeGreaterThan(0);
      } else {
        expect(data.blockers.length).toBe(0);
      }
    };

    it("should detect 'The build is failing'", async () => {
      await testBlockerPatterns("The build is failing", true);
    });

    it("should detect 'I'm blocked by this'", async () => {
      await testBlockerPatterns("I'm blocked by this", true);
    });

    it("should detect 'There's a bug here'", async () => {
      await testBlockerPatterns("There's a bug here", true);
    });

    it("should detect 'Cannot find module'", async () => {
      await testBlockerPatterns("Cannot find module", true);
    });

    it("should detect 'Permission denied error'", async () => {
      await testBlockerPatterns("Permission denied error", true);
    });

    it("should detect 'The test timed out'", async () => {
      await testBlockerPatterns("The test timed out", true);
    });

    it("should detect 'App crashed on startup'", async () => {
      await testBlockerPatterns("App crashed on startup", true);
    });

    it("should detect 'Missing dependency'", async () => {
      await testBlockerPatterns("Missing dependency", true);
    });

    it("should not detect 'This works great!'", async () => {
      await testBlockerPatterns("This works great!", false);
    });

    it("should not detect 'Let me check the code'", async () => {
      await testBlockerPatterns("Let me check the code", false);
    });
  });

  describe("Technology Detection", () => {
    const testTechDetection = async (
      input: string,
      file: string | null,
      expected: string
    ): Promise<void> => {
      const entries: ParsedEntry[] = [createUserMessage(input)];
      if (file) {
        entries.push(createToolCall("Write", `/path/to/${file}`));
      }

      const data = await extractHandoffData(entries, testDir);
      expect(data.technologies).toContain(expected);
    };

    it("should detect typescript from content", async () => {
      await testTechDetection("Working with TypeScript", null, "typescript");
    });

    it("should detect typescript from file path", async () => {
      await testTechDetection("Working", "app.ts", "typescript");
    });

    it("should detect react", async () => {
      await testTechDetection("Using React hooks", null, "react");
    });

    it("should detect postgres", async () => {
      await testTechDetection("Configure PostgreSQL", null, "postgres");
    });

    it("should detect docker", async () => {
      await testTechDetection("Docker container", null, "docker");
    });

    it("should detect jest", async () => {
      await testTechDetection("Jest testing", null, "jest");
    });

    it("should detect nextjs", async () => {
      await testTechDetection("Using nextjs for the frontend", null, "nextjs");
    });
  });
});
