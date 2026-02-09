/**
 * Obsidian Module Tests
 */

import { jest } from "@jest/globals";
import { homedir } from "os";
import { join } from "path";

// Mock fs module
const mockReaddir = jest.fn<() => Promise<any[]>>();
const mockStat = jest.fn<() => Promise<any>>();

jest.unstable_mockModule("fs", () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    readdir: mockReaddir,
    stat: mockStat,
  },
}));

describe("Obsidian", () => {
  let fs: typeof import("fs");
  let obsidian: typeof import("./obsidian.js");

  const OBSIDIAN_CONFIG_PATH = join(
    homedir(),
    "Library",
    "Application Support",
    "obsidian",
    "obsidian.json"
  );

  beforeEach(async () => {
    jest.clearAllMocks();
    fs = await import("fs");
    obsidian = await import("./obsidian.js");
  });

  describe("detectObsidianVaults", () => {
    it("should return empty array when obsidian.json does not exist", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = await obsidian.detectObsidianVaults();

      expect(result).toEqual([]);
    });

    it("should parse vaults from obsidian.json", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({
          vaults: {
            "vault1": { path: "/Users/test/vault1", open: true },
            "vault2": { path: "/Users/test/Documents/vault2" },
          },
        })
      );

      const result = await obsidian.detectObsidianVaults();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("vault1");
      expect(result[0].isOpen).toBe(true);
    });

    it("should extract vault name from path", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({
          vaults: {
            "abc123": { path: "/Users/test/MyNotes" },
          },
        })
      );

      const result = await obsidian.detectObsidianVaults();

      expect(result[0].name).toBe("MyNotes");
    });

    it("should handle missing vaults object gracefully", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({}));

      const result = await obsidian.detectObsidianVaults();

      expect(result).toEqual([]);
    });

    it("should sort with open vaults first", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({
          vaults: {
            "a": { path: "/Users/test/ClosedVault" },
            "b": { path: "/Users/test/OpenVault", open: true },
          },
        })
      );

      const result = await obsidian.detectObsidianVaults();

      expect(result[0].name).toBe("OpenVault");
      expect(result[1].name).toBe("ClosedVault");
    });
  });

  describe("validateVaultPath", () => {
    it("should return true when .obsidian folder exists", () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true) // vault path exists
        .mockReturnValueOnce(true); // .obsidian folder exists

      const result = obsidian.validateVaultPath("/valid/vault");

      expect(result).toBe(true);
    });

    it("should return false when path does not exist", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = obsidian.validateVaultPath("/nonexistent");

      expect(result).toBe(false);
    });

    it("should return false when .obsidian folder is missing", () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true) // vault path exists
        .mockReturnValueOnce(false); // .obsidian folder missing

      const result = obsidian.validateVaultPath("/not-a-vault");

      expect(result).toBe(false);
    });
  });

  describe("listVaultFiles", () => {
    it("should list all .md files in vault", async () => {
      mockReaddir.mockResolvedValueOnce([
        { name: "note1.md", isDirectory: () => false, isFile: () => true },
        { name: "note2.md", isDirectory: () => false, isFile: () => true },
        { name: "image.png", isDirectory: () => false, isFile: () => true },
      ]);
      mockStat.mockResolvedValue({
        size: 1024,
        mtime: new Date("2026-01-31"),
      });

      const result = await obsidian.listVaultFiles("/test/vault");

      // Only .md files
      expect(result).toHaveLength(2);
      expect(result.every((f) => f.name.endsWith("note1") || f.name.endsWith("note2"))).toBe(true);
    });

    it("should skip hidden directories (.obsidian)", async () => {
      mockReaddir.mockResolvedValueOnce([
        { name: ".obsidian", isDirectory: () => true, isFile: () => false },
        { name: "visible", isDirectory: () => true, isFile: () => false },
        { name: "note.md", isDirectory: () => false, isFile: () => true },
      ]);
      // For visible directory
      mockReaddir.mockResolvedValueOnce([
        { name: "nested.md", isDirectory: () => false, isFile: () => true },
      ]);
      mockStat.mockResolvedValue({
        size: 512,
        mtime: new Date("2026-01-30"),
      });

      const result = await obsidian.listVaultFiles("/test/vault");

      // Should have note.md and nested.md, but not .obsidian contents
      expect(result).toHaveLength(2);
    });

    it("should return relative paths from vault root", async () => {
      mockReaddir.mockResolvedValueOnce([
        { name: "folder", isDirectory: () => true, isFile: () => false },
      ]);
      mockReaddir.mockResolvedValueOnce([
        { name: "nested.md", isDirectory: () => false, isFile: () => true },
      ]);
      mockStat.mockResolvedValue({
        size: 256,
        mtime: new Date("2026-01-29"),
      });

      const result = await obsidian.listVaultFiles("/test/vault");

      expect(result[0].relativePath).toBe(join("folder", "nested.md"));
    });

    it("should handle empty vault", async () => {
      mockReaddir.mockResolvedValueOnce([]);

      const result = await obsidian.listVaultFiles("/empty/vault");

      expect(result).toEqual([]);
    });
  });

  describe("getVaultName", () => {
    it("should return basename of path", () => {
      expect(obsidian.getVaultName("/Users/test/MyVault")).toBe("MyVault");
      expect(obsidian.getVaultName("/path/to/notes")).toBe("notes");
    });
  });

  describe("buildFileTree", () => {
    it("should build tree from flat file list", () => {
      const files = [
        {
          path: "/vault/note.md",
          relativePath: "note.md",
          name: "note",
          sizeBytes: 100,
          modifiedAt: new Date("2026-01-31"),
        },
        {
          path: "/vault/folder/nested.md",
          relativePath: "folder/nested.md",
          name: "nested",
          sizeBytes: 200,
          modifiedAt: new Date("2026-01-30"),
        },
      ];

      const tree = obsidian.buildFileTree(files);

      // Should have 2 items at root: folder and note.md
      expect(tree).toHaveLength(2);
      // Folders come first
      expect(tree[0].type).toBe("folder");
      expect(tree[0].name).toBe("folder");
      expect(tree[0].fileCount).toBe(1);
      expect(tree[1].type).toBe("file");
      expect(tree[1].name).toBe("note");
    });

    it("should sort folders before files", () => {
      const files = [
        {
          path: "/vault/zzz.md",
          relativePath: "zzz.md",
          name: "zzz",
          sizeBytes: 100,
          modifiedAt: new Date("2026-01-31"),
        },
        {
          path: "/vault/aaa/file.md",
          relativePath: "aaa/file.md",
          name: "file",
          sizeBytes: 100,
          modifiedAt: new Date("2026-01-31"),
        },
      ];

      const tree = obsidian.buildFileTree(files);

      expect(tree[0].type).toBe("folder");
      expect(tree[0].name).toBe("aaa");
      expect(tree[1].type).toBe("file");
      expect(tree[1].name).toBe("zzz");
    });

    it("should handle empty file list", () => {
      const tree = obsidian.buildFileTree([]);
      expect(tree).toEqual([]);
    });
  });

  describe("flattenTree", () => {
    it("should flatten tree with collapsed folders", () => {
      const files = [
        {
          path: "/vault/folder/nested.md",
          relativePath: "folder/nested.md",
          name: "nested",
          sizeBytes: 100,
          modifiedAt: new Date("2026-01-31"),
        },
      ];

      const tree = obsidian.buildFileTree(files);
      const expanded = new Set<string>();
      const flat = obsidian.flattenTree(tree, expanded);

      // Only folder visible, nested file hidden
      expect(flat).toHaveLength(1);
      expect(flat[0].type).toBe("folder");
      expect(flat[0].isExpanded).toBe(false);
    });

    it("should show children when folder is expanded", () => {
      const files = [
        {
          path: "/vault/folder/nested.md",
          relativePath: "folder/nested.md",
          name: "nested",
          sizeBytes: 100,
          modifiedAt: new Date("2026-01-31"),
        },
      ];

      const tree = obsidian.buildFileTree(files);
      const expanded = new Set(["folder"]);
      const flat = obsidian.flattenTree(tree, expanded);

      // Folder and nested file visible
      expect(flat).toHaveLength(2);
      expect(flat[0].type).toBe("folder");
      expect(flat[0].isExpanded).toBe(true);
      expect(flat[1].type).toBe("file");
      expect(flat[1].depth).toBe(1);
    });

    it("should set correct depth for nested items", () => {
      const files = [
        {
          path: "/vault/a/b/deep.md",
          relativePath: "a/b/deep.md",
          name: "deep",
          sizeBytes: 100,
          modifiedAt: new Date("2026-01-31"),
        },
      ];

      const tree = obsidian.buildFileTree(files);
      const expanded = new Set(["a", "a/b"]);
      const flat = obsidian.flattenTree(tree, expanded);

      expect(flat).toHaveLength(3);
      expect(flat[0].depth).toBe(0); // a
      expect(flat[1].depth).toBe(1); // b
      expect(flat[2].depth).toBe(2); // deep.md
    });
  });
});
