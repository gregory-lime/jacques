/**
 * Task Extractor Tests
 *
 * Tests for extracting task signals from parsed JSONL entries.
 * Covers: TaskCreate, TaskUpdate, TaskList, TodoWrite,
 *         agent_progress, bash_progress, file heuristics.
 */

import { describe, it, expect } from "@jest/globals";
import { extractTaskSignals, getModifiedFiles } from "./task-extractor.js";
import type { ParsedEntry } from "../session/parser.js";

// ============================================================
// Test Helpers
// ============================================================

const SESSION_ID = "test-session-001";

function makeEntry(overrides: Partial<ParsedEntry>): ParsedEntry {
  return {
    type: "tool_call",
    uuid: "uuid-" + Math.random().toString(36).substring(7),
    parentUuid: null,
    timestamp: "2026-01-01T00:00:00Z",
    sessionId: SESSION_ID,
    content: {},
    ...overrides,
  } as ParsedEntry;
}

function makeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  extra?: Partial<ParsedEntry> & { toolUseId?: string }
): ParsedEntry {
  const { toolUseId, ...rest } = extra || {};
  return makeEntry({
    type: "tool_call",
    content: {
      toolName,
      toolInput,
      toolUseId: toolUseId || `tool-use-${Math.random().toString(36).substring(7)}`,
    },
    ...rest,
  });
}

function makeUserMessage(
  overrides?: Partial<ParsedEntry["content"]>,
  entryOverrides?: Partial<ParsedEntry>
): ParsedEntry {
  return makeEntry({
    type: "user_message",
    content: { ...overrides },
    ...entryOverrides,
  });
}

// ============================================================
// extractTaskSignals
// ============================================================

