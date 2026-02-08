/**
 * CompactSessionCard — Terminal Monitor Card v5 (Pixel Glow)
 *
 * Click-to-select with pixel glow borders. No checkboxes.
 *
 *   Chrome:  ● model                              3m
 *            ████████████████░░░░░░░░░░░░░░░░░░░░░░
 *
 *   Title:   My Session Title Here
 *            🌿 feature-branch
 *
 *   Footer:  ✎ Editing code    ⚠ Low     📋2 🤖3 →
 *
 * Interaction:
 *   Click card body  → toggles coral pixel glow (selected for tiling)
 *   Click → button   → opens session viewer
 *   Click plan badge  → opens plans modal
 *   Click agent badge → opens agents modal
 *   Cyan glow        → auto-detected focused terminal
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Session, SessionBadges } from '../types';
import { colors } from '../styles/theme';
import { PlanIcon, AgentIcon } from './Icons';
import {
  ChevronRight, Crosshair, Zap, GitBranch, ShieldOff,
  Terminal, FileText, PenTool, Search, Bot,
  Globe, Plug, Wrench, MessageSquare, Loader,
} from 'lucide-react';
import { getActivityInfo } from '../utils/activityLabel';

interface CompactSessionCardProps {
  session: Session;
  isFocused?: boolean;
  /** Keyboard navigation cursor (from j/k shortcuts) */
  isKeyboardFocused?: boolean;
  badges?: SessionBadges;
  onClick?: () => void;
  onFocusClick?: () => void;
  onPlanClick?: () => void;
  onAgentClick?: () => void;
  isSelected?: boolean;
  onSelectionChange?: (selected: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────

const PLAN_TITLE_PATTERNS = [
  /^implement the following plan[:\s]*/i,
  /^here is the plan[:\s]*/i,
  /^follow this plan[:\s]*/i,
];

function formatTitle(raw: string | null): { isPlan: boolean; title: string } {
  if (!raw) return { isPlan: false, title: 'Untitled session' };
  const trimmed = raw.trim();
  if (trimmed.startsWith('<local-command') || trimmed.startsWith('<command-')) {
    return { isPlan: false, title: 'Active Session' };
  }
  for (const p of PLAN_TITLE_PATTERNS) {
    if (p.test(raw)) {
      const cleaned = raw.replace(p, '').trim();
      const heading = cleaned.match(/^#\s+(.+)/m);
      let name = heading ? heading[1].trim() : cleaned.split('\n')[0].trim();
      // Strip trailing "..." from index truncation artifacts
      name = name.replace(/\.{3}$/, '').replace(/-$/, '').trim();
      return { isPlan: true, title: name || 'Unnamed Plan' };
    }
  }
  return { isPlan: false, title: raw };
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`;
  return tokens.toString();
}

function contextColor(pct: number): string {
  if (pct <= 50) return colors.accent;
  // Interpolate from accent (#E67E52) to danger (#EF4444) between 50-100%
  const t = Math.min(1, (pct - 50) / 50);
  const r = Math.round(0xE6 + (0xEF - 0xE6) * t);
  const g = Math.round(0x7E - (0x7E - 0x44) * t);
  const b = Math.round(0x52 - (0x52 - 0x44) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// ─── Activity Icon ────────────────────────────────────────

function ActivityIcon({ hint, color, size = 13 }: { hint: string; color: string; size?: number }) {
  const p = { size, color, strokeWidth: 2 };
  switch (hint) {
    case 'terminal':       return <Terminal {...p} />;
    case 'file-text':      return <FileText {...p} />;
    case 'pen-tool':       return <PenTool {...p} />;
    case 'search':         return <Search {...p} />;
    case 'bot':            return <Bot {...p} />;
    case 'globe':          return <Globe {...p} />;
    case 'plug':           return <Plug {...p} />;
    case 'wrench':         return <Wrench {...p} />;
    case 'message-square': return <MessageSquare {...p} />;
    case 'loader':         return <Loader {...p} style={{ animation: 'spin 1.5s linear infinite' }} />;
    case 'plan':           return <PlanIcon size={size} color={color} />;
    default:               return null;
  }
}

// ─── Component ────────────────────────────────────────────

export function CompactSessionCard({
  session,
  isFocused = false,
  isKeyboardFocused = false,
  badges,
  onClick,
  onFocusClick,
  onPlanClick,
  onAgentClick,
  isSelected = false,
  onSelectionChange,
}: CompactSessionCardProps) {
  const titleRef = useRef<HTMLDivElement>(null);
  const titleTextRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [focusHovered, setFocusHovered] = useState(false);
  const [planHovered, setPlanHovered] = useState(false);
  const [agentHovered, setAgentHovered] = useState(false);
  const [arrowHovered, setArrowHovered] = useState(false);
  const [selectingAnim, setSelectingAnim] = useState<'selecting' | 'deselecting' | null>(null);

  // Track previous isSelected to trigger animations
  const prevSelectedRef = useRef(isSelected);
  useEffect(() => {
    if (isSelected !== prevSelectedRef.current) {
      setSelectingAnim(isSelected ? 'selecting' : 'deselecting');
      const timer = setTimeout(() => setSelectingAnim(null), isSelected ? 300 : 200);
      prevSelectedRef.current = isSelected;
      return () => clearTimeout(timer);
    }
  }, [isSelected]);

  useEffect(() => {
    const check = () => {
      if (titleRef.current && titleTextRef.current) {
        setShouldScroll(titleTextRef.current.scrollWidth > titleRef.current.offsetWidth);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [session.session_title]);

  const status = session.status;
  const { isPlan, title: displayTitle } = formatTitle(session.session_title);
  const activity = getActivityInfo(status, session.last_tool_name);

  const model = session.model?.display_name || session.model?.id || '';
  const shortModel = model
    .replace('claude-', '')
    .replace('-20251101', '')
    .replace('-20250218', '')
    .replace('-20250514', '');

  const hasPlan = badges && badges.planCount > 0;
  const hasAgents = badges && badges.agentCount > 0;
  const metrics = session.context_metrics;
  const pct = metrics?.used_percentage ?? 0;
  const maxTokens = metrics?.context_window_size ?? 0;
  const currentTokens = Math.round(maxTokens * (pct / 100));
  const barColor = contextColor(pct);

  const handleFocus = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onFocusClick?.(); }, [onFocusClick]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelectionChange) {
      onSelectionChange(!isSelected);
    }
  }, [onSelectionChange, isSelected]);

  const handleViewClick = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onClick?.(); }, [onClick]);
  const handlePlanClick = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onPlanClick?.(); }, [onPlanClick]);
  const handleAgentClick = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onAgentClick?.(); }, [onAgentClick]);

  // Build CSS class list
  const classNames = [
    'jacques-compact-card',
    isSelected && 'is-selected',
    isFocused && 'is-focused',
    isKeyboardFocused && 'is-keyboard-focused',
    selectingAnim === 'selecting' && 'is-selecting',
    selectingAnim === 'deselecting' && 'is-deselecting',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classNames}
      data-session-id={session.session_id}
      style={{
        ...S.card,
        borderLeftWidth: '3px',
        borderLeftColor: isFocused ? colors.accent : activity.needsAttention ? activity.color : '#2e2e2e',
      }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      aria-label={`Session: ${displayTitle}`}
    >
      {/* ─── Chrome Bar ─────────────────────────────────── */}
      <div style={S.chrome}>
        <div style={S.chromeLeft}>
          {/* Status dot */}
          <span
            style={{
              ...S.dot,
              backgroundColor: activity.color,
              boxShadow: `0 0 8px ${activity.color}80`,
              animation: status === 'working'
                ? 'status-pulse 1.8s ease-in-out infinite'
                : (status === 'awaiting' || activity.needsAttention)
                ? 'attention-pulse 2s ease-in-out infinite'
                : 'none',
            }}
          />

          {/* Model name in chrome */}
          {shortModel && <span style={S.model}>{shortModel}</span>}

          {/* Mode pill: plan / exec */}
          <span
            style={{
              ...S.modePill,
              color: (session.mode === 'plan' || session.mode === 'planning') ? '#34D399' : '#60A5FA',
              backgroundColor: (session.mode === 'plan' || session.mode === 'planning')
                ? 'rgba(52, 211, 153, 0.12)'
                : 'rgba(96, 165, 250, 0.12)',
            }}
          >
            {(session.mode === 'plan' || session.mode === 'planning') ? 'plan' : 'exec'}
          </span>
          {session.is_bypass && (
            <ShieldOff size={11} color="#EF4444" style={{ flexShrink: 0, opacity: 0.85 }} />
          )}
        </div>

        <div style={S.chromeRight}>
          {onFocusClick && (
            <button
              onClick={handleFocus}
              onMouseEnter={() => setFocusHovered(true)}
              onMouseLeave={() => setFocusHovered(false)}
              style={{ ...S.focusBtn, opacity: isHovered ? (focusHovered ? 1 : 0.6) : 0 }}
              title="Focus terminal"
            >
              <Crosshair size={12} />
            </button>
          )}
          {metrics && (
            <span style={S.tokenInfo}>
              {pct >= 70
                ? <span style={{ color: colors.danger }}>!! </span>
                : pct >= 50
                ? <span style={{ color: colors.accent }}>! </span>
                : null
              }
              {formatTokens(currentTokens)}/{formatTokens(maxTokens)}
            </span>
          )}
        </div>
      </div>

      {/* ─── Context Border ─────────────────────────────── */}
      <div style={S.contextTrack}>
        <div
          style={{
            ...S.contextFill,
            width: `${Math.min(100, pct)}%`,
            backgroundColor: barColor,
            boxShadow: pct >= 70 ? `0 0 10px ${barColor}50` : 'none',
          }}
        />
      </div>

      {/* ─── Body ───────────────────────────────────────── */}
      <div style={S.body}>

        {/* Title row — big and readable */}
        <div style={S.titleSection}>
          <div ref={titleRef} style={S.titleWrap}>
            {isPlan && <PlanIcon size={15} color="#34D399" style={{ flexShrink: 0, marginRight: 6 }} />}
            <span
              ref={titleTextRef}
              className={shouldScroll && isHovered ? 'jacques-title-marquee' : undefined}
              style={S.title}
            >
              {displayTitle}
            </span>
          </div>

          {/* Git branch below title */}
          {session.git_branch && (
            <div style={S.gitRow}>
              <GitBranch size={11} color={colors.textMuted} strokeWidth={2} />
              <span style={S.gitBranch}>{session.git_branch}</span>
            </div>
          )}
        </div>

        {/* Footer — activity + warning + badges */}
        <div style={S.footer}>
          <div style={S.footerLeft}>
            {/* Activity chip */}
            <span
              style={{
                ...S.activityChip,
                color: activity.color,
                animation: activity.needsAttention
                  ? 'attention-pulse 2s ease-in-out infinite'
                  : status === 'working'
                  ? 'activity-breathe 2.5s ease-in-out infinite'
                  : 'none',
              }}
            >
              <ActivityIcon hint={activity.iconHint} color={activity.color} size={13} />
              {activity.label}
            </span>

          </div>

          <div style={S.footerRight}>
            {/* Clickable plan pill */}
            {hasPlan && (
              <button
                style={{
                  ...S.badgePill,
                  backgroundColor: planHovered ? 'rgba(52, 211, 153, 0.15)' : 'rgba(52, 211, 153, 0.08)',
                  borderColor: planHovered ? 'rgba(52, 211, 153, 0.35)' : 'rgba(52, 211, 153, 0.18)',
                }}
                className="jacques-indicator"
                onClick={handlePlanClick}
                onMouseEnter={() => setPlanHovered(true)}
                onMouseLeave={() => setPlanHovered(false)}
                type="button"
                title={`View ${badges!.planCount} plan${badges!.planCount > 1 ? 's' : ''}`}
              >
                <PlanIcon size={12} color="#34D399" />
                <span style={{ ...S.badgeLabel, color: '#34D399' }}>
                  {badges!.planCount}
                </span>
              </button>
            )}

            {/* Clickable agent pill */}
            {hasAgents && (
              <button
                style={{
                  ...S.badgePill,
                  backgroundColor: agentHovered ? 'rgba(255, 102, 0, 0.15)' : 'rgba(255, 102, 0, 0.08)',
                  borderColor: agentHovered ? 'rgba(255, 102, 0, 0.35)' : 'rgba(255, 102, 0, 0.18)',
                }}
                className="jacques-indicator"
                onClick={handleAgentClick}
                onMouseEnter={() => setAgentHovered(true)}
                onMouseLeave={() => setAgentHovered(false)}
                type="button"
                title={`View ${badges!.agentCount} agent${badges!.agentCount > 1 ? 's' : ''}`}
              >
                <AgentIcon size={12} color="#FF6600" />
                <span style={{ ...S.badgeLabel, color: '#FF6600' }}>
                  {badges!.agentCount}
                </span>
              </button>
            )}

            {badges?.hadAutoCompact && (
              <Zap size={11} color={colors.warning} style={{ opacity: 0.6 }} />
            )}

            {/* View arrow button */}
            <button
              className="jacques-card-hint"
              onClick={handleViewClick}
              onMouseEnter={() => setArrowHovered(true)}
              onMouseLeave={() => setArrowHovered(false)}
              style={{
                ...S.viewBtn,
                opacity: isHovered ? (arrowHovered ? 1 : 0.7) : 0,
                transform: isHovered ? 'translateX(0)' : 'translateX(-4px)',
              }}
              type="button"
              title="Open session viewer"
            >
              <ChevronRight size={14} color={arrowHovered ? colors.textPrimary : colors.textMuted} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: '10px',
    border: `1px solid ${colors.borderSubtle}`,
    cursor: 'pointer',
    transition: 'all 200ms ease',
    minWidth: '240px',
    flex: '1 1 280px',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  // ─── Chrome bar ───
  chrome: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    backgroundColor: colors.bgElevated,
    gap: '10px',
    minHeight: '34px',
  },
  chromeLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    flex: 1,
  },
  chromeRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  dot: {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  model: {
    fontSize: '11px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '-0.02em',
  },
  modePill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 7px',
    fontSize: '10px',
    fontWeight: 600,
    borderRadius: '4px',
    lineHeight: 1.4,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
  },
  focusBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    padding: 0,
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    color: colors.textSecondary,
    transition: 'opacity 150ms ease',
  },
  tokenInfo: {
    fontSize: '11px',
    color: colors.textMuted,
    opacity: 0.7,
    fontVariantNumeric: 'tabular-nums',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '-0.02em',
  },

  // ─── Context border ───
  contextTrack: {
    height: '3px',
    backgroundColor: `${colors.borderSubtle}80`,
    position: 'relative',
    overflow: 'hidden',
  },
  contextFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    transition: 'width 500ms ease, background-color 500ms ease, box-shadow 500ms ease',
  },

  // ─── Body ───
  body: {
    padding: '14px 16px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },

  // ─── Title section ───
  titleSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  titleWrap: {
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden',
    minWidth: 0,
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.textPrimary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1.35,
    letterSpacing: '-0.01em',
  },
  gitRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    marginTop: '1px',
  },
  gitBranch: {
    fontSize: '11px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '-0.01em',
  },

  // ─── Footer ───
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  footerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minWidth: 0,
  },
  footerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },

  // ─── Activity chip ───
  activityChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '12px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    letterSpacing: '0.01em',
    lineHeight: 1,
  },


  // ─── Clickable badge pills ───
  badgePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '5px',
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    flexShrink: 0,
  },
  badgeLabel: {
    fontSize: '11px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
  },

  // ─── View button ───
  viewBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 200ms ease',
    flexShrink: 0,
    marginLeft: '2px',
  },
};
