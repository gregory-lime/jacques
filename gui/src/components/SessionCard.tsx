/**
 * SessionCard — Session card for grid views
 *
 * Same generous design language as CompactSessionCard v4:
 * - Chrome bar: dot + model + mode pill | time
 * - Context as chrome bottom border (3px track, color shifts)
 * - Title big and readable, git branch underneath
 * - Activity + clickable plan/agent pills in footer
 */

import { useState, useCallback } from 'react';
import type { Session, SessionBadges } from '../types';
import { colors } from '../styles/theme';
import { WindowBar } from './ui/WindowBar';
import { PlanIcon, AgentIcon } from './Icons';
import {
  Plug, Globe, Zap, GitBranch, Play, ShieldOff,
  Terminal, FileText, PenTool, Search, Bot,
  Wrench, MessageSquare, Loader,
} from 'lucide-react';
import { getActivityInfo } from '../utils/activityLabel';

interface SessionCardProps {
  session: Session;
  isFocused: boolean;
  badges?: SessionBadges;
  onClick?: () => void;
  onPlanClick?: () => void;
  onAgentClick?: () => void;
}

const PLAN_TITLE_PATTERNS = [
  /^implement the following plan[:\s]*/i,
  /^here is the plan[:\s]*/i,
  /^follow this plan[:\s]*/i,
];

