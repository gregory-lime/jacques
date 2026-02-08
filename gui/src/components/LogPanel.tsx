import { useState, useEffect, useRef } from 'react';
import { colors } from '../styles/theme';

interface ServerLog {
  type: 'server_log';
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  source: string;
}

interface LogPanelProps {
  logs: ServerLog[];
  maxLogs?: number;
}

export function LogPanel({ logs, maxLogs = 100 }: LogPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current && isExpanded) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isExpanded]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (logContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
      setAutoScroll(isAtBottom);
    }
  };

  const recentLogs = logs.slice(-maxLogs);
  const errorCount = recentLogs.filter(l => l.level === 'error').length;
  const warnCount = recentLogs.filter(l => l.level === 'warn').length;

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  const getLevelColor = (level: ServerLog['level']) => {
    switch (level) {
      case 'error': return colors.danger;
      case 'warn': return colors.warning;
      default: return colors.textMuted;
    }
  };

  const getLevelIcon = (level: ServerLog['level']) => {
    switch (level) {
      case 'error': return '✕';
      case 'warn': return '⚠';
      default: return '●';
    }
  };

  return (
    <div style={styles.container}>
      {/* Header / Toggle Bar */}
      <div
        style={styles.header}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={styles.headerLeft}>
          <span style={styles.toggleIcon}>{isExpanded ? '▼' : '▲'}</span>
          <span style={styles.title}>Server Logs</span>
          {!isExpanded && recentLogs.length > 0 && (
            <span style={styles.logCount}>({recentLogs.length})</span>
          )}
        </div>
        <div style={styles.headerRight}>
          {errorCount > 0 && (
            <span style={{ ...styles.badge, backgroundColor: `${colors.danger}30`, color: colors.danger }}>
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warnCount > 0 && (
            <span style={{ ...styles.badge, backgroundColor: `${colors.warning}30`, color: colors.warning }}>
              {warnCount} warning{warnCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Log Content */}
      {isExpanded && (
        <div
          ref={logContainerRef}
          style={styles.logContainer}
          onScroll={handleScroll}
        >
          {recentLogs.length === 0 ? (
            <div style={styles.emptyState}>No logs yet</div>
          ) : (
            recentLogs.map((log, index) => (
              <div key={index} style={styles.logEntry}>
                <span style={styles.timestamp}>{formatTime(log.timestamp)}</span>
                <span style={{ ...styles.levelIcon, color: getLevelColor(log.level) }}>
                  {getLevelIcon(log.level)}
                </span>
                <span style={styles.source}>[{log.source}]</span>
                <span style={{ ...styles.message, color: getLevelColor(log.level) }}>
                  {log.message.replace(/^\[[^\]]+\]\s*/, '')}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Auto-scroll indicator */}
      {isExpanded && !autoScroll && (
        <button
          style={styles.scrollButton}
          onClick={() => {
            setAutoScroll(true);
            if (logContainerRef.current) {
              logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
            }
          }}
        >
          ↓ Scroll to bottom
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bgSecondary,
    borderTop: `1px solid ${colors.borderSubtle}`,
    zIndex: 1000,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  toggleIcon: {
    fontSize: '10px',
    color: colors.textMuted,
  },
  title: {
    fontSize: '12px',
    fontWeight: 500,
    color: colors.textSecondary,
  },
  logCount: {
    fontSize: '11px',
    color: colors.textMuted,
  },
  badge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '10px',
    fontWeight: 500,
  },
  logContainer: {
    maxHeight: '200px',
    overflowY: 'auto',
    padding: '8px 16px',
    fontFamily: 'monospace',
    fontSize: '12px',
    backgroundColor: colors.bgPrimary,
    borderTop: `1px solid ${colors.borderSubtle}`,
  },
  emptyState: {
    color: colors.textMuted,
    textAlign: 'center',
    padding: '16px',
  },
  logEntry: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '2px 0',
    lineHeight: 1.4,
  },
  timestamp: {
    color: colors.textMuted,
    flexShrink: 0,
  },
  levelIcon: {
    flexShrink: 0,
    width: '12px',
    textAlign: 'center',
  },
  source: {
    color: colors.textSecondary,
    flexShrink: 0,
  },
  message: {
    color: colors.textPrimary,
    wordBreak: 'break-word',
  },
  scrollButton: {
    position: 'absolute',
    bottom: '210px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '4px 12px',
    fontSize: '11px',
    backgroundColor: colors.accent,
    color: colors.textPrimary,
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
  },
};

export default LogPanel;
