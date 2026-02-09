/**
 * Progress Computer Tests
 *
 * Tests for orchestrating plan progress computation,
 * including percentage calculation, caching, and error handling.
 */

import { jest } from "@jest/globals";
import { promises as realFs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { PlanEntry } from "../context/types.js";
import type { ParsedEntry } from "../session/parser.js";

// ============================================================
// Mock readSessionIndex (from cache module)
// ============================================================
const mockReadSessionIndex = jest.fn<() => Promise<any>>();

jest.unstable_mockModule("../cache/index.js", () => ({
  readSessionIndex: mockReadSessionIndex,
}));

// ============================================================
// Mock parseJSONL (from session parser)
// ============================================================
const mockParseJSONL = jest.fn<() => Promise<ParsedEntry[]>>();

jest.unstable_mockModule("../session/parser.js", () => ({
  parseJSONL: mockParseJSONL,
}));

// ============================================================
// Mock fs for cache operations
// ============================================================
const mockMkdir = jest.fn<(...args: any[]) => Promise<void>>();
const mockWriteFile = jest.fn<(...args: any[]) => Promise<void>>();
const mockReadFile = jest.fn<(...args: any[]) => Promise<string>>();
const mockUnlink = jest.fn<(...args: any[]) => Promise<void>>();
const mockRm = jest.fn<(...args: any[]) => Promise<void>>();

jest.unstable_mockModule("fs", () => ({
  existsSync: jest.fn(() => false),
  promises: {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
    readFile: mockReadFile,
    unlink: mockUnlink,
    rm: mockRm,
  },
}));

// ============================================================
// Test Helpers
// ============================================================

function makePlan(overrides?: Partial<PlanEntry>): PlanEntry {
  return {
    id: "test-plan",
    title: "Test Plan",
    filename: "test-plan.md",
    path: "plans/test-plan.md",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    sessions: ["session-1"],
    ...overrides,
  };
}

function makeSessionIndex(sessions: Array<{ id: string; jsonlPath?: string; modifiedAt?: string }>) {
  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      jsonlPath: s.jsonlPath || `/path/to/${s.id}.jsonl`,
      modifiedAt: s.modifiedAt || "2025-01-01T00:00:00Z",
    })),
  };
}

/** Create a simple tool_call entry for TaskCreate */
function makeTaskCreateEntry(subject: string, status = "pending"): ParsedEntry {
  return {
    type: "tool_call",
    uuid: "uuid-" + Math.random().toString(36).slice(2, 8),
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: "session-1",
    content: {
      toolName: "TaskCreate",
      toolInput: { subject, description: subject },
      toolUseId: "tool-" + Math.random().toString(36).slice(2, 8),
      toolUseResult: { id: subject.toLowerCase().replace(/\s+/g, "-") },
    },
  };
}

/** Create a tool_result for TaskCreate */
function makeTaskResultEntry(taskId: string): ParsedEntry {
  return {
    type: "tool_result",
    uuid: "uuid-" + Math.random().toString(36).slice(2, 8),
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: "session-1",
    content: {
      toolResultId: "tool-result-" + Math.random().toString(36).slice(2, 8),
      toolResultContent: `Created task #${taskId}`,
    },
  };
}

/** Create a TaskUpdate entry */
function makeTaskUpdateEntry(taskId: string, status: string): ParsedEntry {
  return {
    type: "tool_call",
    uuid: "uuid-" + Math.random().toString(36).slice(2, 8),
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: "session-1",
    content: {
      toolName: "TaskUpdate",
      toolInput: { taskId, status },
      toolUseId: "tool-" + Math.random().toString(36).slice(2, 8),
    },
  };
}

// ============================================================
// Tests
// ============================================================

