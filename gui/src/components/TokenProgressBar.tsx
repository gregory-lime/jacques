/**
 * TokenProgressBar - Horizontal progress bar for token usage
 */

import { colors } from '../styles/theme';

interface TokenProgressBarProps {
  label: string;
  current: number;
  max?: number;
  color?: string;
}

/**
 * Format token count with K/M suffix
 */
function formatTokens(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${Math.round(count / 1000)}k`;
  }
  return count.toString();
}

export function TokenProgressBar({
  label,
  current,
  max = 200000,
  color = colors.accent,
}: TokenProgressBarProps) {
  const percentage = max > 0 ? Math.min(100, (current / max) * 100) : 0;

  return (
    <div style={styles.container}>
      <div style={styles.labelRow}>
        <span style={styles.label}>{label}</span>
        <span style={styles.value}>{formatTokens(current)}</span>
      </div>
      <div style={styles.barContainer}>
        <div
          style={{
            ...styles.barFill,
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: '12px',
    color: colors.textSecondary,
  },
  value: {
    fontSize: '12px',
    fontFamily: 'monospace',
    color: colors.textPrimary,
    fontWeight: 500,
  },
  barContainer: {
    height: '6px',
    backgroundColor: colors.bgElevated,
    borderRadius: '3px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 300ms ease',
  },
};
