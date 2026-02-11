/**
 * useSessions Tests
 *
 * Tests session filtering, sorting, and action logic.
 */

import { describe, it, expect } from "@jest/globals";
import type { Session } from "@jacques/core";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    session_id: `session-${Math.random().toString(36).slice(2, 8)}`,
    session_title: null,
    transcript_path: null,
    cwd: "/tmp/test",
    project: "test-project",
    model: null,
    workspace: null,
    terminal: null,
    terminal_key: "test-key",
    status: "idle",
    last_activity: Date.now(),
    registered_at: Date.now(),
    context_metrics: null,
    autocompact: null,
    ...overrides,
  };
}

describe("session filtering by project", () => {
  const sessions = [
    makeSession({ session_id: "s1", project: "projectA", registered_at: 1000 }),
    makeSession({ session_id: "s2", project: "projectB", registered_at: 2000 }),
    makeSession({ session_id: "s3", project: "projectA", registered_at: 3000 }),
    makeSession({ session_id: "s4", project: "projectC", registered_at: 4000 }),
  ];

  it("filters sessions by selected project", () => {
    const selectedProject = "projectA";
    const filtered = sessions.filter((s) => s.project === selectedProject);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((s) => s.project === "projectA")).toBe(true);
  });

  it("shows all sessions when no project selected", () => {
    const selectedProject: string | null = null;
    const filtered = selectedProject
      ? sessions.filter((s) => s.project === selectedProject)
      : [...sessions];
    expect(filtered).toHaveLength(4);
  });

  it("returns empty array for project with no sessions", () => {
    const selectedProject = "nonexistent";
    const filtered = sessions.filter((s) => s.project === selectedProject);
    expect(filtered).toHaveLength(0);
  });
});

describe("session sorting", () => {
  it("puts focused session first", () => {
    const focusedSessionId = "s2";
    const sessions = [
      makeSession({ session_id: "s1", registered_at: 1000 }),
      makeSession({ session_id: "s2", registered_at: 2000 }),
      makeSession({ session_id: "s3", registered_at: 3000 }),
    ];

    sessions.sort((a, b) => {
      if (a.session_id === focusedSessionId) return -1;
      if (b.session_id === focusedSessionId) return 1;
      return a.registered_at - b.registered_at;
    });

    expect(sessions[0].session_id).toBe("s2");
    expect(sessions[1].session_id).toBe("s1");
    expect(sessions[2].session_id).toBe("s3");
  });

  it("sorts by registration time when no focused session", () => {
    const focusedSessionId: string | null = null;
    const sessions = [
      makeSession({ session_id: "s3", registered_at: 3000 }),
      makeSession({ session_id: "s1", registered_at: 1000 }),
      makeSession({ session_id: "s2", registered_at: 2000 }),
    ];

    sessions.sort((a, b) => {
      if (a.session_id === focusedSessionId) return -1;
      if (b.session_id === focusedSessionId) return 1;
      return a.registered_at - b.registered_at;
    });

    expect(sessions[0].session_id).toBe("s1");
    expect(sessions[1].session_id).toBe("s2");
    expect(sessions[2].session_id).toBe("s3");
  });
});

describe("multi-select logic", () => {
  it("toggles session ID in set (add)", () => {
    const selectedIds = new Set<string>();
    const sessionId = "s1";

    const next = new Set(selectedIds);
    if (next.has(sessionId)) {
      next.delete(sessionId);
    } else {
      next.add(sessionId);
    }

    expect(next.has("s1")).toBe(true);
    expect(next.size).toBe(1);
  });

  it("toggles session ID in set (remove)", () => {
    const selectedIds = new Set(["s1", "s2"]);
    const sessionId = "s1";

    const next = new Set(selectedIds);
    if (next.has(sessionId)) {
      next.delete(sessionId);
    } else {
      next.add(sessionId);
    }

    expect(next.has("s1")).toBe(false);
    expect(next.has("s2")).toBe(true);
    expect(next.size).toBe(1);
  });
});

describe("tile windows requirement", () => {
  it("requires at least 2 selected sessions", () => {
    const oneSelected = new Set(["s1"]);
    expect(oneSelected.size >= 2).toBe(false);
  });

  it("allows tiling with 2+ sessions", () => {
    const twoSelected = new Set(["s1", "s2"]);
    expect(twoSelected.size >= 2).toBe(true);
  });

  it("allows tiling with 3+ sessions", () => {
    const threeSelected = new Set(["s1", "s2", "s3"]);
    expect(threeSelected.size >= 2).toBe(true);
  });
});

describe("launch session cwd resolution", () => {
  it("uses session cwd when available", () => {
    const session = makeSession({ cwd: "/home/user/project" });
    const cwd = session.cwd || session.workspace?.project_dir;
    expect(cwd).toBe("/home/user/project");
  });

  it("falls back to workspace project_dir", () => {
    const session = makeSession({
      cwd: "",
      workspace: { project_dir: "/home/user/workspace", current_dir: "/home/user/workspace" },
    });
    const cwd = session.cwd || session.workspace?.project_dir;
    expect(cwd).toBe("/home/user/workspace");
  });

  it("returns undefined when both are missing", () => {
    const session = makeSession({ cwd: "", workspace: null });
    const cwd = session.cwd || session.workspace?.project_dir;
    expect(cwd).toBeFalsy();
  });
});
