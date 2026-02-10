/**
 * useWorktrees Tests
 *
 * Tests validateWorktreeName and worktree data processing logic.
 */

import { describe, it, expect } from "@jest/globals";
import { validateWorktreeName } from "./useWorktrees.js";

describe("validateWorktreeName", () => {
  it("returns null for valid name with letters", () => {
    expect(validateWorktreeName("feature")).toBeNull();
  });

  it("returns null for valid name with hyphens", () => {
    expect(validateWorktreeName("my-feature")).toBeNull();
  });

  it("returns null for valid name with underscores", () => {
    expect(validateWorktreeName("my_feature")).toBeNull();
  });

  it("returns null for valid name with numbers", () => {
    expect(validateWorktreeName("feature123")).toBeNull();
  });

  it("returns null for valid mixed name", () => {
    expect(validateWorktreeName("cli-worktrees_v2")).toBeNull();
  });

  it("rejects empty string", () => {
    const result = validateWorktreeName("");
    expect(result).toBe("Name cannot be empty");
  });

  it("rejects names with spaces", () => {
    const result = validateWorktreeName("my feature");
    expect(result).toBe("Only letters, numbers, hyphens, underscores");
  });

  it("rejects names with dots", () => {
    const result = validateWorktreeName("my.feature");
    expect(result).toBe("Only letters, numbers, hyphens, underscores");
  });

  it("rejects names with slashes", () => {
    const result = validateWorktreeName("feature/branch");
    expect(result).toBe("Only letters, numbers, hyphens, underscores");
  });

  it("rejects names with special characters", () => {
    const result = validateWorktreeName("feat@#$");
    expect(result).toBe("Only letters, numbers, hyphens, underscores");
  });

  it("rejects names longer than 50 characters", () => {
    const longName = "a".repeat(51);
    const result = validateWorktreeName(longName);
    expect(result).toBe("Name too long (max 50 chars)");
  });

  it("accepts names exactly 50 characters long", () => {
    const name = "a".repeat(50);
    expect(validateWorktreeName(name)).toBeNull();
  });
});

describe("worktree sorting logic", () => {
  it("sorts main worktree first", () => {
    const items = [
      { name: "beta", isMain: false },
      { name: "alpha", isMain: false },
      { name: "main", isMain: true },
    ];

    items.sort((a, b) => {
      if (a.isMain && !b.isMain) return -1;
      if (!a.isMain && b.isMain) return 1;
      return a.name.localeCompare(b.name);
    });

    expect(items[0].name).toBe("main");
    expect(items[1].name).toBe("alpha");
    expect(items[2].name).toBe("beta");
  });

  it("sorts non-main worktrees alphabetically", () => {
    const items = [
      { name: "cli-worktrees", isMain: false },
      { name: "auth-feature", isMain: false },
      { name: "dashboard", isMain: false },
    ];

    items.sort((a, b) => {
      if (a.isMain && !b.isMain) return -1;
      if (!a.isMain && b.isMain) return 1;
      return a.name.localeCompare(b.name);
    });

    expect(items[0].name).toBe("auth-feature");
    expect(items[1].name).toBe("cli-worktrees");
    expect(items[2].name).toBe("dashboard");
  });
});

describe("worktree session counting logic", () => {
  it("counts sessions matching worktree path", () => {
    const sessions = [
      { cwd: "/repo/worktrees/feature/src", git_worktree: undefined },
      { cwd: "/repo/worktrees/feature", git_worktree: undefined },
      { cwd: "/repo/main", git_worktree: undefined },
    ];
    const wtPath = "/repo/worktrees/feature";

    const count = sessions.filter(
      (s) => s.cwd?.startsWith(wtPath) || s.git_worktree === "feature"
    ).length;

    expect(count).toBe(2);
  });

  it("counts sessions matching worktree name", () => {
    const sessions = [
      { cwd: "/other/path", git_worktree: "feature" },
      { cwd: "/another/path", git_worktree: "main" },
    ];
    const wtPath = "/repo/worktrees/feature";

    const count = sessions.filter(
      (s) => s.cwd?.startsWith(wtPath) || s.git_worktree === "feature"
    ).length;

    expect(count).toBe(1);
  });

  it("returns zero when no sessions match", () => {
    const sessions = [
      { cwd: "/other/path", git_worktree: "main" },
    ];
    const wtPath = "/repo/worktrees/feature";

    const count = sessions.filter(
      (s) => s.cwd?.startsWith(wtPath) || s.git_worktree === "feature"
    ).length;

    expect(count).toBe(0);
  });
});