describe("extractTaskSignals", () => {
  // ----------------------------------------------------------
  // TaskCreate
  // ----------------------------------------------------------
  describe("TaskCreate", () => {
    it("creates a task state entry with task.id from toolUseResult (priority 1)", () => {
      const create = makeToolCall("TaskCreate", {
        subject: "Implement login form",
        description: "Build the login form with validation",
      });
      const result = makeUserMessage({
        toolUseResult: { task: { id: "42" } },
      });

      const signals = extractTaskSignals([create, result], SESSION_ID);
      const taskSignal = signals.find((s) => s.source === "task_create" || s.source === "task_update");
      expect(taskSignal).toBeDefined();
      expect(taskSignal!.taskId).toBe("42");
      expect(taskSignal!.text).toBe("Implement login form");
      expect(taskSignal!.status).toBe("pending");
      expect(taskSignal!.source).toBe("task_create");
    });

    it("extracts taskId from toolUseResult.taskId (priority 2)", () => {
      const create = makeToolCall("TaskCreate", { subject: "Setup DB" });
      const result = makeUserMessage({ toolUseResult: { taskId: "77" } });

      const signals = extractTaskSignals([create, result], SESSION_ID);
      const taskSignal = signals.find((s) => s.taskId === "77");
      expect(taskSignal).toBeDefined();
      expect(taskSignal!.text).toBe("Setup DB");
    });

    it("extracts id from toolUseResult.id (priority 3)", () => {
      const create = makeToolCall("TaskCreate", { subject: "Write tests" });
      const result = makeUserMessage({ toolUseResult: { id: "99" } as Record<string, unknown> });

      const signals = extractTaskSignals([create, result], SESSION_ID);
      const taskSignal = signals.find((s) => s.taskId === "99");
      expect(taskSignal).toBeDefined();
    });

    it("extracts task ID from text pattern (priority 4)", () => {
      const create = makeToolCall("TaskCreate", { subject: "Deploy app" });
      const result = makeUserMessage({ text: "Task #5 created successfully" });

      const signals = extractTaskSignals([create, result], SESSION_ID);
      const taskSignal = signals.find((s) => s.taskId === "5");
      expect(taskSignal).toBeDefined();
      expect(taskSignal!.text).toBe("Deploy app");
    });

    it("falls back to auto-{index} when no task ID found", () => {
      const create = makeToolCall("TaskCreate", { subject: "Orphan task" });
      // No user_message result following

      const signals = extractTaskSignals([create], SESSION_ID);
      const taskSignal = signals.find((s) => s.text === "Orphan task");
      expect(taskSignal).toBeDefined();
      expect(taskSignal!.taskId).toMatch(/^auto-\d+$/);
    });

    it("sets hasTaskToolCalls preventing file heuristic fallback", () => {
      const create = makeToolCall("TaskCreate", { subject: "A task" });
      const result = makeUserMessage({ toolUseResult: { task: { id: "1" } } });
      const writeCall = makeToolCall("Write", { file_path: "/src/app.ts" });

      const signals = extractTaskSignals([create, result, writeCall], SESSION_ID);
      const fileSignals = signals.filter((s) => s.source === "file_heuristic");
      expect(fileSignals).toHaveLength(0);
    });

    it("skips TaskCreate with empty subject", () => {
      const create = makeToolCall("TaskCreate", { subject: "" });
      const result = makeUserMessage({ toolUseResult: { task: { id: "10" } } });

      const signals = extractTaskSignals([create, result], SESSION_ID);
      // Empty subject + taskId means the condition `if (taskId && subject)` fails
      const taskSignals = signals.filter(
        (s) => s.source === "task_create" || s.source === "task_update"
      );
      expect(taskSignals).toHaveLength(0);
    });
  });

  // ----------------------------------------------------------
  // TaskUpdate
  // ----------------------------------------------------------
  describe("TaskUpdate", () => {
    it("updates an existing task state to completed", () => {
      const create = makeToolCall("TaskCreate", { subject: "Build feature" });
      const createResult = makeUserMessage({ toolUseResult: { task: { id: "1" } } });
      const update = makeToolCall("TaskUpdate", {
        taskId: "1",
        status: "done",
      }, { timestamp: "2026-01-01T01:00:00Z" });

      const signals = extractTaskSignals([create, createResult, update], SESSION_ID);
      const taskSignal = signals.find((s) => s.taskId === "1");
      expect(taskSignal).toBeDefined();
      expect(taskSignal!.status).toBe("completed");
      expect(taskSignal!.source).toBe("task_update");
      expect(taskSignal!.timestamp).toBe("2026-01-01T01:00:00Z");
    });

    it("creates placeholder for unknown task ID", () => {
      const update = makeToolCall("TaskUpdate", {
        taskId: "unknown-123",
        status: "in-progress",
        subject: "Mysterious task",
      });

      const signals = extractTaskSignals([update], SESSION_ID);
      const taskSignal = signals.find((s) => s.taskId === "unknown-123");
      expect(taskSignal).toBeDefined();
      expect(taskSignal!.text).toBe("Mysterious task");
      expect(taskSignal!.status).toBe("in_progress");
    });

    it("uses default subject for unknown task without subject", () => {
      const update = makeToolCall("TaskUpdate", {
        taskId: "xyz",
        status: "done",
      });

      const signals = extractTaskSignals([update], SESSION_ID);
      const taskSignal = signals.find((s) => s.taskId === "xyz");
      expect(taskSignal).toBeDefined();
      expect(taskSignal!.text).toBe("Task xyz");
    });

    it("maps status 'todo' to 'pending'", () => {
      const update = makeToolCall("TaskUpdate", {
        taskId: "t1",
        status: "todo",
      });

      const signals = extractTaskSignals([update], SESSION_ID);
      const taskSignal = signals.find((s) => s.taskId === "t1");
      expect(taskSignal!.status).toBe("pending");
      expect(taskSignal!.source).toBe("task_create"); // pending => task_create source
    });

    it("preserves existing status when unknown status provided", () => {
      const create = makeToolCall("TaskCreate", { subject: "My task" });
      const createResult = makeUserMessage({ toolUseResult: { task: { id: "1" } } });
      const update = makeToolCall("TaskUpdate", {
        taskId: "1",
        status: "something_weird",
      });

      const signals = extractTaskSignals([create, createResult, update], SESSION_ID);
      const taskSignal = signals.find((s) => s.taskId === "1");
      expect(taskSignal!.status).toBe("pending"); // preserves original
    });

    it("updates subject when provided", () => {
      const create = makeToolCall("TaskCreate", { subject: "Old name" });
      const createResult = makeUserMessage({ toolUseResult: { task: { id: "1" } } });
      const update = makeToolCall("TaskUpdate", {
        taskId: "1",
        subject: "New name",
        status: "in_progress",
      });

      const signals = extractTaskSignals([create, createResult, update], SESSION_ID);
      const taskSignal = signals.find((s) => s.taskId === "1");
      expect(taskSignal!.text).toBe("New name");
    });
  });

  // ----------------------------------------------------------
  // TaskList
  // ----------------------------------------------------------
  describe("TaskList", () => {
    it("parses task list from toolUseResult.content", () => {
      const taskList = makeToolCall("TaskList", {});
      const result = makeUserMessage({
        toolUseResult: {
          content: "#1 [completed] Setup project\n#2 [in_progress] Build API\n#3 [pending] Write docs",
        },
      });

      const signals = extractTaskSignals([taskList, result], SESSION_ID);
      const listSignals = signals.filter((s) => s.source === "task_list");
      expect(listSignals).toHaveLength(3);

      expect(listSignals[0].taskId).toBe("1");
      expect(listSignals[0].text).toBe("Setup project");
      expect(listSignals[0].status).toBe("completed");

      expect(listSignals[1].taskId).toBe("2");
      expect(listSignals[1].text).toBe("Build API");
      expect(listSignals[1].status).toBe("in_progress");

      expect(listSignals[2].taskId).toBe("3");
      expect(listSignals[2].text).toBe("Write docs");
      expect(listSignals[2].status).toBe("pending");
    });

    it("parses task list from toolUseResult.text", () => {
      const taskList = makeToolCall("TaskList", {});
      const result = makeUserMessage({
        toolUseResult: {
          text: "#1 [done] Fix bug\n#2 [todo] Add tests",
        },
      });

      const signals = extractTaskSignals([taskList, result], SESSION_ID);
      const listSignals = signals.filter((s) => s.source === "task_list");
      expect(listSignals).toHaveLength(2);
      expect(listSignals[0].status).toBe("completed");
      expect(listSignals[1].status).toBe("pending");
    });

    it("parses task list from user_message text matching pattern", () => {
      const taskList = makeToolCall("TaskList", {}, { toolUseId: "tl-1" });
      const result = makeUserMessage({
        text: "#10 [completed] Refactor module\n#11 [in_progress] Optimize queries",
      });

      const signals = extractTaskSignals([taskList, result], SESSION_ID);
      const listSignals = signals.filter((s) => s.source === "task_list");
      expect(listSignals).toHaveLength(2);
      expect(listSignals[0].taskId).toBe("10");
      expect(listSignals[1].taskId).toBe("11");
    });

    it("parses task list from tool_result entry", () => {
      const taskList = makeToolCall("TaskList", {});
      const result = makeEntry({
        type: "tool_result",
        content: {
          toolResultContent: "#1 [completed] Done task",
        },
      });

      const signals = extractTaskSignals([taskList, result], SESSION_ID);
      const listSignals = signals.filter((s) => s.source === "task_list");
      expect(listSignals).toHaveLength(1);
      expect(listSignals[0].text).toBe("Done task");
    });

    it("returns empty when no result found within window", () => {
      const taskList = makeToolCall("TaskList", {});
      // 15 unrelated entries to push the result beyond the 10-entry window
      const filler = Array.from({ length: 15 }, () =>
        makeEntry({ type: "assistant_message", content: { text: "filler" } })
      );
      const result = makeUserMessage({
        toolUseResult: { content: "#1 [completed] Late result" },
      });

      const signals = extractTaskSignals([taskList, ...filler, result], SESSION_ID);
      const listSignals = signals.filter((s) => s.source === "task_list");
      expect(listSignals).toHaveLength(0);
    });

    it("maps unknown status to 'unknown'", () => {
      const taskList = makeToolCall("TaskList", {});
      const result = makeUserMessage({
        toolUseResult: { content: "#1 [blocked] Waiting on review" },
      });

      const signals = extractTaskSignals([taskList, result], SESSION_ID);
      const listSignals = signals.filter((s) => s.source === "task_list");
      expect(listSignals).toHaveLength(1);
      expect(listSignals[0].status).toBe("unknown");
    });
  });

  // ----------------------------------------------------------
  // TodoWrite
  // ----------------------------------------------------------
  describe("TodoWrite", () => {
    it("extracts todos from toolInput.todos array", () => {
      const entry = makeToolCall("TodoWrite", {
        todos: [
          { id: "t1", content: "Write unit tests", status: "in-progress" },
          { id: "t2", content: "Update README", status: "todo" },
          { id: "t3", content: "Fix linting", status: "done" },
        ],
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      const todoSignals = signals.filter((s) => s.source === "todo_write");
      expect(todoSignals).toHaveLength(3);

      expect(todoSignals[0].text).toBe("Write unit tests");
      expect(todoSignals[0].status).toBe("in_progress");
      expect(todoSignals[0].taskId).toBe("t1");

      expect(todoSignals[1].text).toBe("Update README");
      expect(todoSignals[1].status).toBe("pending");

      expect(todoSignals[2].text).toBe("Fix linting");
      expect(todoSignals[2].status).toBe("completed");
    });

    it("skips todos with empty content", () => {
      const entry = makeToolCall("TodoWrite", {
        todos: [
          { id: "t1", content: "", status: "todo" },
          { id: "t2", content: "Valid task", status: "todo" },
        ],
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      const todoSignals = signals.filter((s) => s.source === "todo_write");
      expect(todoSignals).toHaveLength(1);
      expect(todoSignals[0].text).toBe("Valid task");
    });

    it("defaults to pending when status is undefined", () => {
      const entry = makeToolCall("TodoWrite", {
        todos: [{ id: "t1", content: "No status" }],
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      const todoSignals = signals.filter((s) => s.source === "todo_write");
      expect(todoSignals).toHaveLength(1);
      expect(todoSignals[0].status).toBe("pending");
    });

    it("sets hasTaskToolCalls preventing file heuristics", () => {
      const todo = makeToolCall("TodoWrite", {
        todos: [{ id: "t1", content: "A todo", status: "todo" }],
      });
      const write = makeToolCall("Write", { file_path: "/src/index.ts" });

      const signals = extractTaskSignals([todo, write], SESSION_ID);
      expect(signals.filter((s) => s.source === "file_heuristic")).toHaveLength(0);
    });
  });

  // ----------------------------------------------------------
  // agent_progress
  // ----------------------------------------------------------
  describe("agent_progress", () => {
    it("extracts signal for assistant message type with description", () => {
      const entry = makeEntry({
        type: "agent_progress",
        content: {
          agentMessageType: "assistant",
          agentDescription: "Searched for relevant files",
          agentType: "Explore",
        },
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals).toHaveLength(1);
      expect(signals[0].source).toBe("agent_progress");
      expect(signals[0].text).toBe("[Explore] Searched for relevant files");
      expect(signals[0].status).toBe("completed");
    });

    it("skips non-assistant message types", () => {
      const entry = makeEntry({
        type: "agent_progress",
        content: {
          agentMessageType: "user",
          agentDescription: "User prompt to subagent",
        },
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals).toHaveLength(0);
    });

    it("falls back to truncated agentPrompt when no description", () => {
      const longPrompt = "A".repeat(150);
      const entry = makeEntry({
        type: "agent_progress",
        content: {
          agentMessageType: "assistant",
          agentPrompt: longPrompt,
          agentType: "Plan",
        },
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals).toHaveLength(1);
      expect(signals[0].text).toBe(`[Plan] ${"A".repeat(100)}...`);
    });

    it("uses prompt without truncation when <= 100 chars", () => {
      const entry = makeEntry({
        type: "agent_progress",
        content: {
          agentMessageType: "assistant",
          agentPrompt: "Short prompt",
          agentType: "unknown",
        },
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals).toHaveLength(1);
      // agentType "unknown" is skipped for prefix
      expect(signals[0].text).toBe("Short prompt");
    });

    it("skips when no description and no prompt", () => {
      const entry = makeEntry({
        type: "agent_progress",
        content: {
          agentMessageType: "assistant",
        },
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals).toHaveLength(0);
    });

    it("omits agent type prefix when type is 'unknown'", () => {
      const entry = makeEntry({
        type: "agent_progress",
        content: {
          agentMessageType: "assistant",
          agentDescription: "Did something",
          agentType: "unknown",
        },
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals[0].text).toBe("Did something");
    });
  });

  // ----------------------------------------------------------
  // bash_progress
  // ----------------------------------------------------------
  describe("bash_progress", () => {
    it("detects test runs from output keywords", () => {
      const entry = makeEntry({
        type: "bash_progress",
        content: {
          bashFullOutput: "Tests: 5 passed, 0 failed",
          bashElapsedSeconds: 3.5,
        },
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals).toHaveLength(1);
      expect(signals[0].source).toBe("bash_progress");
      expect(signals[0].text).toBe("Ran test (3.5s)");
      expect(signals[0].status).toBe("completed");
    });

    it("detects build commands", () => {
      const entry = makeEntry({
        type: "bash_progress",
        content: {
          bashOutput: "webpack bundle finished in 2.1s",
        },
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals).toHaveLength(1);
      expect(signals[0].text).toBe("Ran build");
      expect(signals[0].status).toBe("completed");
    });

    it("marks as in_progress when failures detected", () => {
      const entry = makeEntry({
        type: "bash_progress",
        content: {
          bashFullOutput: "Tests: 3 passed, 2 failed\nError: assertion failed",
          bashElapsedSeconds: 1.2,
        },
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals).toHaveLength(1);
      expect(signals[0].status).toBe("in_progress");
    });

    it("does not flag '0 fail' as failure", () => {
      const entry = makeEntry({
        type: "bash_progress",
        content: {
          bashFullOutput: "Tests: 10 passed, 0 failed, 0 errors",
        },
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals).toHaveLength(1);
      expect(signals[0].status).toBe("completed");
    });

    it("detects deploy keywords", () => {
      const entry = makeEntry({
        type: "bash_progress",
        content: {
          bashFullOutput: "Running deploy to staging\nUpload complete",
        },
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals).toHaveLength(1);
      expect(signals[0].text).toBe("Ran deploy");
    });

    it("returns null for output without relevant keywords", () => {
      const entry = makeEntry({
        type: "bash_progress",
        content: {
          bashFullOutput: "ls -la\ntotal 48\ndrwxr-xr-x",
        },
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals).toHaveLength(0);
    });

    it("returns null when no output present", () => {
      const entry = makeEntry({
        type: "bash_progress",
        content: {},
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals).toHaveLength(0);
    });

    it("includes elapsed time in text when available", () => {
      const entry = makeEntry({
        type: "bash_progress",
        content: {
          bashFullOutput: "webpack build completed",
          bashElapsedSeconds: 12.345,
        },
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals[0].text).toBe("Ran build (12.3s)");
    });
  });

  // ----------------------------------------------------------
  // File heuristic fallback
  // ----------------------------------------------------------
  describe("file heuristic fallback", () => {
    it("extracts Write file paths when no task tool calls", () => {
      const write = makeToolCall("Write", { file_path: "/src/components/Login.tsx" });

      const signals = extractTaskSignals([write], SESSION_ID);
      expect(signals).toHaveLength(1);
      expect(signals[0].source).toBe("file_heuristic");
      expect(signals[0].text).toBe("Modified Login.tsx");
      expect(signals[0].filePath).toBe("/src/components/Login.tsx");
      expect(signals[0].status).toBe("completed");
    });

    it("extracts Edit file paths", () => {
      const edit = makeToolCall("Edit", { file_path: "/src/utils/format.ts" });

      const signals = extractTaskSignals([edit], SESSION_ID);
      expect(signals).toHaveLength(1);
      expect(signals[0].text).toBe("Modified format.ts");
    });

    it("deduplicates file paths", () => {
      const write1 = makeToolCall("Write", { file_path: "/src/app.ts" });
      const write2 = makeToolCall("Write", { file_path: "/src/app.ts" });
      const edit = makeToolCall("Edit", { file_path: "/src/app.ts" });

      const signals = extractTaskSignals([write1, write2, edit], SESSION_ID);
      const fileSignals = signals.filter((s) => s.source === "file_heuristic");
      expect(fileSignals).toHaveLength(1);
    });

    it("is suppressed when any task tool call exists", () => {
      const taskList = makeToolCall("TaskList", {});
      // TaskList with no result produces no task_list signals but sets hasTaskToolCalls
      const write = makeToolCall("Write", { file_path: "/src/file.ts" });

      const signals = extractTaskSignals([taskList, write], SESSION_ID);
      const fileSignals = signals.filter((s) => s.source === "file_heuristic");
      expect(fileSignals).toHaveLength(0);
    });

    it("uses filename not full path in text", () => {
      const write = makeToolCall("Write", {
        file_path: "/very/deep/nested/path/to/component.tsx",
      });

      const signals = extractTaskSignals([write], SESSION_ID);
      expect(signals[0].text).toBe("Modified component.tsx");
    });
  });

  // ----------------------------------------------------------
  // Final output: TaskCreate/TaskUpdate state conversion
  // ----------------------------------------------------------
  describe("final state conversion", () => {
    it("emits task_create source for pending tasks", () => {
      const create = makeToolCall("TaskCreate", { subject: "Pending task" });
      const result = makeUserMessage({ toolUseResult: { task: { id: "1" } } });

      const signals = extractTaskSignals([create, result], SESSION_ID);
      const taskSignal = signals.find((s) => s.taskId === "1");
      expect(taskSignal!.source).toBe("task_create");
    });

    it("emits task_update source for non-pending tasks", () => {
      const create = makeToolCall("TaskCreate", { subject: "Updated task" });
      const createResult = makeUserMessage({ toolUseResult: { task: { id: "1" } } });
      const update = makeToolCall("TaskUpdate", { taskId: "1", status: "in-progress" });

      const signals = extractTaskSignals([create, createResult, update], SESSION_ID);
      const taskSignal = signals.find((s) => s.taskId === "1");
      expect(taskSignal!.source).toBe("task_update");
      expect(taskSignal!.status).toBe("in_progress");
    });

    it("includes all signal types in output", () => {
      const agentEntry = makeEntry({
        type: "agent_progress",
        content: {
          agentMessageType: "assistant",
          agentDescription: "Explored codebase",
          agentType: "Explore",
        },
      });
      const create = makeToolCall("TaskCreate", { subject: "Do thing" });
      const createResult = makeUserMessage({ toolUseResult: { task: { id: "1" } } });
      const taskList = makeToolCall("TaskList", {});
      const listResult = makeUserMessage({
        toolUseResult: { content: "#1 [completed] First" },
      });

      const signals = extractTaskSignals(
        [agentEntry, create, createResult, taskList, listResult],
        SESSION_ID
      );

      const sources = new Set(signals.map((s) => s.source));
      expect(sources.has("agent_progress")).toBe(true);
      expect(sources.has("task_list")).toBe(true);
      // TaskCreate with id "1" — task_create or task_update depending on state
      expect(sources.has("task_create") || sources.has("task_update")).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // Edge cases
  // ----------------------------------------------------------
  describe("edge cases", () => {
    it("returns empty array for empty entries", () => {
      const signals = extractTaskSignals([], SESSION_ID);
      expect(signals).toEqual([]);
    });

    it("ignores non-tool-call entries without special types", () => {
      const entries = [
        makeEntry({ type: "assistant_message", content: { text: "Hello" } }),
        makeEntry({ type: "system_event", content: { eventType: "start" } }),
        makeEntry({ type: "user_message", content: { text: "Help me" } }),
      ];

      const signals = extractTaskSignals(entries, SESSION_ID);
      expect(signals).toHaveLength(0);
    });

    it("skips tool_call entries without toolName", () => {
      const entry = makeEntry({
        type: "tool_call",
        content: { toolInput: { key: "value" } },
      });

      const signals = extractTaskSignals([entry], SESSION_ID);
      expect(signals).toHaveLength(0);
    });

    it("attaches sessionId to all signals", () => {
      const customSessionId = "custom-session-xyz";
      const entry = makeToolCall("TodoWrite", {
        todos: [{ id: "t1", content: "A task", status: "todo" }],
      });

      const signals = extractTaskSignals([entry], customSessionId);
      expect(signals.every((s) => s.sessionId === customSessionId)).toBe(true);
    });
  });
});

// ============================================================
// getModifiedFiles
// ============================================================

describe("getModifiedFiles", () => {
  it("returns Write file paths", () => {
    const entries = [
      makeToolCall("Write", { file_path: "/src/a.ts" }),
      makeToolCall("Write", { file_path: "/src/b.ts" }),
    ];

    const files = getModifiedFiles(entries);
    expect(files).toEqual(["/src/a.ts", "/src/b.ts"]);
  });

  it("returns Edit file paths", () => {
    const entries = [makeToolCall("Edit", { file_path: "/src/c.ts" })];

    const files = getModifiedFiles(entries);
    expect(files).toEqual(["/src/c.ts"]);
  });

  it("deduplicates paths across Write and Edit", () => {
    const entries = [
      makeToolCall("Write", { file_path: "/src/app.ts" }),
      makeToolCall("Edit", { file_path: "/src/app.ts" }),
      makeToolCall("Write", { file_path: "/src/app.ts" }),
    ];

    const files = getModifiedFiles(entries);
    expect(files).toEqual(["/src/app.ts"]);
  });

  it("ignores non-Write/Edit tool calls", () => {
    const entries = [
      makeToolCall("Read", { file_path: "/src/read.ts" }),
      makeToolCall("Bash", { command: "ls" }),
      makeToolCall("Write", { file_path: "/src/real.ts" }),
    ];

    const files = getModifiedFiles(entries);
    expect(files).toEqual(["/src/real.ts"]);
  });

  it("ignores non-tool_call entries", () => {
    const entries = [
      makeEntry({ type: "user_message", content: { text: "hello" } }),
      makeEntry({ type: "assistant_message", content: { text: "hi" } }),
    ];

    const files = getModifiedFiles(entries);
    expect(files).toEqual([]);
  });

  it("returns empty array for empty entries", () => {
    expect(getModifiedFiles([])).toEqual([]);
  });

  it("skips Write/Edit calls without file_path", () => {
    const entries = [
      makeToolCall("Write", {}),
      makeToolCall("Edit", { content: "some content" }),
    ];

    const files = getModifiedFiles(entries);
    expect(files).toEqual([]);
  });
});
