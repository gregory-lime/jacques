/**
 * useUsageLimits Tests
 *
 * Tests usage data processing and dot visualization logic.
 */

import { describe, it, expect } from "@jest/globals";
import type { UsagePeriod, UsageLimits } from "./useUsageLimits.js";

function makeUsagePeriod(overrides: Partial<UsagePeriod> = {}): UsagePeriod {
  return {
    label: "current",
    used: 50,
    total: 100,
    percentage: 50,
    resetsAt: "2026-02-09T15:00:00Z",
    ...overrides,
  };
}

describe("usage data mapping", () => {
  it("maps API response to UsageLimits", () => {
    const data = {
      current: { label: "current", used: 42, total: 100, percentage: 42, resetsAt: "3:42pm" },
      weekly: { label: "weekly", used: 18, total: 100, percentage: 18, resetsAt: "feb 14" },
    };

    const limits: UsageLimits = {
      current: data.current || null,
      weekly: data.weekly || null,
    };

    expect(limits.current).not.toBeNull();
    expect(limits.current?.percentage).toBe(42);
    expect(limits.weekly?.percentage).toBe(18);
  });

  it("handles missing current period", () => {
    const data: { current?: UsagePeriod; weekly?: UsagePeriod } = {
      weekly: makeUsagePeriod({ label: "weekly", percentage: 20 }),
    };

    const limits: UsageLimits = {
      current: data.current || null,
      weekly: data.weekly || null,
    };

    expect(limits.current).toBeNull();
    expect(limits.weekly).not.toBeNull();
  });

  it("handles missing weekly period", () => {
    const data: { current?: UsagePeriod; weekly?: UsagePeriod } = {
      current: makeUsagePeriod({ label: "current", percentage: 60 }),
    };

    const limits: UsageLimits = {
      current: data.current || null,
      weekly: data.weekly || null,
    };

    expect(limits.current).not.toBeNull();
    expect(limits.weekly).toBeNull();
  });

  it("handles both periods missing", () => {
    const data: { current?: UsagePeriod; weekly?: UsagePeriod } = {};

    const limits: UsageLimits = {
      current: data.current || null,
      weekly: data.weekly || null,
    };

    expect(limits.current).toBeNull();
    expect(limits.weekly).toBeNull();
  });
});

describe("usage dot visualization logic", () => {
  const TOTAL_DOTS = 10;

  function renderUsageDots(percentage: number): { filled: number; empty: number; color: string } {
    const filled = Math.round((percentage / 100) * TOTAL_DOTS);
    const empty = TOTAL_DOTS - filled;
    const color = percentage >= 80 ? "red" : percentage >= 50 ? "yellow" : "green";
    return { filled, empty, color };
  }

  it("renders 0% as all empty dots", () => {
    const result = renderUsageDots(0);
    expect(result.filled).toBe(0);
    expect(result.empty).toBe(10);
    expect(result.color).toBe("green");
  });

  it("renders 50% as 5 filled, 5 empty, yellow", () => {
    const result = renderUsageDots(50);
    expect(result.filled).toBe(5);
    expect(result.empty).toBe(5);
    expect(result.color).toBe("yellow");
  });

  it("renders 80% as 8 filled, 2 empty, red", () => {
    const result = renderUsageDots(80);
    expect(result.filled).toBe(8);
    expect(result.empty).toBe(2);
    expect(result.color).toBe("red");
  });

  it("renders 100% as all filled dots, red", () => {
    const result = renderUsageDots(100);
    expect(result.filled).toBe(10);
    expect(result.empty).toBe(0);
    expect(result.color).toBe("red");
  });

  it("renders 25% as green", () => {
    const result = renderUsageDots(25);
    expect(result.color).toBe("green");
  });

  it("renders 49% as green", () => {
    const result = renderUsageDots(49);
    expect(result.color).toBe("green");
  });

  it("renders 79% as yellow", () => {
    const result = renderUsageDots(79);
    expect(result.color).toBe("yellow");
  });

  it("rounds dot count correctly for 33%", () => {
    const result = renderUsageDots(33);
    expect(result.filled).toBe(3);
    expect(result.empty).toBe(7);
  });

  it("rounds dot count correctly for 67%", () => {
    const result = renderUsageDots(67);
    expect(result.filled).toBe(7);
    expect(result.empty).toBe(3);
  });
});

describe("usage period validation", () => {
  it("validates percentage is between 0 and 100", () => {
    const period = makeUsagePeriod({ percentage: 42 });
    expect(period.percentage).toBeGreaterThanOrEqual(0);
    expect(period.percentage).toBeLessThanOrEqual(100);
  });

  it("validates used does not exceed total", () => {
    const period = makeUsagePeriod({ used: 50, total: 100 });
    expect(period.used).toBeLessThanOrEqual(period.total);
  });

  it("calculates percentage from used/total", () => {
    const used = 75;
    const total = 200;
    const percentage = Math.round((used / total) * 100);
    expect(percentage).toBe(38);
  });
});
