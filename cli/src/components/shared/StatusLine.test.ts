/**
 * StatusLine Pure Function Tests
 *
 * Tests getSessionStatus and getSessionMode logic.
 */

import { describe, it, expect } from "@jest/globals";
import { getSessionStatus, getSessionMode } from "./StatusLine.js";
import type { Session } from "@jacques/core";

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

describe("getSessionMode", () => {
  it("returns 'bypass' when is_bypass is true", () => {
    const session = makeSession({ is_bypass: true, mode: "plan" });
    expect(getSessionMode(session)).toBe("bypass");
  });

  it("returns the mode when set and not bypass", () => {
    const session = makeSession({ mode: "plan" });
    expect(getSessionMode(session)).toBe("plan");
  });

  it("returns 'acceptEdits' mode correctly", () => {
    const session = makeSession({ mode: "acceptEdits" });
    expect(getSessionMode(session)).toBe("acceptEdits");
  });

  it("returns 'default' when no mode set", () => {
    const session = makeSession({ mode: null });
    expect(getSessionMode(session)).toBe("default");
  });

  it("returns 'default' when mode is undefined", () => {
    const session = makeSession();
    expect(getSessionMode(session)).toBe("default");
  });

  it("returns 'bypass' even when mode is also set", () => {
    const session = makeSession({ is_bypass: true, mode: "acceptEdits" });
    expect(getSessionMode(session)).toBe("bypass");
  });
});
