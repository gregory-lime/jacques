/**
 * Context Manager Tests
 */

import { jest } from "@jest/globals";
import { join } from "path";

// Mock fs/promises
const mockMkdir = jest.fn<() => Promise<void>>();
const mockCopyFile = jest.fn<() => Promise<void>>();
const mockStat = jest.fn<() => Promise<{ size: number }>>();
const mockUnlink = jest.fn<() => Promise<void>>();
const mockReaddir = jest.fn<() => Promise<string[]>>();
const mockReadFile = jest.fn<() => Promise<string>>();

jest.unstable_mockModule("fs", () => ({
  promises: {
    mkdir: mockMkdir,
    copyFile: mockCopyFile,
    stat: mockStat,
    unlink: mockUnlink,
    readdir: mockReaddir,
    readFile: mockReadFile,
  },
}));

// Mock indexer module
const mockAddToIndex = jest.fn<() => Promise<any>>();
const mockRemoveFromIndex = jest.fn<() => Promise<any>>();

jest.unstable_mockModule("./indexer.js", () => ({
  addToIndex: mockAddToIndex,
  removeFromIndex: mockRemoveFromIndex,
}));

describe("ContextManager", () => {
  let manager: typeof import("./manager.js");

  const TEST_CWD = "/test/project";

  beforeEach(async () => {
    jest.clearAllMocks();
    manager = await import("./manager.js");
  });

  describe("generateContextId", () => {
    it("should create slug from name", () => {
      const id = manager.generateContextId("My Test Document");
      expect(id).toMatch(/^my-test-document-[a-f0-9]+$/);
    });

    it("should append random suffix", () => {
      const id1 = manager.generateContextId("Test");
      const id2 = manager.generateContextId("Test");
      // IDs should be different due to random suffix
      expect(id1).not.toBe(id2);
    });

    it("should handle special characters", () => {
      const id = manager.generateContextId("Test @#$ Document!");
      expect(id).toMatch(/^test-document-[a-f0-9]+$/);
    });

    it("should truncate long names", () => {
      const longName = "A".repeat(100);
      const id = manager.generateContextId(longName);
      // Slug should be max 30 chars + dash + 6 hex chars
      expect(id.length).toBeLessThanOrEqual(37);
    });
  });

  describe("sanitizeFilename", () => {
    it("should convert spaces to dashes", () => {
      expect(manager.sanitizeFilename("hello world")).toBe("hello-world");
    });

    it("should remove special characters", () => {
      expect(manager.sanitizeFilename("test@#$%file")).toBe("testfile");
    });

    it("should preserve alphanumeric and dashes", () => {
      expect(manager.sanitizeFilename("test-file_123")).toBe("test-file_123");
    });

    it("should handle unicode characters", () => {
      expect(manager.sanitizeFilename("café résumé")).toBe("caf-rsum");
    });

    it("should collapse multiple dashes", () => {
      expect(manager.sanitizeFilename("test---file")).toBe("test-file");
    });

    it("should trim leading/trailing dashes", () => {
      expect(manager.sanitizeFilename("--test--")).toBe("test");
    });
  });

  describe("getContextDir", () => {
    it("should return correct path", () => {
      const result = manager.getContextDir("/my/project");
      expect(result).toBe(join("/my/project", ".jacques", "context"));
    });
  });

  describe("addContext", () => {
    const testOptions = {
      cwd: TEST_CWD,
      sourceFile: "/vault/My Document.md",
      name: "My Document",
      source: "obsidian" as const,
      description: "Test description",
    };

    beforeEach(() => {
      mockStat.mockResolvedValue({ size: 2048 });
      mockReadFile.mockResolvedValue(`---
tags: [obsidian, notes]
---
# Content`);
      mockAddToIndex.mockResolvedValue({
        version: "2.0.0",
        updatedAt: "2026-01-31T12:00:00Z",
        files: [],
      });
    });

    it("should copy file to .jacques/context/", async () => {
      const result = await manager.addContext(testOptions);

      expect(mockCopyFile).toHaveBeenCalledWith(
        "/vault/My Document.md",
        expect.stringContaining(".jacques/context/My-Document.md")
      );
    });

    it("should create context directory if missing", async () => {
      await manager.addContext(testOptions);

      expect(mockMkdir).toHaveBeenCalledWith(
        join(TEST_CWD, ".jacques", "context"),
        { recursive: true }
      );
    });

    it("should generate unique ID for file", async () => {
      const result = await manager.addContext(testOptions);

      expect(result.id).toMatch(/^my-document-[a-f0-9]+$/);
    });

    it("should sanitize filename for destination", async () => {
      const options = {
        ...testOptions,
        name: "Test @#$ File",
      };

      await manager.addContext(options);

      expect(mockCopyFile).toHaveBeenCalledWith(
        testOptions.sourceFile,
        expect.stringContaining("Test-File.md")
      );
    });

    it("should update index after copying", async () => {
      await manager.addContext(testOptions);

      expect(mockAddToIndex).toHaveBeenCalledWith(
        TEST_CWD,
        expect.objectContaining({
          name: "My Document",
          source: "obsidian",
          description: "Test description",
        })
      );
    });

    it("should return ContextFile with correct metadata", async () => {
      const result = await manager.addContext(testOptions);

      expect(result.name).toBe("My Document");
      expect(result.source).toBe("obsidian");
      expect(result.sourceFile).toBe("/vault/My Document.md");
      expect(result.description).toBe("Test description");
      expect(result.sizeBytes).toBe(2048);
      expect(result.path).toContain(".jacques/context/");
    });

    it("should extract and include tags from source file", async () => {
      const result = await manager.addContext(testOptions);

      expect(result.tags).toEqual(["notes", "obsidian"]);
    });

    it("should not include tags field when no tags found", async () => {
      mockReadFile.mockResolvedValue("# No frontmatter here");

      const result = await manager.addContext(testOptions);

      expect(result.tags).toBeUndefined();
    });
  });

  describe("hasContextFiles", () => {
    it("should return true when context directory has .md files", async () => {
      mockReaddir.mockResolvedValue(["file1.md", "file2.md"]);

      const result = await manager.hasContextFiles(TEST_CWD);

      expect(result).toBe(true);
    });

    it("should return false when context directory is empty", async () => {
      mockReaddir.mockResolvedValue([]);

      const result = await manager.hasContextFiles(TEST_CWD);

      expect(result).toBe(false);
    });

    it("should return false when directory does not exist", async () => {
      mockReaddir.mockRejectedValue(new Error("ENOENT"));

      const result = await manager.hasContextFiles(TEST_CWD);

      expect(result).toBe(false);
    });
  });

  describe("formatFileSize", () => {
    it("should format bytes", () => {
      expect(manager.formatFileSize(500)).toBe("500 B");
    });

    it("should format kilobytes", () => {
      expect(manager.formatFileSize(2048)).toBe("2.0 KB");
    });

    it("should format megabytes", () => {
      expect(manager.formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
    });
  });

  describe("estimateTokensFromSize", () => {
    it("should estimate tokens from bytes (~4.5 chars per token)", () => {
      // 4500 bytes / 4.5 = 1000 tokens
      expect(manager.estimateTokensFromSize(4500)).toBe(1000);
    });

    it("should round up for small files", () => {
      // 10 bytes / 4.5 = 2.22 -> ceil = 3 tokens
      expect(manager.estimateTokensFromSize(10)).toBe(3);
    });

    it("should handle zero bytes", () => {
      expect(manager.estimateTokensFromSize(0)).toBe(0);
    });
  });

  describe("formatTokenCount", () => {
    it("should show raw number for small counts", () => {
      expect(manager.formatTokenCount(500)).toBe("500");
    });

    it("should format thousands with k suffix", () => {
      expect(manager.formatTokenCount(1500)).toBe("1.5k");
    });

    it("should format large counts", () => {
      expect(manager.formatTokenCount(45200)).toBe("45.2k");
    });
  });

  describe("extractTags", () => {
    it("should extract tags from YAML frontmatter array", async () => {
      mockReadFile.mockResolvedValue(`---
tags:
  - javascript
  - react
  - frontend
---
# Document content`);

      const tags = await manager.extractTags("/test/file.md");
      expect(tags).toEqual(["frontend", "javascript", "react"]);
    });

    it("should extract tags from inline YAML array", async () => {
      mockReadFile.mockResolvedValue(`---
tags: [api, backend, node]
---
# Document content`);

      const tags = await manager.extractTags("/test/file.md");
      expect(tags).toEqual(["api", "backend", "node"]);
    });

    it("should handle tags with # prefix", async () => {
      mockReadFile.mockResolvedValue(`---
tags:
  - "#project"
  - "#important"
---
# Content`);

      const tags = await manager.extractTags("/test/file.md");
      expect(tags).toEqual(["important", "project"]);
    });

    it("should return empty array when no frontmatter", async () => {
      mockReadFile.mockResolvedValue(`# No frontmatter here
Just regular markdown content.`);

      const tags = await manager.extractTags("/test/file.md");
      expect(tags).toEqual([]);
    });

    it("should return empty array when no tags in frontmatter", async () => {
      mockReadFile.mockResolvedValue(`---
title: My Document
date: 2026-01-31
---
# Content`);

      const tags = await manager.extractTags("/test/file.md");
      expect(tags).toEqual([]);
    });

    it("should handle file read errors gracefully", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const tags = await manager.extractTags("/nonexistent/file.md");
      expect(tags).toEqual([]);
    });

    it("should deduplicate tags", async () => {
      mockReadFile.mockResolvedValue(`---
tags: [react, react, vue]
tag: react
---
# Content`);

      const tags = await manager.extractTags("/test/file.md");
      expect(tags).toEqual(["react", "vue"]);
    });
  });
});