describe("computePlanProgress", () => {
  let mod: typeof import("./progress-computer.js");

  beforeEach(async () => {
    jest.clearAllMocks();
    // Cache read always misses (no cached progress)
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    // Cache write succeeds
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    mod = await import("./progress-computer.js");
  });

  it("returns 100% when all items have completed signals", async () => {
    const plan = makePlan({ sessions: ["s1"] });
    const planContent = "# Plan\n## Phase 1\n- [x] Task A\n- [x] Task B";

    mockReadSessionIndex.mockResolvedValue(
      makeSessionIndex([{ id: "s1" }])
    );
    // Return entries with TaskCreate + TaskUpdate completed for both tasks
    mockParseJSONL.mockResolvedValue([
      makeTaskCreateEntry("Task A"),
      makeTaskUpdateEntry("task-a", "completed"),
      makeTaskCreateEntry("Task B"),
      makeTaskUpdateEntry("task-b", "completed"),
    ]);

    const result = await mod.computePlanProgress(plan, planContent, "/project");

    expect(result.summary.percentage).toBe(100);
    expect(result.summary.completed).toBe(2);
    expect(result.summary.total).toBe(2);
    expect(result.planId).toBe("test-plan");
  });

  it("returns 0% when no items are matched", async () => {
    const plan = makePlan({ sessions: ["s1"] });
    const planContent = "# Plan\n## Phase 1\n- Item A\n- Item B\n- Item C";

    mockReadSessionIndex.mockResolvedValue(
      makeSessionIndex([{ id: "s1" }])
    );
    // Return empty entries — no task signals
    mockParseJSONL.mockResolvedValue([]);

    const result = await mod.computePlanProgress(plan, planContent, "/project");

    expect(result.summary.percentage).toBe(0);
    expect(result.summary.notStarted).toBe(3);
    expect(result.summary.total).toBe(3);
  });

  it("computes mixed progress correctly", async () => {
    const plan = makePlan({ sessions: ["s1"] });
    const planContent = "# Plan\n- [x] Done item\n- [ ] Not done item\n- [ ] Also not done";

    mockReadSessionIndex.mockResolvedValue(
      makeSessionIndex([{ id: "s1" }])
    );
    mockParseJSONL.mockResolvedValue([]);

    const result = await mod.computePlanProgress(plan, planContent, "/project");

    // [x] Done item is checked in source → completed
    // [ ] Not done item → not_started (no matching signals)
    // [ ] Also not done → not_started
    expect(result.summary.completed).toBe(1);
    expect(result.summary.notStarted).toBe(2);
    expect(result.summary.percentage).toBe(33); // Math.round(1/3 * 100) = 33
  });

  it("skips sessions without jsonlPath", async () => {
    const plan = makePlan({ sessions: ["s1", "s2"] });
    const planContent = "# Plan\n- Item A";

    mockReadSessionIndex.mockResolvedValue({
      sessions: [
        { id: "s1", modifiedAt: "2025-01-01T00:00:00Z" },
        { id: "s2", jsonlPath: "/path/to/s2.jsonl", modifiedAt: "2025-01-01T00:00:00Z" },
      ],
    });
    mockParseJSONL.mockResolvedValue([]);

    const result = await mod.computePlanProgress(plan, planContent, "/project");

    // Should only call parseJSONL for s2 (s1 has no jsonlPath)
    expect(mockParseJSONL).toHaveBeenCalledTimes(1);
    expect(mockParseJSONL).toHaveBeenCalledWith("/path/to/s2.jsonl");
    expect(result.sessionIds).toEqual(["s2"]);
  });

  it("skips sessions when JSONL parsing fails", async () => {
    const plan = makePlan({ sessions: ["s1"] });
    const planContent = "# Plan\n- Item A";

    mockReadSessionIndex.mockResolvedValue(
      makeSessionIndex([{ id: "s1" }])
    );
    mockParseJSONL.mockRejectedValue(new Error("File not found"));

    const result = await mod.computePlanProgress(plan, planContent, "/project");

    expect(result.sessionIds).toEqual([]);
    expect(result.summary.total).toBe(1);
    expect(result.summary.notStarted).toBe(1);
  });

  it("excludes headings from trackable items", async () => {
    const plan = makePlan({ sessions: ["s1"] });
    const planContent = "# Plan\n## Phase 1\n- Task A\n## Phase 2\n- Task B";

    mockReadSessionIndex.mockResolvedValue(
      makeSessionIndex([{ id: "s1" }])
    );
    mockParseJSONL.mockResolvedValue([]);

    const result = await mod.computePlanProgress(plan, planContent, "/project");

    // 2 headings (## Phase 1, ## Phase 2) excluded, 2 tasks counted
    expect(result.summary.total).toBe(2);
  });

  it("writes progress to cache after computation", async () => {
    const plan = makePlan({ sessions: ["s1"] });
    const planContent = "# Plan\n- Item A";

    mockReadSessionIndex.mockResolvedValue(
      makeSessionIndex([{ id: "s1" }])
    );
    mockParseJSONL.mockResolvedValue([]);

    await mod.computePlanProgress(plan, planContent, "/project");

    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
    // Verify it wrote a JSON string with planId
    const writtenContent = mockWriteFile.mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('"test-plan"');
  });
});

