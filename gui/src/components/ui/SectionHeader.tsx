import type { ReactNode } from 'react';
import { colors } from '../../styles/theme';

interface SectionHeaderProps {
  title: string;
  accentColor?: string;
  action?: ReactNode;
}

export function SectionHeader({
  title,
  accentColor = colors.accent,
  action,
}: SectionHeaderProps) {
  return (
    <div style={styles.container}>
      <div style={styles.left}>
        <span style={{ color: accentColor, marginRight: '8px', fontSize: '10px', opacity: 0.8 }}>
          {'▸'}
        </span>
        <span style={styles.label}>{title}</span>
      </div>
      {action && <div style={styles.action}>{action}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    color: colors.textMuted,
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
  },
  action: {
    flexShrink: 0,
  },
};
