/**
 * ModelUsageChart - Horizontal bar chart showing model distribution
 */

import { colors } from '../styles/theme';

interface ModelUsageChartProps {
  usage: Record<string, number>;
}

/**
 * Get a color for a model name
 */
function getModelColor(model: string): string {
  const lowerModel = model.toLowerCase();
  if (lowerModel.includes('opus')) return colors.accent;
  if (lowerModel.includes('sonnet')) return '#60A5FA'; // Blue
  if (lowerModel.includes('haiku')) return '#4ADE80'; // Green
  return colors.textSecondary;
}

/**
 * Shorten model name for display
 */
function shortenModelName(model: string): string {
  return model
    .replace('claude-', '')
    .replace(/-\d{8}$/, '')
    .replace('-latest', '');
}

export function ModelUsageChart({ usage }: ModelUsageChartProps) {
  const entries = Object.entries(usage).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(...entries.map(([, count]) => count), 1);

  if (entries.length === 0) {
    return (
      <div style={styles.empty}>
        No model data
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {entries.map(([model, count]) => {
        const percentage = (count / maxCount) * 100;
        const color = getModelColor(model);

        return (
          <div key={model} style={styles.row}>
            <span style={styles.modelName}>{shortenModelName(model)}</span>
            <div style={styles.barContainer}>
              <div
                style={{
                  ...styles.bar,
                  width: `${percentage}%`,
                  backgroundColor: color,
                }}
              />
            </div>
            <span style={styles.count}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  empty: {
    fontSize: '12px',
    color: colors.textMuted,
    fontStyle: 'italic' as const,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  modelName: {
    fontSize: '12px',
    color: colors.textSecondary,
    width: '60px',
    flexShrink: 0,
  },
  barContainer: {
    flex: 1,
    height: '8px',
    backgroundColor: colors.bgElevated,
    borderRadius: '4px',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 300ms ease',
  },
  count: {
    fontSize: '12px',
    fontFamily: 'monospace',
    color: colors.textPrimary,
    width: '24px',
    textAlign: 'right' as const,
  },
};
