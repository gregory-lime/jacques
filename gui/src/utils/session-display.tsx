/**
 * Session Display Utilities
 *
 * Shared formatting functions for session cards and lists.
 * Consolidated from Dashboard.tsx, SessionCard.tsx, and CompactSessionCard.tsx.
 */

import { colors } from '../styles/theme';
import { PlanIcon } from '../components/Icons';
import {
  Terminal, FileText, PenTool, Search, Bot,
  Globe, Plug, Wrench, MessageSquare, Loader,
} from 'lucide-react';

// ─── Plan Title Patterns ────────────────────────────────────

export const PLAN_TITLE_PATTERNS = [
  /^implement the following plan[:\s]*/i,
  /^here is the plan[:\s]*/i,
  /^follow this plan[:\s]*/i,
];

// ─── Format Session Title ───────────────────────────────────

export interface FormatTitleOptions {
  /** Maximum length before truncation (default: no truncation) */
  maxLength?: number;
  /** Strip command XML tags and show "Active Session" (default: false) */
  stripCommands?: boolean;
  /** Strip trailing "..." and "-" artifacts (default: false) */
  stripArtifacts?: boolean;
  /** Fallback title when rawTitle is null (default: 'Untitled') */
  fallbackTitle?: string;
}

export function formatSessionTitle(
  rawTitle: string | null,
  options?: FormatTitleOptions,
): { isPlan: boolean; displayTitle: string } {
  const fallback = options?.fallbackTitle ?? 'Untitled';
  if (!rawTitle) return { isPlan: false, displayTitle: fallback };

  if (options?.stripCommands) {
    const trimmed = rawTitle.trim();
    if (trimmed.startsWith('<local-command') || trimmed.startsWith('<command-')) {
      return { isPlan: false, displayTitle: 'Active Session' };
    }
  }

  for (const pattern of PLAN_TITLE_PATTERNS) {
    if (pattern.test(rawTitle)) {
      const cleaned = rawTitle.replace(pattern, '').trim();
      const headingMatch = cleaned.match(/^#\s+(.+)/m);
      let planName = headingMatch ? headingMatch[1].trim() : cleaned.split('\n')[0].trim();

      if (options?.stripArtifacts) {
        planName = planName.replace(/\.{3}$/, '').replace(/-$/, '').trim();
      }

      if (options?.maxLength && planName.length > options.maxLength) {
        planName = planName.slice(0, options.maxLength - 3) + '...';
      }

      return { isPlan: true, displayTitle: planName || 'Unnamed Plan' };
    }
  }

  return { isPlan: false, displayTitle: rawTitle };
}

// ─── Format Token Count ─────────────────────────────────────

export function formatTokens(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${Math.round(count / 1000)}k`;
  return String(count);
}

// ─── Context Color (Interpolated) ───────────────────────────

export function contextColor(pct: number): string {
  if (pct <= 50) return colors.accent;
  // Interpolate from accent (#E67E52) to danger (#EF4444) between 50-100%
  const t = Math.min(1, (pct - 50) / 50);
  const r = Math.round(0xE6 + (0xEF - 0xE6) * t);
  const g = Math.round(0x7E - (0x7E - 0x44) * t);
  const b = Math.round(0x52 - (0x52 - 0x44) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// ─── Activity Icon ──────────────────────────────────────────

export function ActivityIcon({ hint, color, size = 13 }: { hint: string; color: string; size?: number }) {
  const props = { size, color, strokeWidth: 2 };
  switch (hint) {
    case 'terminal':       return <Terminal {...props} />;
    case 'file-text':      return <FileText {...props} />;
    case 'pen-tool':       return <PenTool {...props} />;
    case 'search':         return <Search {...props} />;
    case 'bot':            return <Bot {...props} />;
    case 'globe':          return <Globe {...props} />;
    case 'plug':           return <Plug {...props} />;
    case 'wrench':         return <Wrench {...props} />;
    case 'message-square': return <MessageSquare {...props} />;
    case 'loader':         return <Loader {...props} style={{ animation: 'spin 1.5s linear infinite' }} />;
    case 'plan':           return <PlanIcon size={size} color={color} />;
    default:               return null;
  }
}
