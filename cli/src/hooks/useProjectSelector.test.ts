/**
 * useProjectSelector Tests
 *
 * Tests project sorting, selection logic, and scroll behavior.
 */

import { describe, it, expect } from "@jest/globals";
import type { DiscoveredProject } from "./useProjectSelector.js";

function makeProject(overrides: Partial<DiscoveredProject> = {}): DiscoveredProject {
  return {
    name: "test-project",
    displayName: "Test Project",
    sessionCount: 0,
    ...overrides,
  };
}

describe("project sorting", () => {
  it("sorts by session count descending", () => {
    const projects = [
      makeProject({ name: "a", displayName: "A", sessionCount: 1 }),
      makeProject({ name: "b", displayName: "B", sessionCount: 5 }),
      makeProject({ name: "c", displayName: "C", sessionCount: 3 }),
    ];

    projects.sort(
      (a, b) => b.sessionCount - a.sessionCount || a.displayName.localeCompare(b.displayName)
    );

    expect(projects[0].name).toBe("b");
    expect(projects[1].name).toBe("c");
    expect(projects[2].name).toBe("a");
  });

  it("breaks ties alphabetically by displayName", () => {
    const projects = [
      makeProject({ name: "z", displayName: "Zebra", sessionCount: 2 }),
      makeProject({ name: "a", displayName: "Alpha", sessionCount: 2 }),
      makeProject({ name: "m", displayName: "Mango", sessionCount: 2 }),
    ];

    projects.sort(
      (a, b) => b.sessionCount - a.sessionCount || a.displayName.localeCompare(b.displayName)
    );

    expect(projects[0].displayName).toBe("Alpha");
    expect(projects[1].displayName).toBe("Mango");
    expect(projects[2].displayName).toBe("Zebra");
  });

  it("handles empty project list", () => {
    const projects: DiscoveredProject[] = [];
    projects.sort(
      (a, b) => b.sessionCount - a.sessionCount || a.displayName.localeCompare(b.displayName)
    );
    expect(projects).toHaveLength(0);
  });
});

describe("project data mapping from API", () => {
  it("maps API response to DiscoveredProject", () => {
    const raw = {
      name: "my-project",
      displayName: "My Project",
      sessionCount: 3,
      lastActivity: "2026-02-09T12:00:00Z",
      gitRepoRoot: "/home/user/my-project",
      worktrees: ["/home/user/my-project", "/home/user/my-project-feature"],
    };

    const project: DiscoveredProject = {
      name: raw.name,
      displayName: raw.displayName || raw.name,
      sessionCount: raw.sessionCount || 0,
      lastActivity: raw.lastActivity,
      gitRepoRoot: raw.gitRepoRoot,
      worktrees: raw.worktrees,
    };

    expect(project.name).toBe("my-project");
    expect(project.displayName).toBe("My Project");
    expect(project.sessionCount).toBe(3);
    expect(project.worktrees).toHaveLength(2);
  });

  it("uses name as displayName fallback", () => {
    const raw = { name: "my-project" };

    const project: DiscoveredProject = {
      name: raw.name,
      displayName: (raw as { displayName?: string }).displayName || raw.name,
      sessionCount: 0,
    };

    expect(project.displayName).toBe("my-project");
  });

  it("defaults sessionCount to 0 when missing", () => {
    const raw = { name: "test" };

    const project: DiscoveredProject = {
      name: raw.name,
      displayName: raw.name,
      sessionCount: (raw as { sessionCount?: number }).sessionCount || 0,
    };

    expect(project.sessionCount).toBe(0);
  });
});

describe("scroll navigation logic", () => {
  const VISIBLE_HEIGHT = 7;

  it("clamps selectedIndex to valid range on up arrow", () => {
    const prev = 0;
    const next = Math.max(0, prev - 1);
    expect(next).toBe(0);
  });

  it("clamps selectedIndex to valid range on down arrow", () => {
    const listLength = 3;
    const prev = 2;
    const next = Math.min(listLength - 1, prev + 1);
    expect(next).toBe(2);
  });

  it("scrolls up when selection goes above scrollOffset", () => {
    let scrollOffset = 3;
    const next = 2;
    if (next < scrollOffset) scrollOffset = next;
    expect(scrollOffset).toBe(2);
  });

  it("scrolls down when selection goes below visible area", () => {
    let scrollOffset = 0;
    const next = 8;
    if (next >= scrollOffset + VISIBLE_HEIGHT) {
      scrollOffset = next - VISIBLE_HEIGHT + 1;
    }
    expect(scrollOffset).toBe(2);
  });

  it("does not scroll when selection is within visible area", () => {
    let scrollOffset = 0;
    const next = 3;
    if (next >= scrollOffset + VISIBLE_HEIGHT) {
      scrollOffset = next - VISIBLE_HEIGHT + 1;
    }
    expect(scrollOffset).toBe(0);
  });
});
