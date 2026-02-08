/**
 * Config Module Tests
 */

import { jest } from "@jest/globals";
import { homedir } from "os";
import { join } from "path";

// Mock fs module
jest.unstable_mockModule("fs", () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

describe("JacquesConfig", () => {
  let fs: typeof import("fs");
  let config: typeof import("./config.js");

  const JACQUES_DIR = join(homedir(), ".jacques");
  const CONFIG_PATH = join(JACQUES_DIR, "config.json");

  beforeEach(async () => {
    jest.clearAllMocks();
    fs = await import("fs");
    config = await import("./config.js");
  });

  describe("getJacquesConfig", () => {
    it("should return default config when file does not exist", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = config.getJacquesConfig();

      expect(result.version).toBe("1.0.0");
      expect(result.sources.obsidian?.enabled).toBe(false);
      expect(result.sources.googleDocs?.enabled).toBe(false);
      expect(result.sources.notion?.enabled).toBe(false);
    });

    it("should parse existing config file", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({
          version: "1.0.0",
          sources: {
            obsidian: {
              enabled: true,
              vaultPath: "/path/to/vault",
              configuredAt: "2026-01-31T12:00:00Z",
            },
          },
        })
      );

      const result = config.getJacquesConfig();

      expect(result.sources.obsidian?.enabled).toBe(true);
      expect(result.sources.obsidian?.vaultPath).toBe("/path/to/vault");
    });

    it("should handle corrupted JSON gracefully", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue("not valid json");

      const result = config.getJacquesConfig();

      expect(result.version).toBe("1.0.0");
      expect(result.sources.obsidian?.enabled).toBe(false);
    });
  });

  describe("saveJacquesConfig", () => {
    it("should create ~/.jacques directory if missing", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const testConfig = {
        version: "1.0.0",
        sources: {
          obsidian: { enabled: true, vaultPath: "/test" },
        },
      };

      config.saveJacquesConfig(testConfig);

      expect(fs.mkdirSync).toHaveBeenCalledWith(JACQUES_DIR, { recursive: true });
    });

    it("should write valid JSON to config file", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const testConfig = {
        version: "1.0.0",
        sources: {
          obsidian: { enabled: true, vaultPath: "/test/vault" },
        },
      };

      const result = config.saveJacquesConfig(testConfig);

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        CONFIG_PATH,
        expect.stringContaining('"vaultPath": "/test/vault"'),
        "utf-8"
      );
    });
  });

  describe("isObsidianConfigured", () => {
    it("should return false when obsidian.enabled is false", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({
          version: "1.0.0",
          sources: { obsidian: { enabled: false, vaultPath: "/path" } },
        })
      );

      expect(config.isObsidianConfigured()).toBe(false);
    });

    it("should return false when vaultPath is missing", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({
          version: "1.0.0",
          sources: { obsidian: { enabled: true } },
        })
      );

      expect(config.isObsidianConfigured()).toBe(false);
    });

    it("should return true when enabled with valid vaultPath", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({
          version: "1.0.0",
          sources: { obsidian: { enabled: true, vaultPath: "/valid/path" } },
        })
      );

      expect(config.isObsidianConfigured()).toBe(true);
    });
  });

  describe("configureObsidian", () => {
    it("should save vault path and set enabled to true", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ version: "1.0.0", sources: {} })
      );

      const result = config.configureObsidian("/new/vault/path");

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        CONFIG_PATH,
        expect.stringContaining('"enabled": true'),
        "utf-8"
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        CONFIG_PATH,
        expect.stringContaining('"vaultPath": "/new/vault/path"'),
        "utf-8"
      );
    });
  });
});
