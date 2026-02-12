/**
 * StatusLine Pure Function Tests
 *
 * Tests getSessionStatus logic.
 * (getSessionMode tests moved to utils/session-mode.test.ts)
 */

import { describe, it, expect } from "@jest/globals";
import { getSessionStatus } from "./StatusLine.js";
import type { Session } from "@jacques-ai/core";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    session_id: "test-123",
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

describe("getSessionStatus", () => {
  it("returns 'working' for status 'working'", () => {
    const session = makeSession({ status: "working" });
    expect(getSessionStatus(session)).toBe("working");
  });

  it("returns 'working' for status 'tool_use'", () => {
    const session = makeSession({ status: "tool_use" });
    expect(getSessionStatus(session)).toBe("working");
  });

  it("returns 'awaiting' for status 'waiting'", () => {
    const session = makeSession({ status: "waiting" });
    expect(getSessionStatus(session)).toBe("awaiting");
  });

  it("returns 'idle' for status 'idle'", () => {
    const session = makeSession({ status: "idle" });
    expect(getSessionStatus(session)).toBe("idle");
  });

  it("returns 'active' for unrecognized status", () => {
    const session = makeSession({ status: "active" });
    expect(getSessionStatus(session)).toBe("active");
  });
});
