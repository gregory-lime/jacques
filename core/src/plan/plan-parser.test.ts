/**
 * Plan Parser Tests
 *
 * Tests for parsing plan markdown into structured trackable items,
 * text normalization, and keyword extraction.
 */

import { describe, it, expect } from "@jest/globals";
import {
  parsePlanMarkdown,
  normalizeText,
  extractKeywords,
} from "./plan-parser.js";

describe("parsePlanMarkdown", () => {
  describe("numbered items", () => {
    it("parses numbered items with type 'numbered' and base depth 3", () => {
      const result = parsePlanMarkdown("1. First item\n2. Second item");
      expect(result.items).toHaveLength(2);
      expect(result.items[0].type).toBe("numbered");
      expect(result.items[0].text).toBe("First item");
      expect(result.items[0].depth).toBe(3);
      expect(result.items[1].type).toBe("numbered");
      expect(result.items[1].text).toBe("Second item");
    });

    it("handles multi-digit numbered items", () => {
      const result = parsePlanMarkdown("10. Tenth item\n99. Ninety-ninth");
      expect(result.items).toHaveLength(2);
      expect(result.items[0].text).toBe("Tenth item");
      expect(result.items[1].text).toBe("Ninety-ninth");
    });

    it("applies indentation to numbered items", () => {
      const result = parsePlanMarkdown("1. Top level\n  1. Indented once\n    1. Indented twice");
      expect(result.items[0].depth).toBe(3);
      expect(result.items[1].depth).toBe(4);
      expect(result.items[2].depth).toBe(5);
    });
  });

  describe("bullet items", () => {
    it("parses dash bullets with type 'bullet' and base depth 3", () => {
      const result = parsePlanMarkdown("- Dash bullet");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe("bullet");
      expect(result.items[0].text).toBe("Dash bullet");
      expect(result.items[0].depth).toBe(3);
    });

    it("parses asterisk bullets with type 'bullet'", () => {
      const result = parsePlanMarkdown("* Star bullet");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe("bullet");
      expect(result.items[0].text).toBe("Star bullet");
    });

    it("applies indentation to bullet items", () => {
      const result = parsePlanMarkdown("- Top\n  - Nested\n    - Deep");
      expect(result.items[0].depth).toBe(3);
      expect(result.items[1].depth).toBe(4);
      expect(result.items[2].depth).toBe(5);
    });
  });

  describe("checkbox items", () => {
    it("parses unchecked checkbox with isCheckedInSource false", () => {
      const result = parsePlanMarkdown("- [ ] Unchecked task");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe("checkbox");
      expect(result.items[0].text).toBe("Unchecked task");
      expect(result.items[0].isCheckedInSource).toBe(false);
    });

    it("parses checked checkbox (lowercase x) with isCheckedInSource true", () => {
      const result = parsePlanMarkdown("- [x] Done task");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe("checkbox");
      expect(result.items[0].isCheckedInSource).toBe(true);
    });

    it("parses checked checkbox (uppercase X) with isCheckedInSource true", () => {
      const result = parsePlanMarkdown("- [X] Also done");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].isCheckedInSource).toBe(true);
    });

    it("parses asterisk checkboxes", () => {
      const result = parsePlanMarkdown("* [x] Star checkbox");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe("checkbox");
      expect(result.items[0].text).toBe("Star checkbox");
      expect(result.items[0].isCheckedInSource).toBe(true);
    });

    it("applies indentation to checkbox items", () => {
      const result = parsePlanMarkdown("- [ ] Top\n  - [x] Nested");
      expect(result.items[0].depth).toBe(3);
      expect(result.items[1].depth).toBe(4);
    });
  });

  describe("headings", () => {
    it("parses ## heading with depth 1", () => {
      const result = parsePlanMarkdown("## Section");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe("heading");
      expect(result.items[0].text).toBe("Section");
      expect(result.items[0].depth).toBe(1);
    });

    it("parses ### heading with depth 2", () => {
      const result = parsePlanMarkdown("### Subsection");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe("heading");
      expect(result.items[0].depth).toBe(2);
    });

    it("skips top-level # heading", () => {
      const result = parsePlanMarkdown("# Title\n\n## Real section");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].text).toBe("Real section");
      expect(result.items[0].type).toBe("heading");
    });

    it("skips top-level heading but keeps all sub-headings", () => {
      const result = parsePlanMarkdown(
        "# Plan Title\n## Phase 1\n### Step A\n## Phase 2"
      );
      expect(result.items).toHaveLength(3);
      expect(result.items.map((i) => i.text)).toEqual([
        "Phase 1",
        "Step A",
        "Phase 2",
      ]);
    });
  });

  describe("skipped content", () => {
    it("skips content inside code blocks", () => {
      const md = "- Before\n```\n- Inside code\n1. Also inside\n```\n- After";
      const result = parsePlanMarkdown(md);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].text).toBe("Before");
      expect(result.items[1].text).toBe("After");
    });

    it("skips fenced code blocks with language tag", () => {
      const md = "- Before\n```typescript\nconst x = 1;\n```\n- After";
      const result = parsePlanMarkdown(md);
      expect(result.items).toHaveLength(2);
    });

    it("skips table lines", () => {
      const md = "- Item\n| Col A | Col B |\n|-------|-------|\n| val | val |\n- After table";
      const result = parsePlanMarkdown(md);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].text).toBe("Item");
      expect(result.items[1].text).toBe("After table");
    });

    it("skips blockquote lines", () => {
      const md = "- Item\n> This is a quote\n- After quote";
      const result = parsePlanMarkdown(md);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].text).toBe("Item");
      expect(result.items[1].text).toBe("After quote");
    });

    it("skips empty lines", () => {
      const md = "- First\n\n\n- Second";
      const result = parsePlanMarkdown(md);
      expect(result.items).toHaveLength(2);
    });

    it("skips plain paragraph text", () => {
      const md = "Some paragraph text\n- Actual item\nMore paragraph text";
      const result = parsePlanMarkdown(md);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].text).toBe("Actual item");
    });
  });

  describe("line numbers and IDs", () => {
    it("assigns 1-indexed line numbers", () => {
      const md = "## Heading\n- Item one\n- Item two";
      const result = parsePlanMarkdown(md);
      expect(result.items[0].lineNumber).toBe(1);
      expect(result.items[1].lineNumber).toBe(2);
      expect(result.items[2].lineNumber).toBe(3);
    });

    it("assigns sequential IDs starting from item-1", () => {
      const md = "## A\n- B\n- C";
      const result = parsePlanMarkdown(md);
      expect(result.items[0].id).toBe("item-1");
      expect(result.items[1].id).toBe("item-2");
      expect(result.items[2].id).toBe("item-3");
    });

    it("skips line numbers for non-trackable lines", () => {
      const md = "# Title\n\n## Section\n- Item";
      const result = parsePlanMarkdown(md);
      // # Title is line 1 (skipped), empty is line 2, ## Section is line 3, - Item is line 4
      expect(result.items[0].lineNumber).toBe(3);
      expect(result.items[1].lineNumber).toBe(4);
    });

    it("does not count skipped top-level heading in item IDs", () => {
      const md = "# Title\n## Section";
      const result = parsePlanMarkdown(md);
      // # Title is skipped and counter is decremented
      expect(result.items[0].id).toBe("item-1");
    });
  });

  describe("lineToItem map", () => {
    it("maps line numbers to their items", () => {
      const md = "## Heading\n- Bullet";
      const result = parsePlanMarkdown(md);
      expect(result.lineToItem.get(1)).toBe(result.items[0]);
      expect(result.lineToItem.get(2)).toBe(result.items[1]);
    });

    it("does not contain entries for skipped lines", () => {
      const md = "# Title\n\nSome paragraph\n- Item";
      const result = parsePlanMarkdown(md);
      expect(result.lineToItem.has(1)).toBe(false); // # Title skipped
      expect(result.lineToItem.has(2)).toBe(false); // empty line
      expect(result.lineToItem.has(3)).toBe(false); // paragraph
      expect(result.lineToItem.has(4)).toBe(true);  // - Item
    });
  });

  describe("trackableCount", () => {
    it("excludes headings from trackable count", () => {
      const md = "## Heading\n- Bullet\n1. Numbered\n- [x] Checkbox";
      const result = parsePlanMarkdown(md);
      expect(result.items).toHaveLength(4);
      expect(result.trackableCount).toBe(3);
    });

    it("counts all non-heading item types", () => {
      const md = "- Bullet\n* Star bullet\n1. Numbered\n- [ ] Unchecked\n- [x] Checked";
      const result = parsePlanMarkdown(md);
      expect(result.trackableCount).toBe(5);
    });

    it("returns zero for heading-only plans", () => {
      const md = "## Section 1\n### Subsection\n## Section 2";
      const result = parsePlanMarkdown(md);
      expect(result.trackableCount).toBe(0);
    });
  });

  describe("parent-child relationships", () => {
    it("sets parentId based on depth stack", () => {
      const md = "## Phase 1\n- Task A\n  - Subtask A1";
      const result = parsePlanMarkdown(md);
      const [heading, taskA, subtaskA1] = result.items;

      expect(heading.parentId).toBeNull();
      expect(taskA.parentId).toBe(heading.id);
      expect(subtaskA1.parentId).toBe(taskA.id);
    });

    it("updates parent childIds", () => {
      const md = "## Phase 1\n- Task A\n- Task B";
      const result = parsePlanMarkdown(md);
      const [heading, taskA, taskB] = result.items;

      expect(heading.childIds).toContain(taskA.id);
      expect(heading.childIds).toContain(taskB.id);
      expect(heading.childIds).toHaveLength(2);
    });

    it("handles siblings at same depth correctly", () => {
      const md = "- First\n- Second\n- Third";
      const result = parsePlanMarkdown(md);

      // All at same depth, no parent
      expect(result.items[0].parentId).toBeNull();
      expect(result.items[1].parentId).toBeNull();
      expect(result.items[2].parentId).toBeNull();
    });

    it("pops depth stack when returning to shallower depth", () => {
      const md = "## Phase 1\n- Task in Phase 1\n## Phase 2\n- Task in Phase 2";
      const result = parsePlanMarkdown(md);
      const [phase1, task1, phase2, task2] = result.items;

      expect(task1.parentId).toBe(phase1.id);
      expect(phase2.parentId).toBeNull();
      expect(task2.parentId).toBe(phase2.id);
    });
  });

  describe("empty and edge cases", () => {
    it("returns empty result for empty string", () => {
      const result = parsePlanMarkdown("");
      expect(result.items).toHaveLength(0);
      expect(result.trackableCount).toBe(0);
      expect(result.lineToItem.size).toBe(0);
    });

    it("returns empty result for only whitespace", () => {
      const result = parsePlanMarkdown("   \n\n   ");
      expect(result.items).toHaveLength(0);
    });

    it("returns empty result for only a top-level heading", () => {
      const result = parsePlanMarkdown("# Just a Title");
      expect(result.items).toHaveLength(0);
    });
  });

  describe("complex plan", () => {
    it("parses a realistic plan with mixed item types", () => {
      const md = [
        "# Migration Plan",
        "",
        "## Phase 1: Setup",
        "1. Install dependencies",
        "2. Configure database",
        "",
        "## Phase 2: Implementation",
        "- [ ] Create migration scripts",
        "- [x] Test locally",
        "  - Verify data integrity",
        "",
        "```sql",
        "SELECT * FROM users;",
        "```",
        "",
        "> Note: Run during low traffic",
        "",
        "## Phase 3: Rollout",
        "- Deploy to staging",
        "- Deploy to production",
      ].join("\n");

      const result = parsePlanMarkdown(md);

      // # Title skipped, ## Phase 1 + 2 numbered + ## Phase 2 + 2 checkboxes + 1 bullet (nested) + ## Phase 3 + 2 bullets
      // code block and blockquote skipped
      expect(result.items).toHaveLength(10);

      // Headings
      const headings = result.items.filter((i) => i.type === "heading");
      expect(headings).toHaveLength(3);
      expect(headings.map((h) => h.text)).toEqual([
        "Phase 1: Setup",
        "Phase 2: Implementation",
        "Phase 3: Rollout",
      ]);

      // Numbered
      const numbered = result.items.filter((i) => i.type === "numbered");
      expect(numbered).toHaveLength(2);

      // Checkboxes
      const checkboxes = result.items.filter((i) => i.type === "checkbox");
      expect(checkboxes).toHaveLength(2);
      expect(checkboxes[0].isCheckedInSource).toBe(false);
      expect(checkboxes[1].isCheckedInSource).toBe(true);

      // Bullets
      const bullets = result.items.filter((i) => i.type === "bullet");
      expect(bullets).toHaveLength(3);

      // trackableCount excludes 3 headings
      expect(result.trackableCount).toBe(7);
    });
  });
});