describe("computePlanProgressSummary", () => {
  let mod: typeof import("./progress-computer.js");

  beforeEach(async () => {
    jest.clearAllMocks();
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mod = await import("./progress-computer.js");
  });

  it("returns percentage from full progress computation", async () => {
    const plan = makePlan({ sessions: ["s1"] });
    const planContent = "# Plan\n- [x] Done\n- [ ] Not done";

    mockReadSessionIndex.mockResolvedValue(
      makeSessionIndex([{ id: "s1" }])
    );
    mockParseJSONL.mockResolvedValue([]);

    const result = await mod.computePlanProgressSummary(plan, planContent, "/project");

    expect(result.planId).toBe("test-plan");
    expect(result.percentage).toBe(50);
    expect(result.loading).toBe(false);
  });

  it("returns 0% on error", async () => {
    const plan = makePlan({ sessions: ["s1"] });

    // readSessionIndex throws
    mockReadSessionIndex.mockRejectedValue(new Error("Index not found"));

    const result = await mod.computePlanProgressSummary(plan, "# Plan\n- Item", "/project");

    expect(result.planId).toBe("test-plan");
    expect(result.percentage).toBe(0);
    expect(result.loading).toBe(false);
  });
});

describe("clearProgressCache", () => {
  let mod: typeof import("./progress-computer.js");

  beforeEach(async () => {
    jest.clearAllMocks();
    mod = await import("./progress-computer.js");
  });

  it("attempts to unlink the cache file", async () => {
    mockUnlink.mockResolvedValue(undefined);

    await mod.clearProgressCache("my-plan");

    expect(mockUnlink).toHaveBeenCalledTimes(1);
    const path = mockUnlink.mock.calls[0]?.[0] as string;
    expect(path).toContain("my-plan.json");
  });

  it("does not throw when file does not exist", async () => {
    mockUnlink.mockRejectedValue(new Error("ENOENT"));

    await expect(mod.clearProgressCache("nonexistent")).resolves.toBeUndefined();
  });
});

describe("clearAllProgressCache", () => {
  let mod: typeof import("./progress-computer.js");

  beforeEach(async () => {
    jest.clearAllMocks();
    mod = await import("./progress-computer.js");
  });

  it("removes the entire cache directory", async () => {
    mockRm.mockResolvedValue(undefined);

    await mod.clearAllProgressCache();

    expect(mockRm).toHaveBeenCalledTimes(1);
    const args = mockRm.mock.calls[0];
    expect(args?.[1]).toEqual({ recursive: true, force: true });
  });

  it("does not throw when directory does not exist", async () => {
    mockRm.mockRejectedValue(new Error("ENOENT"));

    await expect(mod.clearAllProgressCache()).resolves.toBeUndefined();
  });
});
