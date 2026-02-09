/**
 * Tests for error-utils.ts
 */

import { describe, it, expect } from "@jest/globals";
import { isNotFoundError, isPermissionError, getErrorMessage } from "../error-utils.js";

describe("isNotFoundError", () => {
  it("returns true for ENOENT errors", () => {
    const err = Object.assign(new Error("no such file"), { code: "ENOENT" });
    expect(isNotFoundError(err)).toBe(true);
  });

  it("returns false for other error codes", () => {
    const err = Object.assign(new Error("bad"), { code: "EACCES" });
    expect(isNotFoundError(err)).toBe(false);
  });

  it("returns false for errors without code", () => {
    expect(isNotFoundError(new Error("generic"))).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
  });

  it("returns false for strings", () => {
    expect(isNotFoundError("ENOENT")).toBe(false);
  });

  it("returns true for plain objects with code: ENOENT", () => {
    expect(isNotFoundError({ code: "ENOENT" })).toBe(true);
  });
});

describe("isPermissionError", () => {
  it("returns true for EACCES errors", () => {
    const err = Object.assign(new Error("denied"), { code: "EACCES" });
    expect(isPermissionError(err)).toBe(true);
  });

  it("returns true for EPERM errors", () => {
    const err = Object.assign(new Error("not permitted"), { code: "EPERM" });
    expect(isPermissionError(err)).toBe(true);
  });

  it("returns false for ENOENT errors", () => {
    const err = Object.assign(new Error("not found"), { code: "ENOENT" });
    expect(isPermissionError(err)).toBe(false);
  });

  it("returns false for errors without code", () => {
    expect(isPermissionError(new Error("generic"))).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isPermissionError(null)).toBe(false);
    expect(isPermissionError(undefined)).toBe(false);
  });
});

describe("getErrorMessage", () => {
  it("extracts message from Error instances", () => {
    expect(getErrorMessage(new Error("something broke"))).toBe("something broke");
  });

  it("returns strings as-is", () => {
    expect(getErrorMessage("raw string error")).toBe("raw string error");
  });

  it("converts numbers to string", () => {
    expect(getErrorMessage(42)).toBe("42");
  });

  it("converts null to string", () => {
    expect(getErrorMessage(null)).toBe("null");
  });

  it("converts undefined to string", () => {
    expect(getErrorMessage(undefined)).toBe("undefined");
  });

  it("converts objects to string", () => {
    expect(getErrorMessage({ key: "value" })).toBe("[object Object]");
  });
});