describe("normalizeText", () => {
  it("converts to lowercase", () => {
    expect(normalizeText("Hello World")).toBe("hello world");
  });

  it("replaces punctuation with spaces and collapses them", () => {
    expect(normalizeText("hello, world! test.")).toBe("hello world test");
  });

  it("collapses multiple whitespace into single space", () => {
    expect(normalizeText("hello   world")).toBe("hello world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeText("  hello  ")).toBe("hello");
  });

  it("handles combined normalization", () => {
    // lowercase: "  hello, world!  how's it going?  "
    // replace punctuation with spaces: "  hello  world   how s it going   "
    // collapse whitespace: " hello world how s it going "
    // trim: "hello world how s it going"
    expect(normalizeText("  Hello, World!  How's it going?  ")).toBe(
      "hello world how s it going"
    );
  });

  it("handles empty string", () => {
    expect(normalizeText("")).toBe("");
  });

  it("preserves underscores and digits", () => {
    // \w matches [a-zA-Z0-9_], so underscores and digits stay
    expect(normalizeText("test_var 123")).toBe("test_var 123");
  });
});

describe("extractKeywords", () => {
  it("returns words longer than 3 characters", () => {
    const keywords = extractKeywords("the big authentication system");
    expect(keywords.has("authentication")).toBe(true);
    expect(keywords.has("system")).toBe(true);
    expect(keywords.has("the")).toBe(false);
    expect(keywords.has("big")).toBe(false);
  });

  it("returns a Set (no duplicates)", () => {
    const keywords = extractKeywords("test test test word word");
    expect(keywords.size).toBe(2);
    expect(keywords.has("test")).toBe(true);
    expect(keywords.has("word")).toBe(true);
  });

  it("normalizes text before extracting", () => {
    const keywords = extractKeywords("Hello, WORLD! Testing.");
    expect(keywords.has("hello")).toBe(true);
    expect(keywords.has("world")).toBe(true);
    expect(keywords.has("testing")).toBe(true);
  });

  it("returns empty set for short words only", () => {
    const keywords = extractKeywords("a to be or do");
    expect(keywords.size).toBe(0);
  });

  it("returns empty set for empty string", () => {
    const keywords = extractKeywords("");
    expect(keywords.size).toBe(0);
  });
});
