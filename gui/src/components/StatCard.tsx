/**
 * StatCard - Reusable card for displaying statistics
 */

import type { ReactNode } from 'react';
import { colors } from '../styles/theme';

interface StatCardProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}

export function StatCard({ title, icon, children }: StatCardProps) {
  return (
    <div style={styles.card}>
      <div style={styles.header}>
        {icon && <span style={styles.icon}>{icon}</span>}
        <span style={styles.title}>{title}</span>
      </div>
      <div style={styles.content}>
        {children}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: '8px',
    padding: '16px',
    border: `1px solid ${colors.borderSubtle}`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  icon: {
    color: colors.textMuted,
    display: 'flex',
    alignItems: 'center',
  },
  title: {
    fontSize: '11px',
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
};