function formatSessionTitle(rawTitle: string | null): { isPlan: boolean; isContinue: boolean; displayTitle: string } {
  if (!rawTitle) return { isPlan: false, isContinue: false, displayTitle: 'Untitled' };
  const trimmed = rawTitle.trim();
  if (trimmed.startsWith('<local-command') || trimmed.startsWith('<command-')) {
    return { isPlan: false, isContinue: false, displayTitle: 'Active Session' };
  }
  // Detect jacques-continue skill sessions
  if (trimmed.startsWith('Base directory for this skill:') && trimmed.includes('jacques-continue')) {
    return { isPlan: false, isContinue: true, displayTitle: 'Continue Session' };
  }
  for (const pattern of PLAN_TITLE_PATTERNS) {
    if (pattern.test(rawTitle)) {
      const cleaned = rawTitle.replace(pattern, '').trim();
      const headingMatch = cleaned.match(/^#\s+(.+)/m);
      const planName = headingMatch
        ? headingMatch[1].trim()
        : cleaned.split('\n')[0].trim();
      const display = planName.length > 60 ? planName.slice(0, 57) + '...' : planName;
      return { isPlan: true, isContinue: false, displayTitle: display || 'Unnamed Plan' };
    }
  }
  const isContinue = rawTitle.startsWith('Cont: ');
  return { isPlan: false, isContinue, displayTitle: rawTitle };
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

function ActivityLabelIcon({ hint, color, size = 13 }: { hint: string; color: string; size?: number }) {
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

export function SessionCard({
  session,
  isFocused,
  badges,
  onClick,
  onPlanClick,
  onAgentClick,
}: SessionCardProps) {
  const [planHovered, setPlanHovered] = useState(false);
  const [agentHovered, setAgentHovered] = useState(false);

  const status = session.status;
  const activity = getActivityInfo(status, session.last_tool_name);
  const { isPlan, displayTitle } = formatSessionTitle(session.session_title);

  const model = session.model?.display_name || session.model?.id || 'Unknown model';
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

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    onClick?.();
  }, [onClick]);

  const handlePlanClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onPlanClick?.();
  }, [onPlanClick]);

  const handleAgentClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onAgentClick?.();
  }, [onAgentClick]);

  return (
    <div
      className="jacques-session-card"
      style={{
        ...styles.card,
        borderLeftColor: activity.needsAttention ? activity.color : isFocused ? colors.accent : 'transparent',
        borderLeftWidth: '3px',
        boxShadow: isFocused ? `0 0 0 1px ${colors.accent}30, 0 4px 16px rgba(0,0,0,0.3)` : '0 2px 8px rgba(0,0,0,0.25)',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={handleCardClick}
    >
      {/* Chrome bar */}
      <WindowBar
        title={
          <>
            <span
              style={{
                ...styles.statusDot,
                backgroundColor: activity.color,
                boxShadow: `0 0 8px ${activity.color}80`,
                animation: status === 'working'
                  ? 'status-pulse 1.8s ease-in-out infinite'
                  : (status === 'awaiting' || activity.needsAttention)
                  ? 'attention-pulse 2s ease-in-out infinite'
                  : 'none',
              }}
            />
            <span
              style={{
                ...styles.modePill,
                color: (session.mode === 'plan' || session.mode === 'planning') ? '#34D399' : '#60A5FA',
                backgroundColor: (session.mode === 'plan' || session.mode === 'planning')
                  ? 'rgba(52, 211, 153, 0.12)'
                  : 'rgba(96, 165, 250, 0.12)',
              }}
            >
              {(session.mode === 'plan' || session.mode === 'planning')
                ? <><GitBranch size={10} style={{ marginRight: 3 }} />plan</>
                : <><Play size={10} style={{ marginRight: 3 }} />exec</>
              }
            </span>
            {session.is_bypass && (
              <ShieldOff size={12} color="#EF4444" style={{ flexShrink: 0, opacity: 0.85 }} />
            )}
          </>
        }
      >
        <span style={styles.modelName}>{shortModel}</span>
        {metrics && (
          <span style={styles.tokenInfo}>
            {pct >= 70
              ? <span style={{ color: colors.danger }}>!! </span>
              : pct >= 50
              ? <span style={{ color: colors.accent }}>! </span>
              : null
            }
            {formatTokens(currentTokens)}/{formatTokens(maxTokens)}
          </span>
        )}
      </WindowBar>

      {/* Context border */}
      <div style={styles.contextTrack}>
        <div
          style={{
            ...styles.contextFill,
            width: `${Math.min(100, pct)}%`,
            backgroundColor: barColor,
            boxShadow: pct >= 70 ? `0 0 10px ${barColor}50` : 'none',
          }}
        />
      </div>

      {/* Card body */}
      <div style={styles.body}>
        {/* Title section */}
        <div style={styles.titleSection}>
          <div style={styles.titleRow}>
            {isPlan && (
              <PlanIcon size={15} color="#34D399" style={{ flexShrink: 0, marginRight: 6 }} />
            )}
            <span style={styles.title}>{displayTitle}</span>
          </div>
          {session.git_branch && (
            <div style={styles.gitRow}>
              <GitBranch size={11} color={colors.textMuted} strokeWidth={2} />
              <span style={styles.gitBranch}>{session.git_branch}</span>
            </div>
          )}
        </div>

        {/* Footer — activity + clickable badges */}
        <div style={styles.footer}>
          <div style={styles.footerLeft}>
            <span
              style={{
                ...styles.activityChip,
                color: activity.color,
                animation: activity.needsAttention
                  ? 'attention-pulse 2s ease-in-out infinite'
                  : status === 'working'
                  ? 'activity-breathe 2.5s ease-in-out infinite'
                  : 'none',
              }}
            >
              <ActivityLabelIcon hint={activity.iconHint} color={activity.color} size={13} />
              {activity.label}
            </span>

          </div>

          <div style={styles.footerRight}>
            {hasPlan && (
              <button
                style={{
                  ...styles.badgePill,
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
                <span style={{ ...styles.badgeLabel, color: '#34D399' }}>
                  {badges!.planCount}
                </span>
              </button>
            )}
            {hasAgents && (
              <button
                style={{
                  ...styles.badgePill,
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
                <span style={{ ...styles.badgeLabel, color: '#FF6600' }}>
                  {badges!.agentCount}
                </span>
              </button>
            )}
            {badges && badges.mcpCount > 0 && (
              <Plug size={11} color={colors.textMuted} style={{ opacity: 0.5 }} />
            )}
            {badges && badges.webSearchCount > 0 && (
              <Globe size={11} color="#60A5FA" style={{ opacity: 0.5 }} />
            )}
            {badges?.hadAutoCompact && (
              <Zap size={11} color={colors.warning} style={{ opacity: 0.6 }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: '10px',
    border: `1px solid ${colors.borderSubtle}`,
    borderLeft: '3px solid transparent',
    position: 'relative',
    overflow: 'hidden',
  },

  // Chrome bar
  statusDot: {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    flexShrink: 0,
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
    marginLeft: '2px',
  },
  modelName: {
    fontSize: '11px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    letterSpacing: '-0.02em',
  },
  tokenInfo: {
    fontSize: '11px',
    color: colors.textMuted,
    opacity: 0.7,
    fontVariantNumeric: 'tabular-nums',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    letterSpacing: '-0.02em',
  },

  // Context border
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

  body: {
    padding: '14px 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },

  // Title section
  titleSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
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

  // Footer
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
  activityChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '12px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    letterSpacing: '0.01em',
  },
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
};
