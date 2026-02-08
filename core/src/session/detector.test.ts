/**
 * Detector Tests - decodeProjectPath
 *
 * Tests for the canonical project path decoding that uses
 * sessions-index.json's originalPath field.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  decodeProjectPath,
  decodeProjectPathNaive,
  encodeProjectPath,
} from "./detector.js";

describe("decodeProjectPathNaive", () => {
  it("replaces all dashes with slashes", () => {
    expect(decodeProjectPathNaive("-Users-gole-Desktop-project")).toBe(
      "/Users/gole/Desktop/project"
    );
  });

  it("returns input unchanged if no leading dash", () => {
    expect(decodeProjectPathNaive("no-leading-dash")).toBe("no-leading-dash");
  });

  it("handles simple paths", () => {
    expect(decodeProjectPathNaive("-tmp-test")).toBe("/tmp/test");
  });

  it("incorrectly splits paths with dashes in directory names", () => {
    // This demonstrates why naive decode is wrong for paths with dashes
    const encoded = "-Users-gole-Desktop-jacques-context-manager";
    const result = decodeProjectPathNaive(encoded);
    // Naive decode wrongly turns dashes in "jacques-context-manager" into slashes
    expect(result).toBe("/Users/gole/Desktop/jacques/context/manager");
    // The correct result should be /Users/gole/Desktop/jacques-context-manager
    // but naive decode can't know which dashes are path separators
  });
});

describe("decodeProjectPath", () => {
  let tempDir: string;
  let claudeProjectsDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), "decoder-test-"));
    claudeProjectsDir = join(tempDir, ".claude", "projects");
    await fs.mkdir(claudeProjectsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("reads originalPath from sessions-index.json", async () => {
    const encodedDir = "-Users-gole-Desktop-jacques-context-manager";
    const projectDir = join(claudeProjectsDir, encodedDir);
    await fs.mkdir(projectDir, { recursive: true });

    // Write sessions-index.json with the correct originalPath
    await fs.writeFile(
      join(projectDir, "sessions-index.json"),
      JSON.stringify({
        originalPath: "/Users/gole/Desktop/jacques-context-manager",
        sessions: {},
      })
    );

    const result = await decodeProjectPath(encodedDir, claudeProjectsDir);
    expect(result).toBe("/Users/gole/Desktop/jacques-context-manager");
  });

  it("falls back to naive decode when no sessions-index.json", async () => {
    const encodedDir = "-Users-gole-Desktop-simple";
    // Don't create sessions-index.json

    const result = await decodeProjectPath(encodedDir, claudeProjectsDir);
    expect(result).toBe("/Users/gole/Desktop/simple");
  });

  it("falls back to naive decode when sessions-index.json has no originalPath", async () => {
    const encodedDir = "-Users-gole-Desktop-project";
    const projectDir = join(claudeProjectsDir, encodedDir);
    await fs.mkdir(projectDir, { recursive: true });

    // Write sessions-index.json without originalPath
    await fs.writeFile(
      join(projectDir, "sessions-index.json"),
      JSON.stringify({ sessions: {} })
    );

    const result = await decodeProjectPath(encodedDir, claudeProjectsDir);
    expect(result).toBe("/Users/gole/Desktop/project");
  });

  it("handles paths with dashes in directory names", async () => {
    const encodedDir = "-Users-gole-Desktop-my-cool-project";
    const projectDir = join(claudeProjectsDir, encodedDir);
    await fs.mkdir(projectDir, { recursive: true });

    await fs.writeFile(
      join(projectDir, "sessions-index.json"),
      JSON.stringify({
        originalPath: "/Users/gole/Desktop/my-cool-project",
      })
    );

    const result = await decodeProjectPath(encodedDir, claudeProjectsDir);
    expect(result).toBe("/Users/gole/Desktop/my-cool-project");
  });

  it("handles paths with underscores encoded as dashes", async () => {
    const encodedDir = "-Users-gole-Desktop-marriage-story";
    const projectDir = join(claudeProjectsDir, encodedDir);
    await fs.mkdir(projectDir, { recursive: true });

    await fs.writeFile(
      join(projectDir, "sessions-index.json"),
      JSON.stringify({
        originalPath: "/Users/gole/Desktop/marriage_story",
      })
    );

    const result = await decodeProjectPath(encodedDir, claudeProjectsDir);
    expect(result).toBe("/Users/gole/Desktop/marriage_story");
  });

  it("handles malformed sessions-index.json gracefully", async () => {
    const encodedDir = "-Users-gole-Desktop-broken";
    const projectDir = join(claudeProjectsDir, encodedDir);
    await fs.mkdir(projectDir, { recursive: true });

    // Write invalid JSON
    await fs.writeFile(
      join(projectDir, "sessions-index.json"),
      "not valid json"
    );

    const result = await decodeProjectPath(encodedDir, claudeProjectsDir);
    // Should fall back to naive decode
    expect(result).toBe("/Users/gole/Desktop/broken");
  });

  it("handles non-string originalPath gracefully", async () => {
    const encodedDir = "-Users-gole-Desktop-badtype";
    const projectDir = join(claudeProjectsDir, encodedDir);
    await fs.mkdir(projectDir, { recursive: true });

    await fs.writeFile(
      join(projectDir, "sessions-index.json"),
      JSON.stringify({ originalPath: 42 })
    );

    const result = await decodeProjectPath(encodedDir, claudeProjectsDir);
    // Should fall back to naive decode since originalPath isn't a string
    expect(result).toBe("/Users/gole/Desktop/badtype");
  });

  it("handles input without leading dash", async () => {
    const result = await decodeProjectPath("no-dash", claudeProjectsDir);
    expect(result).toBe("no-dash");
  });
});
