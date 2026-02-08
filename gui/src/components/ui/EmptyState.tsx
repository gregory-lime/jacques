import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { colors } from '../../styles/theme';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={styles.container}>
      <Icon size={48} color={colors.textMuted} style={{ opacity: 0.4, marginBottom: '16px' }} />
      <p style={styles.title}>{title}</p>
      {description && <p style={styles.description}>{description}</p>}
      {action && <div style={styles.action}>{action}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 32px',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '16px',
    fontWeight: 500,
    color: colors.textPrimary,
    margin: '0 0 8px 0',
  },
  description: {
    fontSize: '13px',
    color: colors.textMuted,
    margin: 0,
    maxWidth: '320px',
    lineHeight: 1.5,
  },
  action: {
    marginTop: '20px',
  },
};
