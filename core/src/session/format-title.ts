/**
 * Format session titles for display.
 * Detects plan-triggered sessions and extracts clean plan names.
 *
 * Truncation is applied once at the end to avoid stacking ellipses from
 * multiple upstream sources (Claude Code title truncation, extractPlanTitle).
 */

import { PLAN_TRIGGER_PATTERNS, extractPlanTitle } from "../archive/plan-extractor.js";

export interface FormattedSessionTitle {
  isPlan: boolean;
  displayTitle: string;
}

/** Strip trailing triple-dot or unicode ellipsis added by upstream truncators. */
function stripTrailingEllipsis(s: string): string {
  return s.replace(/\s*\.{3,}$/, "").replace(/\s*\u2026$/, "").trimEnd();
}

export function formatSessionTitle(
  rawTitle: string | null,
  maxLength?: number,
): FormattedSessionTitle {
  if (!rawTitle) return { isPlan: false, displayTitle: "Untitled" };

  const trimmed = rawTitle.trim();

  if (trimmed.startsWith("<local-command") || trimmed.startsWith("<command-")) {
    return { isPlan: false, displayTitle: "Active Session" };
  }

  let title: string = rawTitle;
  let isPlan = false;

  for (const pattern of PLAN_TRIGGER_PATTERNS) {
    if (pattern.test(rawTitle)) {
      const cleaned = rawTitle.replace(pattern, "").trim();
      title = extractPlanTitle(cleaned) || "Unnamed Plan";
      isPlan = true;
      break;
    }
  }

  // Collapse newlines to spaces for single-line display
  // (must happen after plan detection — extractPlanTitle needs newlines for headings)
  title = title.replace(/\n+/g, " ").trim();

  // Strip any upstream ellipsis before applying our own truncation
  title = stripTrailingEllipsis(title);

  // Single consistent truncation using … (1 char — more title visible)
  if (maxLength && title.length > maxLength) {
    title = title.slice(0, maxLength - 1) + "\u2026";
  }

  return { isPlan, displayTitle: title };
}
