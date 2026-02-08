import type { ContextMetrics } from '../types';
import { colors } from '../styles/theme';

interface ContextMeterProps {
  metrics: ContextMetrics | null;
}

export function ContextMeter({ metrics }: ContextMeterProps) {
  if (!metrics) {
    return (
      <div style={styles.container}>
        <div style={styles.bar}>
          <div style={styles.barEmpty} />
        </div>
        <span style={styles.label}>N/A</span>
      </div>
    );
  }

  const percentage = metrics.used_percentage;
  const isEstimate = metrics.is_estimate ?? false;

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
      return `${Math.round(tokens / 1000)}k`;
    }
    return tokens.toString();
  };

  const maxTokens = metrics.context_window_size;
  const currentTokens = Math.round(maxTokens * (percentage / 100));

  return (
    <div style={styles.container}>
      {/* Progress bar */}
      <div style={styles.bar}>
        <div
          style={{
            ...styles.barFill,
            width: `${Math.min(100, percentage)}%`,
          }}
        />
      </div>

      {/* Label */}
      <div style={styles.labelContainer}>
        <span style={styles.percentage}>
          {isEstimate && '~'}
          {percentage.toFixed(1)}%
        </span>
        <span style={styles.tokens}>
          {formatTokens(currentTokens)} / {formatTokens(maxTokens)}
        </span>
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
  bar: {
    height: '8px',
    backgroundColor: colors.bgElevated,
    borderRadius: '4px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.progressFill,
    borderRadius: '4px',
    transition: 'width 300ms ease',
  },
  barEmpty: {
    height: '100%',
    backgroundColor: colors.progressEmpty,
    opacity: 0.3,
  },
  labelContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  percentage: {
    fontSize: '12px',
    fontWeight: 600,
    color: colors.accent,
  },
  tokens: {
    fontSize: '11px',
    color: colors.textMuted,
  },
  label: {
    fontSize: '12px',
    color: colors.textMuted,
  },
};
