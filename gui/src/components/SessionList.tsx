/**
 * SessionList - Scrollable list of sessions with status indicators
 */

import { colors } from '../styles/theme';
import { StatusDot } from './Icons';

export interface SessionListItem {
  id: string;
  title: string;
  source: 'live' | 'saved' | 'archived';
  date: string;
  durationMinutes?: number;
  contextPercent?: number;
  isActive?: boolean;
  isFocused?: boolean;
  status?: string;
}

interface SessionListProps {
  sessions: SessionListItem[];
  maxVisible?: number;
  onSessionClick?: (session: SessionListItem) => void;
  onShowAll?: () => void;
}

/**
 * Format relative date
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format duration in minutes
 */
function formatDuration(minutes: number | undefined): string {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function SessionList({
  sessions,
  maxVisible = 5,
  onSessionClick,
  onShowAll,
}: SessionListProps) {
  const visibleSessions = sessions.slice(0, maxVisible);
  const hasMore = sessions.length > maxVisible;

  if (sessions.length === 0) {
    return (
      <div style={styles.empty}>
        No sessions
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {visibleSessions.map((session) => {
        const isLive = session.source === 'live';
        const statusColor = isLive
          ? (session.status === 'working' ? colors.accent : colors.success)
          : colors.textMuted;

        return (
          <button
            key={session.id}
            style={styles.sessionRow}
            onClick={() => onSessionClick?.(session)}
            type="button"
          >
            <div style={styles.statusCol}>
              <StatusDot
                size={8}
                color={statusColor}
                filled={isLive}
              />
            </div>
            <div style={styles.infoCol}>
              <div style={styles.titleRow}>
                <span style={styles.title}>{session.title}</span>
                {session.contextPercent !== undefined && (
                  <span style={styles.context}>{session.contextPercent}%</span>
                )}
              </div>
              <div style={styles.metaRow}>
                <span>{formatDate(session.date)}</span>
                {session.durationMinutes && (
                  <>
                    <span style={styles.dot}>·</span>
                    <span>{formatDuration(session.durationMinutes)}</span>
                  </>
                )}
                {isLive && session.status && (
                  <>
                    <span style={styles.dot}>·</span>
                    <span style={{ color: statusColor }}>{session.status}</span>
                  </>
                )}
              </div>
            </div>
          </button>
        );
      })}

      {hasMore && onShowAll && (
        <button
          style={styles.showAllButton}
          onClick={onShowAll}
          type="button"
        >
          Show all {sessions.length} sessions
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  empty: {
    fontSize: '12px',
    color: colors.textMuted,
    fontStyle: 'italic' as const,
    padding: '8px 0',
  },
  sessionRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '8px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'background-color 150ms ease',
    width: '100%',
  },
  statusCol: {
    paddingTop: '4px',
    flexShrink: 0,
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '2px',
  },
  title: {
    fontSize: '13px',
    color: colors.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  context: {
    fontSize: '12px',
    fontFamily: 'monospace',
    color: colors.accent,
    flexShrink: 0,
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: colors.textMuted,
  },
  dot: {
    color: colors.textMuted,
  },
  showAllButton: {
    padding: '8px',
    fontSize: '12px',
    color: colors.accent,
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'color 150ms ease',
  },
};
