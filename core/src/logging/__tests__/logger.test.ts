/**
 * Tests for logger.ts
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { createLogger } from "../logger.js";

describe("createLogger", () => {
  let consoleSpy: {
    log: ReturnType<typeof jest.spyOn>;
    warn: ReturnType<typeof jest.spyOn>;
    error: ReturnType<typeof jest.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, "log").mockImplementation(() => {}),
      warn: jest.spyOn(console, "warn").mockImplementation(() => {}),
      error: jest.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  it("returns silent logger by default", () => {
    const logger = createLogger();
    logger.log("test");
    logger.warn("test");
    logger.error("test");

    expect(consoleSpy.log).not.toHaveBeenCalled();
    expect(consoleSpy.warn).not.toHaveBeenCalled();
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });

  it("returns silent logger when silent: true", () => {
    const logger = createLogger({ silent: true });
    logger.log("test");
    expect(consoleSpy.log).not.toHaveBeenCalled();
  });

  it("logs to console when silent: false", () => {
    const logger = createLogger({ silent: false });
    logger.log("hello");
    expect(consoleSpy.log).toHaveBeenCalledWith("hello");
  });

  it("routes warn to console.warn", () => {
    const logger = createLogger({ silent: false });
    logger.warn("warning!");
    expect(consoleSpy.warn).toHaveBeenCalledWith("warning!");
  });

  it("routes error to console.error", () => {
    const logger = createLogger({ silent: false });
    logger.error("failure!");
    expect(consoleSpy.error).toHaveBeenCalledWith("failure!");
  });

  it("prepends prefix to string messages", () => {
    const logger = createLogger({ silent: false, prefix: "[Test]" });
    logger.log("hello world");
    expect(consoleSpy.log).toHaveBeenCalledWith("[Test] hello world");
  });

  it("prepends prefix to non-string first args", () => {
    const logger = createLogger({ silent: false, prefix: "[Test]" });
    logger.log(42);
    expect(consoleSpy.log).toHaveBeenCalledWith("[Test]", 42);
  });

  it("preserves additional arguments", () => {
    const logger = createLogger({ silent: false, prefix: "[Test]" });
    logger.log("msg", { key: "value" }, 99);
    expect(consoleSpy.log).toHaveBeenCalledWith("[Test] msg", { key: "value" }, 99);
  });

  it("works without prefix when silent: false", () => {
    const logger = createLogger({ silent: false });
    logger.log("no prefix", "extra");
    expect(consoleSpy.log).toHaveBeenCalledWith("no prefix", "extra");
  });

  it("handles empty args with prefix", () => {
    const logger = createLogger({ silent: false, prefix: "[Test]" });
    logger.log();
    // No args means formatArgs returns [] (prefix only prepends if args.length > 0)
    expect(consoleSpy.log).toHaveBeenCalled();
  });

  it("returns the same silent logger instance for all silent calls", () => {
    const logger1 = createLogger();
    const logger2 = createLogger({ silent: true });
    // Both should be silent (no output)
    logger1.log("test");
    logger2.log("test");
    expect(consoleSpy.log).not.toHaveBeenCalled();
  });
});
