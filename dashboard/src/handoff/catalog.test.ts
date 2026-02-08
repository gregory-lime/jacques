/**
 * Handoff Catalog Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { join } from "path";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import {
  getHandoffsDir,
  parseTimestampFromFilename,
  generateHandoffFilename,
  formatHandoffDate,
  estimateHandoffTokens,
  formatTokenEstimate,
  listHandoffs,
  getHandoffContent,
  hasHandoffs,
  getLatestHandoff,
  ensureHandoffsDir,
} from "@jacques/core";

describe("HandoffCatalog", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `jacques-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("getHandoffsDir", () => {
    it("should return correct path", () => {
      const result = getHandoffsDir("/my/project");
      expect(result).toBe(join("/my/project", ".jacques", "handoffs"));
    });
  });

  describe("parseTimestampFromFilename", () => {
    it("should parse valid timestamp", () => {
      const result = parseTimestampFromFilename("2026-01-31T14-30-00-handoff.md");
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(31);
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
      expect(result.getSeconds()).toBe(0);
    });

    it("should return current date for invalid filename", () => {
      const before = new Date();
      const result = parseTimestampFromFilename("invalid.md");
      const after = new Date();

      expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("generateHandoffFilename", () => {
    it("should generate valid filename format", () => {
      const result = generateHandoffFilename();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-handoff\.md$/);
    });

    it("should not contain colons", () => {
      const result = generateHandoffFilename();
      expect(result).not.toContain(":");
    });
  });

  describe("formatHandoffDate", () => {
    it("should format date for display", () => {
      const date = new Date("2026-01-31T14:30:00");
      const result = formatHandoffDate(date);
      // Format depends on locale, but should contain the date components
      expect(result).toContain("2026");
      expect(result).toContain("01");
      expect(result).toContain("31");
    });
  });

  describe("estimateTokens", () => {
    it("should estimate tokens from content length", () => {
      const content = "a".repeat(450); // 450 chars / 4.5 = 100 tokens
      const result = estimateHandoffTokens(content);
      expect(result).toBe(100);
    });

    it("should round up", () => {
      const content = "a".repeat(10); // 10 chars / 4.5 = 2.22... → 3
      const result = estimateHandoffTokens(content);
      expect(result).toBe(3);
    });
  });

  describe("formatTokenEstimate", () => {
    it("should format small numbers", () => {
      expect(formatTokenEstimate(500)).toBe("500");
    });

    it("should format thousands with k suffix", () => {
      expect(formatTokenEstimate(1000)).toBe("1.0k");
      expect(formatTokenEstimate(2500)).toBe("2.5k");
    });
  });

  describe("listHandoffs", () => {
    it("should return empty catalog when directory does not exist", async () => {
      const result = await listHandoffs(testDir);

      expect(result.directory).toBe(getHandoffsDir(testDir));
      expect(result.entries).toEqual([]);
    });

    it("should list handoff files sorted by timestamp (newest first)", async () => {
      // Create handoffs directory and files
      const handoffsDir = getHandoffsDir(testDir);
      await fs.mkdir(handoffsDir, { recursive: true });

      await fs.writeFile(
        join(handoffsDir, "2026-01-30T10-00-00-handoff.md"),
        "a".repeat(900) // ~200 tokens
      );
      await fs.writeFile(
        join(handoffsDir, "2026-01-31T14-30-00-handoff.md"),
        "b".repeat(1800) // ~400 tokens
      );
      await fs.writeFile(
        join(handoffsDir, "2026-01-30T16-45-00-handoff.md"),
        "c".repeat(450) // ~100 tokens
      );
      // Create a non-handoff file that should be filtered out
      await fs.writeFile(join(handoffsDir, "other.txt"), "ignored");

      const result = await listHandoffs(testDir);

      expect(result.entries).toHaveLength(3);
      // Should be sorted newest first
      expect(result.entries[0].filename).toBe("2026-01-31T14-30-00-handoff.md");
      expect(result.entries[1].filename).toBe("2026-01-30T16-45-00-handoff.md");
      expect(result.entries[2].filename).toBe("2026-01-30T10-00-00-handoff.md");
    });

    it("should include token estimates", async () => {
      const handoffsDir = getHandoffsDir(testDir);
      await fs.mkdir(handoffsDir, { recursive: true });
      await fs.writeFile(
        join(handoffsDir, "2026-01-31T14-30-00-handoff.md"),
        "a".repeat(900) // 900 / 4.5 = 200 tokens
      );

      const result = await listHandoffs(testDir);

      expect(result.entries[0].tokenEstimate).toBe(200);
    });
  });

  describe("getHandoffContent", () => {
    it("should read file content", async () => {
      const handoffsDir = getHandoffsDir(testDir);
      await fs.mkdir(handoffsDir, { recursive: true });
      const expectedContent = "# Session Handoff\n\nContent here";
      const filePath = join(handoffsDir, "test-handoff.md");
      await fs.writeFile(filePath, expectedContent);

      const result = await getHandoffContent(filePath);

      expect(result).toBe(expectedContent);
    });
  });

  describe("hasHandoffs", () => {
    it("should return false when no handoffs exist", async () => {
      const result = await hasHandoffs(testDir);

      expect(result).toBe(false);
    });

    it("should return true when handoffs exist", async () => {
      const handoffsDir = getHandoffsDir(testDir);
      await fs.mkdir(handoffsDir, { recursive: true });
      await fs.writeFile(
        join(handoffsDir, "2026-01-31T14-30-00-handoff.md"),
        "content"
      );

      const result = await hasHandoffs(testDir);

      expect(result).toBe(true);
    });
  });

  describe("getLatestHandoff", () => {
    it("should return null when no handoffs exist", async () => {
      const result = await getLatestHandoff(testDir);

      expect(result).toBeNull();
    });

    it("should return most recent handoff", async () => {
      const handoffsDir = getHandoffsDir(testDir);
      await fs.mkdir(handoffsDir, { recursive: true });
      await fs.writeFile(
        join(handoffsDir, "2026-01-30T10-00-00-handoff.md"),
        "older"
      );
      await fs.writeFile(
        join(handoffsDir, "2026-01-31T14-30-00-handoff.md"),
        "newer"
      );

      const result = await getLatestHandoff(testDir);

      expect(result?.filename).toBe("2026-01-31T14-30-00-handoff.md");
    });
  });

  describe("ensureHandoffsDir", () => {
    it("should create directory recursively", async () => {
      const result = await ensureHandoffsDir(testDir);

      expect(result).toBe(getHandoffsDir(testDir));

      // Verify directory was created
      const stats = await fs.stat(result);
      expect(stats.isDirectory()).toBe(true);
    });
  });
});
