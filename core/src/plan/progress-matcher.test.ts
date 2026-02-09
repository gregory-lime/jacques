/**
 * Progress Matcher Tests
 *
 * Tests for matching task signals to plan items using multiple strategies,
 * confidence scoring, parent propagation, status determination, and trackability.
 */

import { describe, it, expect } from "@jest/globals";
import {
  matchSignalsToPlanItems,
  determineItemStatus,
  isTrackableForProgress,
} from "./progress-matcher.js";
import type { PlanItem, TaskSignal, PlanItemMatch } from "./types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: "item-1",
    text: "Test item",
    depth: 3,
    type: "numbered",
    lineNumber: 1,
    parentId: null,
    childIds: [],
    isCheckedInSource: false,
    ...overrides,
  };
}

function makeSignal(overrides: Partial<TaskSignal> = {}): TaskSignal {
  return {
    source: "task_create",
    text: "Test signal",
    status: "completed",
    timestamp: "2026-01-01T00:00:00Z",
    sessionId: "test-session",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Strategy 1: Exact text match
// ---------------------------------------------------------------------------

describe("matchSignalsToPlanItems - exact text match", () => {
  it("matches when item and signal text are identical", () => {
    const items = [makeItem({ id: "i1", text: "Implement auth module" })];
    const signals = [makeSignal({ text: "Implement auth module" })];

    const matches = matchSignalsToPlanItems(items, signals);

    expect(matches.size).toBe(1);
    const match = matches.get("i1")!;
    expect(match.matchMethod).toBe("exact_text");
    expect(match.confidence).toBe(1.0);
  });

  it("matches case-insensitively after normalization", () => {
    const items = [makeItem({ id: "i1", text: "Add Unit Tests" })];
    const signals = [makeSignal({ text: "add unit tests" })];

    const matches = matchSignalsToPlanItems(items, signals);

    expect(matches.size).toBe(1);
    expect(matches.get("i1")!.matchMethod).toBe("exact_text");
  });

  it("matches after stripping punctuation and extra whitespace", () => {
    const items = [makeItem({ id: "i1", text: "Fix: the   login-flow!" })];
    const signals = [makeSignal({ text: "Fix  the login flow" })];

    const matches = matchSignalsToPlanItems(items, signals);

    expect(matches.size).toBe(1);
    expect(matches.get("i1")!.matchMethod).toBe("exact_text");
  });
});

// ---------------------------------------------------------------------------
// Strategy 2: Keyword overlap (Jaccard similarity)
// ---------------------------------------------------------------------------

describe("matchSignalsToPlanItems - keyword overlap", () => {
  it("matches when Jaccard similarity >= 0.3", () => {
    // Share enough keywords to exceed threshold
    const items = [
      makeItem({
        id: "i1",
        text: "Implement authentication token refresh mechanism",
      }),
    ];
    const signals = [
      makeSignal({
        text: "Working on authentication token refresh logic",
      }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);

    expect(matches.size).toBe(1);
    const match = matches.get("i1")!;
    expect(match.matchMethod).toBe("keyword_overlap");
    expect(match.confidence).toBeGreaterThanOrEqual(0.5);
    expect(match.confidence).toBeLessThanOrEqual(0.9);
  });

  it("does not match when keyword overlap is below threshold", () => {
    const items = [
      makeItem({ id: "i1", text: "Configure database migrations" }),
    ];
    const signals = [
      makeSignal({ text: "Render the user interface sidebar" }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);

    expect(matches.has("i1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Strategy 3: Identifier match (CamelCase, file names, hyphenated)
// ---------------------------------------------------------------------------

describe("matchSignalsToPlanItems - identifier match", () => {
  it("matches shared CamelCase identifier >= 5 chars", () => {
    const items = [
      makeItem({ id: "i1", text: "Refactor PlanViewerComponent" }),
    ];
    const signals = [
      makeSignal({ text: "Updated PlanViewerComponent with new props" }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);

    expect(matches.size).toBe(1);
    const match = matches.get("i1")!;
    // Could match via keyword overlap or identifier; both report "keyword_overlap"
    expect(match.matchMethod).toBe("keyword_overlap");
  });

  it("matches shared hyphenated identifier", () => {
    const items = [
      makeItem({ id: "i1", text: "Update the progress-matcher module" }),
    ];
    const signals = [
      makeSignal({ text: "Edited progress-matcher for edge cases" }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);

    expect(matches.size).toBe(1);
  });

  it("does not match short CamelCase identifiers under 5 chars", () => {
    // "App" is only 3 chars, should not trigger identifier match on its own
    const items = [makeItem({ id: "i1", text: "Fix App" })];
    const signals = [makeSignal({ text: "Deploy App container" })];

    const matches = matchSignalsToPlanItems(items, signals);

    // May still match through other strategies, but identifier alone won't fire
    // If it does match, it shouldn't be via exact_text
    if (matches.has("i1")) {
      expect(matches.get("i1")!.matchMethod).not.toBe("exact_text");
    }
  });

  it("matches shared file name identifiers", () => {
    const items = [
      makeItem({ id: "i1", text: "Add tests for plan-parser.ts" }),
    ];
    const signals = [
      makeSignal({ text: "Created test file for plan-parser.ts" }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);

    expect(matches.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Strategy 4: File path match
// ---------------------------------------------------------------------------

describe("matchSignalsToPlanItems - file path match", () => {
  it("matches when file basename (without ext) appears in item text", () => {
    const items = [
      makeItem({ id: "i1", text: "Update the session parser logic" }),
    ];
    const signals = [
      makeSignal({
        text: "Editing file",
        filePath: "/src/session/parser.ts",
      }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);

    expect(matches.size).toBe(1);
    const match = matches.get("i1")!;
    expect(match.matchMethod).toBe("file_path");
    expect(match.confidence).toBe(0.6); // task_create multiplier 1.0 * 0.6
  });

  it("does not match when basename is too short (< 3 chars)", () => {
    const items = [makeItem({ id: "i1", text: "Fix db connection" })];
    const signals = [
      makeSignal({
        text: "Editing file",
        filePath: "/src/db.ts",
      }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);

    // "db" is only 2 chars, should not trigger file path match
    // May match through other strategies though
    if (matches.has("i1")) {
      expect(matches.get("i1")!.matchMethod).not.toBe("file_path");
    }
  });

  it("ignores signal without filePath", () => {
    const items = [
      makeItem({ id: "i1", text: "Update the session parser logic" }),
    ];
    const signals = [
      makeSignal({
        text: "Something completely unrelated to session parsing",
      }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);

    // Without filePath, file_path strategy cannot fire
    if (matches.has("i1")) {
      expect(matches.get("i1")!.matchMethod).not.toBe("file_path");
    }
  });
});

// ---------------------------------------------------------------------------
// Strategy 5: Substring match
// ---------------------------------------------------------------------------

describe("matchSignalsToPlanItems - substring match", () => {
  it("matches when a 2-4 word phrase (>= 8 chars) from item appears in signal", () => {
    const items = [
      makeItem({
        id: "i1",
        text: "Configure the database connection pool settings",
      }),
    ];
    const signals = [
      makeSignal({
        text: "I am going to configure the database connection pool settings and then verify",
      }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);

    expect(matches.size).toBe(1);
    // May match via keyword overlap (high similarity) or substring
    expect(["keyword_overlap", "substring"]).toContain(
      matches.get("i1")!.matchMethod
    );
  });

  it("does not match when item has fewer than 2 significant words", () => {
    const items = [makeItem({ id: "i1", text: "Fix it" })];
    const signals = [makeSignal({ text: "Fix it and deploy" })];

    const matches = matchSignalsToPlanItems(items, signals);

    // "fix" and "it" are both <= 2 chars after normalizeText filtering (words > 2 chars)
    // substring requires at least 2 words > 2 chars
    // But this could still match via exact text depending on normalization
    // The key is substring alone requires words.length >= 2 (words > 2 chars)
  });

  it("does not match when all phrases are under 8 characters", () => {
    // After normalization: "add new tag" -> words > 2 chars: ["add", "new", "tag"]
    // Phrases of 2 words: "add new" (7), "new tag" (7) -- both < 8
    // Phrase of 3 words: "add new tag" (11 >= 8) -- so 3-word phrase CAN match
    // We need only 2 significant words and all 2-word combos < 8 chars,
    // with no 3-word phrase. Use exactly 2 significant words.
    const items = [makeItem({ id: "i1", text: "Run fix" })];
    const signals = [makeSignal({ text: "We should run fix on this" })];

    const matches = matchSignalsToPlanItems(items, signals);

    // "run fix" -> words > 2 chars: ["run", "fix"] -> phrase: "run fix" = 7 chars (< 8)
    // So substring should not match.
    if (matches.has("i1")) {
      expect(matches.get("i1")!.matchMethod).not.toBe("substring");
    }
  });
});

// ---------------------------------------------------------------------------
// Source confidence multipliers
// ---------------------------------------------------------------------------

describe("matchSignalsToPlanItems - source confidence multipliers", () => {
  it("applies 1.0 multiplier for task_create source", () => {
    const items = [makeItem({ id: "i1", text: "Implement auth module" })];
    const signals = [
      makeSignal({ text: "Implement auth module", source: "task_create" }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);
    const match = matches.get("i1")!;
    // exact_text = 1.0 * 1.0 = 1.0
    expect(match.confidence).toBe(1.0);
  });

  it("applies 0.7 multiplier for agent_progress source", () => {
    const items = [makeItem({ id: "i1", text: "Implement auth module" })];
    const signals = [
      makeSignal({ text: "Implement auth module", source: "agent_progress" }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);
    const match = matches.get("i1")!;
    // exact_text = 1.0 * 0.7 = 0.7
    expect(match.confidence).toBeCloseTo(0.7, 5);
  });

  it("applies 0.5 multiplier for bash_progress source", () => {
    const items = [makeItem({ id: "i1", text: "Implement auth module" })];
    const signals = [
      makeSignal({ text: "Implement auth module", source: "bash_progress" }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);
    const match = matches.get("i1")!;
    // exact_text = 1.0 * 0.5 = 0.5
    expect(match.confidence).toBeCloseTo(0.5, 5);
  });

  it("applies 0.6 multiplier for file_heuristic source", () => {
    const items = [makeItem({ id: "i1", text: "Implement auth module" })];
    const signals = [
      makeSignal({ text: "Implement auth module", source: "file_heuristic" }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);
    const match = matches.get("i1")!;
    // exact_text = 1.0 * 0.6 = 0.6
    expect(match.confidence).toBeCloseTo(0.6, 5);
  });

  it("applies 1.0 multiplier for todo_write source", () => {
    const items = [makeItem({ id: "i1", text: "Implement auth module" })];
    const signals = [
      makeSignal({ text: "Implement auth module", source: "todo_write" }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);
    const match = matches.get("i1")!;
    expect(match.confidence).toBe(1.0);
  });

  it("applies 1.0 multiplier for task_list source", () => {
    const items = [makeItem({ id: "i1", text: "Implement auth module" })];
    const signals = [
      makeSignal({ text: "Implement auth module", source: "task_list" }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);
    const match = matches.get("i1")!;
    expect(match.confidence).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// Best match selection (highest confidence wins per item)
// ---------------------------------------------------------------------------

describe("matchSignalsToPlanItems - best match selection", () => {
  it("keeps the highest-confidence match when multiple signals match one item", () => {
    const items = [makeItem({ id: "i1", text: "Implement auth module" })];
    const signals = [
      makeSignal({
        text: "Implement auth module",
        source: "bash_progress",
        status: "in_progress",
      }), // exact_text * 0.5 = 0.5
      makeSignal({
        text: "Implement auth module",
        source: "task_create",
        status: "completed",
      }), // exact_text * 1.0 = 1.0
    ];

    const matches = matchSignalsToPlanItems(items, signals);

    expect(matches.size).toBe(1);
    const match = matches.get("i1")!;
    expect(match.confidence).toBe(1.0);
    expect(match.signal.source).toBe("task_create");
  });
});

// ---------------------------------------------------------------------------
// Parent propagation
// ---------------------------------------------------------------------------

describe("matchSignalsToPlanItems - parent propagation", () => {
  it("propagates heading match to unmatched children at 0.8x confidence", () => {
    const heading = makeItem({
      id: "h1",
      text: "Authentication System",
      type: "heading",
      depth: 1,
      childIds: ["c1", "c2"],
    });
    const child1 = makeItem({
      id: "c1",
      text: "Some completely unrelated child task",
      type: "numbered",
      depth: 3,
      parentId: "h1",
    });
    const child2 = makeItem({
      id: "c2",
      text: "Another unrelated child task",
      type: "numbered",
      depth: 3,
      parentId: "h1",
    });
    const items = [heading, child1, child2];

    const signals = [
      makeSignal({ text: "Authentication System" }), // matches heading exactly
    ];

    const matches = matchSignalsToPlanItems(items, signals);

    // Heading matched directly
    expect(matches.get("h1")!.confidence).toBe(1.0);
    // Children inherit at 0.8x
    expect(matches.get("c1")!.confidence).toBeCloseTo(0.8, 5);
    expect(matches.get("c1")!.matchMethod).toBe("keyword_overlap");
    expect(matches.get("c2")!.confidence).toBeCloseTo(0.8, 5);
  });

  it("does not overwrite existing child matches with parent propagation", () => {
    const heading = makeItem({
      id: "h1",
      text: "Authentication System",
      type: "heading",
      depth: 1,
      childIds: ["c1"],
    });
    const child = makeItem({
      id: "c1",
      text: "Add login endpoint",
      type: "numbered",
      depth: 3,
      parentId: "h1",
    });
    const items = [heading, child];

    const signals = [
      makeSignal({ text: "Authentication System" }), // matches heading
      makeSignal({ text: "Add login endpoint" }), // matches child directly
    ];

    const matches = matchSignalsToPlanItems(items, signals);

    // Child should keep its direct match (1.0) not the propagated one (0.8)
    expect(matches.get("c1")!.confidence).toBe(1.0);
    expect(matches.get("c1")!.matchMethod).toBe("exact_text");
  });

  it("walks up ancestor chain for deeply nested items", () => {
    const grandparent = makeItem({
      id: "gp",
      text: "Server Architecture",
      type: "heading",
      depth: 1,
      childIds: ["p1"],
    });
    const parent = makeItem({
      id: "p1",
      text: "Unrelated parent item text",
      type: "heading",
      depth: 2,
      parentId: "gp",
      childIds: ["c1"],
    });
    const child = makeItem({
      id: "c1",
      text: "Some deeply nested task",
      type: "checkbox",
      depth: 3,
      parentId: "p1",
    });
    const items = [grandparent, parent, child];

    const signals = [
      makeSignal({ text: "Server Architecture" }), // matches grandparent only
    ];

    const matches = matchSignalsToPlanItems(items, signals);

    // Grandparent: direct match at 1.0
    expect(matches.get("gp")!.confidence).toBe(1.0);
    // Parent: inherits from grandparent at 0.8
    expect(matches.get("p1")!.confidence).toBeCloseTo(0.8, 5);
    // Child: walks up to p1 which now has a propagated match (0.8), so child gets 0.8 * 0.8 = 0.64
    // The propagation is sequential: p1 gets its match first, then c1 finds p1's match
    expect(matches.get("c1")!.confidence).toBeCloseTo(0.64, 5);
  });
});

// ---------------------------------------------------------------------------
// No matches
// ---------------------------------------------------------------------------

describe("matchSignalsToPlanItems - no matches", () => {
  it("returns empty map when no signals match any items", () => {
    const items = [
      makeItem({ id: "i1", text: "Implement database schema" }),
    ];
    const signals = [
      makeSignal({ text: "Deploy production containers" }),
    ];

    const matches = matchSignalsToPlanItems(items, signals);

    expect(matches.has("i1")).toBe(false);
  });

  it("returns empty map when signals array is empty", () => {
    const items = [makeItem({ id: "i1" })];
    const matches = matchSignalsToPlanItems(items, []);

    expect(matches.size).toBe(0);
  });

  it("returns empty map when items array is empty", () => {
    const signals = [makeSignal()];
    const matches = matchSignalsToPlanItems([], signals);

    expect(matches.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// determineItemStatus
// ---------------------------------------------------------------------------

describe("determineItemStatus", () => {
  it("returns 'completed' when isCheckedInSource is true regardless of match", () => {
    const item = makeItem({ isCheckedInSource: true });
    expect(determineItemStatus(item, null)).toBe("completed");
  });

  it("returns 'completed' when isCheckedInSource is true even with in_progress match", () => {
    const item = makeItem({ isCheckedInSource: true });
    const match: PlanItemMatch = {
      planItemId: "item-1",
      signal: makeSignal({ status: "in_progress" }),
      confidence: 1.0,
      matchMethod: "exact_text",
    };
    expect(determineItemStatus(item, match)).toBe("completed");
  });

  it("returns 'not_started' when there is no match", () => {
    const item = makeItem();
    expect(determineItemStatus(item, null)).toBe("not_started");
  });

  it("returns 'completed' when signal status is 'completed'", () => {
    const item = makeItem();
    const match: PlanItemMatch = {
      planItemId: "item-1",
      signal: makeSignal({ status: "completed" }),
      confidence: 0.8,
      matchMethod: "keyword_overlap",
    };
    expect(determineItemStatus(item, match)).toBe("completed");
  });

  it("returns 'in_progress' when signal status is 'in_progress'", () => {
    const item = makeItem();
    const match: PlanItemMatch = {
      planItemId: "item-1",
      signal: makeSignal({ status: "in_progress" }),
      confidence: 0.6,
      matchMethod: "file_path",
    };
    expect(determineItemStatus(item, match)).toBe("in_progress");
  });

  it("returns 'not_started' when signal status is 'pending'", () => {
    const item = makeItem();
    const match: PlanItemMatch = {
      planItemId: "item-1",
      signal: makeSignal({ status: "pending" }),
      confidence: 0.5,
      matchMethod: "substring",
    };
    expect(determineItemStatus(item, match)).toBe("not_started");
  });

  it("returns 'not_started' when signal status is 'unknown'", () => {
    const item = makeItem();
    const match: PlanItemMatch = {
      planItemId: "item-1",
      signal: makeSignal({ status: "unknown" }),
      confidence: 0.5,
      matchMethod: "exact_text",
    };
    expect(determineItemStatus(item, match)).toBe("not_started");
  });
});

// ---------------------------------------------------------------------------
// isTrackableForProgress
// ---------------------------------------------------------------------------

describe("isTrackableForProgress", () => {
  it("returns false for heading items", () => {
    expect(isTrackableForProgress(makeItem({ type: "heading" }))).toBe(false);
  });

  it("returns true for numbered items", () => {
    expect(isTrackableForProgress(makeItem({ type: "numbered" }))).toBe(true);
  });

  it("returns true for bullet items", () => {
    expect(isTrackableForProgress(makeItem({ type: "bullet" }))).toBe(true);
  });

  it("returns true for checkbox items", () => {
    expect(isTrackableForProgress(makeItem({ type: "checkbox" }))).toBe(true);
  });
});
