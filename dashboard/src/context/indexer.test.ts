/**
 * Context Indexer Tests
 */

import { jest } from "@jest/globals";
import { join } from "path";

// Mock fs/promises
const mockReadFile = jest.fn<() => Promise<string>>();
const mockWriteFile = jest.fn<() => Promise<void>>();
const mockMkdir = jest.fn<() => Promise<void>>();

jest.unstable_mockModule("fs", () => ({
  existsSync: jest.fn(),
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
  },
}));

describe("ContextIndexer", () => {
  let fs: typeof import("fs");
  let indexer: typeof import("./indexer.js");

  const TEST_CWD = "/test/project";
  const INDEX_PATH = join(TEST_CWD, ".jacques", "index.json");

  beforeEach(async () => {
    jest.clearAllMocks();
    fs = await import("fs");
    indexer = await import("./indexer.js");
  });

  describe("getIndexPath", () => {
    it("should return correct path", () => {
      const result = indexer.getIndexPath("/my/project");
      expect(result).toBe(join("/my/project", ".jacques", "index.json"));
    });
  });

  describe("readContextIndex", () => {
    it("should return empty index when file does not exist", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = await indexer.readContextIndex(TEST_CWD);

      expect(result.version).toBe("1.0.0");
      expect(result.files).toEqual([]);
    });

    it("should parse existing index.json", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          version: "1.0.0",
          updatedAt: "2026-01-31T12:00:00Z",
          files: [
            {
              id: "test-123",
              name: "Test File",
              path: ".jacques/context/test.md",
              source: "obsidian",
              sourceFile: "/vault/test.md",
              addedAt: "2026-01-31T12:00:00Z",
              sizeBytes: 1024,
            },
          ],
        })
      );

      const result = await indexer.readContextIndex(TEST_CWD);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].name).toBe("Test File");
    });

    it("should handle corrupted JSON", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      mockReadFile.mockResolvedValue("not valid json");

      const result = await indexer.readContextIndex(TEST_CWD);

      expect(result.version).toBe("1.0.0");
      expect(result.files).toEqual([]);
    });
  });

  describe("writeContextIndex", () => {
    it("should create .jacques directory if missing", async () => {
      const index = {
        version: "1.0.0",
        updatedAt: "2026-01-31T12:00:00Z",
        files: [],
      };

      await indexer.writeContextIndex(TEST_CWD, index);

      expect(mockMkdir).toHaveBeenCalledWith(
        join(TEST_CWD, ".jacques"),
        { recursive: true }
      );
    });

    it("should write valid JSON to index.json", async () => {
      const index = {
        version: "1.0.0",
        updatedAt: "2026-01-31T12:00:00Z",
        files: [
          {
            id: "test-456",
            name: "New File",
            path: ".jacques/context/new.md",
            source: "obsidian" as const,
            sourceFile: "/vault/new.md",
            addedAt: "2026-01-31T12:00:00Z",
            sizeBytes: 512,
          },
        ],
      };

      await indexer.writeContextIndex(TEST_CWD, index);

      expect(mockWriteFile).toHaveBeenCalledWith(
        INDEX_PATH,
        expect.stringContaining('"name": "New File"'),
        "utf-8"
      );
    });
  });

  describe("addToIndex", () => {
    const testFile = {
      id: "new-abc123",
      name: "New Context",
      path: ".jacques/context/new-context.md",
      source: "obsidian" as const,
      sourceFile: "/vault/New Context.md",
      addedAt: "2026-01-31T14:00:00Z",
      sizeBytes: 2048,
    };

    it("should create new index.json when none exists", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = await indexer.addToIndex(TEST_CWD, testFile);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].id).toBe("new-abc123");
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it("should append to existing files array", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          version: "1.0.0",
          updatedAt: "2026-01-30T12:00:00Z",
          files: [
            {
              id: "existing-789",
              name: "Existing",
              path: ".jacques/context/existing.md",
              source: "obsidian",
              sourceFile: "/vault/existing.md",
              addedAt: "2026-01-30T12:00:00Z",
              sizeBytes: 1024,
            },
          ],
        })
      );

      const result = await indexer.addToIndex(TEST_CWD, testFile);

      expect(result.files).toHaveLength(2);
    });

    it("should not duplicate entries with same id", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          version: "1.0.0",
          updatedAt: "2026-01-30T12:00:00Z",
          files: [testFile],
        })
      );

      const updatedFile = { ...testFile, name: "Updated Name" };
      const result = await indexer.addToIndex(TEST_CWD, updatedFile);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].name).toBe("Updated Name");
    });
  });

  describe("removeFromIndex", () => {
    it("should remove file by id", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          version: "1.0.0",
          updatedAt: "2026-01-30T12:00:00Z",
          files: [
            { id: "keep-me", name: "Keep" },
            { id: "remove-me", name: "Remove" },
          ],
        })
      );

      const result = await indexer.removeFromIndex(TEST_CWD, "remove-me");

      expect(result.files).toHaveLength(1);
      expect(result.files[0].id).toBe("keep-me");
    });
  });

  describe("fileExistsInIndex", () => {
    it("should return true when file exists", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          version: "1.0.0",
          files: [{ id: "exists-123" }],
        })
      );

      const result = await indexer.fileExistsInIndex(TEST_CWD, "exists-123");

      expect(result).toBe(true);
    });

    it("should return false when file does not exist", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          version: "1.0.0",
          files: [{ id: "other-id" }],
        })
      );

      const result = await indexer.fileExistsInIndex(TEST_CWD, "not-found");

      expect(result).toBe(false);
    });
  });
});
