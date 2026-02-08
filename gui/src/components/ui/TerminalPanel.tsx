import type { ReactNode } from 'react';
import { colors } from '../../styles/theme';

interface TerminalPanelProps {
  title?: string;
  status?: ReactNode;
  showDots?: boolean;
  children: ReactNode;
  headerRight?: ReactNode;
  noPadding?: boolean;
  onClick?: () => void;
}

export function TerminalPanel({
  title,
  status,
  showDots = true,
  children,
  headerRight,
  noPadding = false,
  onClick,
}: TerminalPanelProps) {
  return (
    <div
      style={{
        ...styles.container,
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      {/* Chrome bar */}
      <div style={styles.chrome}>
        <div style={styles.chromeLeft}>
          {showDots && (
            <div style={styles.dots}>
              <span style={{ ...styles.dot, backgroundColor: colors.dotRed }} />
              <span style={{ ...styles.dot, backgroundColor: colors.dotYellow }} />
              <span style={{ ...styles.dot, backgroundColor: colors.dotGreen }} />
            </div>
          )}
          {title && <span style={styles.title}>{title}</span>}
        </div>
        <div style={styles.chromeRight}>
          {status}
          {headerRight}
        </div>
      </div>

      {/* Content */}
      <div style={noPadding ? styles.contentNoPadding : styles.content}>
        {children}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: colors.bgPrimary,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '8px',
    overflow: 'hidden',
    transition: 'border-color 200ms ease',
  },
  chrome: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '32px',
    padding: '0 12px',
    backgroundColor: colors.bgSecondary,
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  chromeLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minWidth: 0,
  },
  chromeRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  dots: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    opacity: 0.7,
  },
  title: {
    fontSize: '11px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  content: {
    padding: '16px',
  },
  contentNoPadding: {
    padding: 0,
  },
};
