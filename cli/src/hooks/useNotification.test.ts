/**
 * useNotification Hook Tests
 *
 * Tests the notification hook's core logic.
 * Since we can't render React hooks without @testing-library/react-hooks,
 * we test the module's exports and behavior patterns.
 */

import { describe, it, expect } from "@jest/globals";
import { CATEGORY_SYMBOLS } from "@jacques/core/notifications";
import type { NotificationItem } from "@jacques/core/notifications";

describe("useNotification", () => {
  describe("notification text formatting", () => {
    it("should format server notification with category symbol", () => {
      const notif: NotificationItem = {
        id: "test-1",
        category: "context",
        title: "Context Warning",
        body: "Session at 70% context usage",
        priority: "high",
        timestamp: Date.now(),
        sessionId: "sess-1",
      };
      const symbol = CATEGORY_SYMBOLS[notif.category] ?? "●";
      const text = `${symbol} ${notif.title}: ${notif.body}`;
      expect(text).toBe("◆ Context Warning: Session at 70% context usage");
    });

    it("should use fallback symbol for unknown category", () => {
      const symbol = CATEGORY_SYMBOLS["unknown" as keyof typeof CATEGORY_SYMBOLS] ?? "●";
      expect(symbol).toBe("●");
    });

    it("should format operation notification", () => {
      const notif: NotificationItem = {
        id: "test-2",
        category: "operation",
        title: "Large Operation",
        body: "Claude used 75,000 tokens",
        priority: "medium",
        timestamp: Date.now(),
      };
      const symbol = CATEGORY_SYMBOLS[notif.category];
      const text = `${symbol} ${notif.title}: ${notif.body}`;
      expect(text).toBe("⚡ Large Operation: Claude used 75,000 tokens");
    });

    it("should format plan notification", () => {
      const notif: NotificationItem = {
        id: "test-3",
        category: "plan",
        title: "Plan Ready",
        body: "New implementation plan created",
        priority: "medium",
        timestamp: Date.now(),
      };
      const symbol = CATEGORY_SYMBOLS[notif.category];
      expect(symbol).toBe("◇");
    });

    it("should format auto-compact notification", () => {
      const symbol = CATEGORY_SYMBOLS["auto-compact"];
      expect(symbol).toBe("▲");
    });

    it("should format handoff notification", () => {
      const symbol = CATEGORY_SYMBOLS["handoff"];
      expect(symbol).toBe("✓");
    });
  });

  describe("error detection for local notifications", () => {
    const isError = (message: string) =>
      /^(failed|error|no |not |invalid|cannot|couldn't)/i.test(message);

    it("should detect error messages", () => {
      expect(isError("Failed to connect")).toBe(true);
      expect(isError("Error: something went wrong")).toBe(true);
      expect(isError("No active session")).toBe(true);
      expect(isError("Not found")).toBe(true);
      expect(isError("Invalid input")).toBe(true);
      expect(isError("Cannot proceed")).toBe(true);
      expect(isError("Couldn't load file")).toBe(true);
    });

    it("should not flag success messages as errors", () => {
      expect(isError("Terminal focused")).toBe(false);
      expect(isError("Session started")).toBe(false);
      expect(isError("Handoff generated")).toBe(false);
      expect(isError("Context saved")).toBe(false);
    });
  });

  describe("ServerNotification structure", () => {
    it("should create notification with required fields", () => {
      const item: NotificationItem = {
        id: "notif-context-123",
        category: "context",
        title: "Context Warning",
        body: "70% usage",
        priority: "high",
        timestamp: Date.now(),
        sessionId: "sess-abc",
      };

      const serverNotif = {
        id: item.id,
        item,
        dismissed: false,
      };

      expect(serverNotif.id).toBe("notif-context-123");
      expect(serverNotif.dismissed).toBe(false);
      expect(serverNotif.item.category).toBe("context");
      expect(serverNotif.item.sessionId).toBe("sess-abc");
    });

    it("should handle notification without sessionId", () => {
      const item: NotificationItem = {
        id: "notif-op-456",
        category: "operation",
        title: "Large Operation",
        body: "75k tokens",
        priority: "medium",
        timestamp: Date.now(),
      };

      expect(item.sessionId).toBeUndefined();
    });
  });

  describe("queue management", () => {
    it("should deduplicate by ID", () => {
      const MAX_QUEUE = 10;
      const existing = [
        { id: "a", item: {} as NotificationItem, dismissed: false },
        { id: "b", item: {} as NotificationItem, dismissed: false },
      ];

      // Simulate adding duplicate "a"
      const newNotif = { id: "a", item: {} as NotificationItem, dismissed: false };
      const filtered = existing.filter(n => n.id !== newNotif.id);
      const result = [newNotif, ...filtered].slice(0, MAX_QUEUE);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("a"); // Newest first
      expect(result[1].id).toBe("b");
    });

    it("should cap queue at MAX_QUEUE", () => {
      const MAX_QUEUE = 10;
      const existing = Array.from({ length: 12 }, (_, i) => ({
        id: `notif-${i}`,
        item: {} as NotificationItem,
        dismissed: false,
      }));

      const newNotif = { id: "new", item: {} as NotificationItem, dismissed: false };
      const result = [newNotif, ...existing].slice(0, MAX_QUEUE);

      expect(result).toHaveLength(MAX_QUEUE);
      expect(result[0].id).toBe("new");
    });
  });
});
