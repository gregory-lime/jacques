/**
 * Session Mode Utility Tests
 *
 * Tests getSessionMode and getSessionModeDisplay logic.
 */

import { describe, it, expect } from "@jest/globals";
import { getSessionMode, getSessionModeDisplay } from "./session-mode.js";
import { SUCCESS_COLOR, ACCENT_COLOR, MUTED_TEXT, ERROR_COLOR } from "../components/layout/theme.js";
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

describe("getSessionMode", () => {
  it("returns actual mode even when is_bypass is true", () => {
    const session = makeSession({ is_bypass: true, mode: "plan" });
    expect(getSessionMode(session)).toBe("plan");
  });

  it("returns the mode when set", () => {
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

  it("returns 'default' when is_bypass is true and no mode set", () => {
    const session = makeSession({ is_bypass: true });
    expect(getSessionMode(session)).toBe("default");
  });

  it("returns actual mode when is_bypass is also set", () => {
    const session = makeSession({ is_bypass: true, mode: "acceptEdits" });
    expect(getSessionMode(session)).toBe("acceptEdits");
  });
});

describe("getSessionModeDisplay", () => {
  it("returns plan label and success color for plan mode", () => {
    const session = makeSession({ mode: "plan" });
    const result = getSessionModeDisplay(session);
    expect(result.label).toBe("plan");
    expect(result.color).toBe(SUCCESS_COLOR);
  });

  it("returns 'edit' label for acceptEdits mode", () => {
    const session = makeSession({ mode: "acceptEdits" });
    const result = getSessionModeDisplay(session);
    expect(result.label).toBe("edit");
    expect(result.color).toBe(ACCENT_COLOR);
  });

  it("returns muted color for default mode", () => {
    const session = makeSession();
    const result = getSessionModeDisplay(session);
    expect(result.label).toBe("default");
    expect(result.color).toBe(MUTED_TEXT);
  });

  it("returns 'p-less' label and error color for bypass non-plan", () => {
    const session = makeSession({ is_bypass: true, mode: "acceptEdits" });
    const result = getSessionModeDisplay(session);
    expect(result.label).toBe("p-less");
    expect(result.color).toBe(ERROR_COLOR);
  });

  it("returns 'plan' label and error color for bypass plan mode", () => {
    const session = makeSession({ is_bypass: true, mode: "plan" });
    const result = getSessionModeDisplay(session);
    expect(result.label).toBe("plan");
    expect(result.color).toBe(ERROR_COLOR);
  });

  it("returns 'plan' label and error color for bypass planning mode", () => {
    const session = makeSession({ is_bypass: true, mode: "planning" });
    const result = getSessionModeDisplay(session);
    expect(result.label).toBe("plan");
    expect(result.color).toBe(ERROR_COLOR);
  });

  it("returns 'p-less' label and error color for bypass with no mode", () => {
    const session = makeSession({ is_bypass: true });
    const result = getSessionModeDisplay(session);
    expect(result.label).toBe("p-less");
    expect(result.color).toBe(ERROR_COLOR);
  });
});
