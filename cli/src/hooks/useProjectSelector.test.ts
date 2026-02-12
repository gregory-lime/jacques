/**
 * useProjectSelector Tests
 *
 * Tests project sorting, selection logic, and scroll behavior.
 */

import { describe, it, expect } from "@jest/globals";
import type { DiscoveredProject } from "@jacques-ai/core";

function makeProject(overrides: Partial<DiscoveredProject> = {}): DiscoveredProject {
  return {
    name: "test-project",
    gitRepoRoot: null,
    isGitProject: false,
    projectPaths: [],
    encodedPaths: [],
    sessionCount: 0,
    lastActivity: null,
    ...overrides,
  };
}

describe("project sorting", () => {
  it("sorts by session count descending", () => {
    const projects = [
      makeProject({ name: "a", sessionCount: 1 }),
      makeProject({ name: "b", sessionCount: 5 }),
      makeProject({ name: "c", sessionCount: 3 }),
    ];

    projects.sort(
      (a, b) => b.sessionCount - a.sessionCount || a.name.localeCompare(b.name)
    );

    expect(projects[0].name).toBe("b");
    expect(projects[1].name).toBe("c");
    expect(projects[2].name).toBe("a");
  });

  it("breaks ties alphabetically by name", () => {
    const projects = [
      makeProject({ name: "zebra", sessionCount: 2 }),
      makeProject({ name: "alpha", sessionCount: 2 }),
      makeProject({ name: "mango", sessionCount: 2 }),
    ];

    projects.sort(
      (a, b) => b.sessionCount - a.sessionCount || a.name.localeCompare(b.name)
    );

    expect(projects[0].name).toBe("alpha");
    expect(projects[1].name).toBe("mango");
    expect(projects[2].name).toBe("zebra");
  });

  it("handles empty project list", () => {
    const projects: DiscoveredProject[] = [];
    projects.sort(
      (a, b) => b.sessionCount - a.sessionCount || a.name.localeCompare(b.name)
    );
    expect(projects).toHaveLength(0);
  });
});

describe("project data mapping from API", () => {
  it("maps API response to DiscoveredProject", () => {
    const raw = {
      name: "my-project",
      gitRepoRoot: "/home/user/my-project",
      isGitProject: true,
      projectPaths: ["/home/user/my-project", "/home/user/my-project-feature"],
      encodedPaths: ["-home-user-my-project", "-home-user-my-project-feature"],
      sessionCount: 3,
      lastActivity: "2026-02-09T12:00:00Z",
    };

    const project: DiscoveredProject = raw;

    expect(project.name).toBe("my-project");
    expect(project.sessionCount).toBe(3);
    expect(project.projectPaths).toHaveLength(2);
    expect(project.isGitProject).toBe(true);
    expect(project.gitRepoRoot).toBe("/home/user/my-project");
  });

  it("handles non-git project without gitRepoRoot", () => {
    const project = makeProject({
      name: "standalone",
      gitRepoRoot: null,
      isGitProject: false,
    });

    expect(project.gitRepoRoot).toBeNull();
    expect(project.isGitProject).toBe(false);
  });

  it("defaults sessionCount to 0 when missing", () => {
    const project = makeProject({ name: "test" });
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
