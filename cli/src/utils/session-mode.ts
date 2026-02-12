/**
 * Session Mode Utilities
 *
 * Shared logic for resolving session mode and its display properties
 * (label + color), including bypass label/color overrides.
 */

import { ACCENT_COLOR, MUTED_TEXT, SUCCESS_COLOR, ERROR_COLOR } from "../components/layout/theme.js";
import type { Session } from "@jacques/core";

const MODE_COLORS: Record<string, string> = {
  plan: SUCCESS_COLOR,
  planning: SUCCESS_COLOR,
  acceptEdits: ACCENT_COLOR,
  execution: ACCENT_COLOR,
  default: MUTED_TEXT,
};

export function getSessionMode(session: Session): string {
  if (session.mode) return session.mode;
  return "default";
}

export function getSessionModeDisplay(session: Session): { mode: string; label: string; color: string } {
  const mode = getSessionMode(session);
  const isBypassPlan = session.is_bypass && (mode === "plan" || mode === "planning");
  const label = session.is_bypass
    ? (isBypassPlan ? "plan" : "p-less")
    : (mode === "acceptEdits" ? "edit" : mode);
  const color = session.is_bypass ? ERROR_COLOR : (MODE_COLORS[mode] || MUTED_TEXT);
  return { mode, label, color };
}
