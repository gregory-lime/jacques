import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { colors } from '../../styles/theme';

interface SettingsSectionProps {
  title: string;
  icon?: ReactNode;
  description?: string;
  badge?: ReactNode;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function SettingsSection({
  title,
  icon,
  description,
  badge,
  defaultExpanded = false,
  children,
}: SettingsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div style={styles.container}>
      <button
        type="button"
        style={styles.header}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span
          style={{
            ...styles.chevron,
            transform: isExpanded ? 'rotate(90deg)' : 'none',
          }}
        >
          <ChevronRight size={16} />
        </span>
        <div style={styles.headerContent}>
          <div style={styles.titleRow}>
            {icon && <span style={styles.icon}>{icon}</span>}
            <span style={styles.title}>{title}</span>
            {badge && <span style={styles.badge}>{badge}</span>}
          </div>
          {description && !isExpanded && (
            <div style={styles.description}>{description}</div>
          )}
        </div>
      </button>
      {isExpanded && (
        <div style={styles.content}>
          {children}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: colors.bgPrimary,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    width: '100%',
    padding: '14px 16px',
    backgroundColor: colors.bgSecondary,
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'background-color 150ms ease',
  },
  chevron: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: colors.textMuted,
    transition: 'transform 150ms ease',
    flexShrink: 0,
    marginTop: '2px',
  },
  headerContent: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: colors.accent,
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.textPrimary,
  },
  badge: {
    marginLeft: 'auto',
  },
  description: {
    fontSize: '12px',
    color: colors.textMuted,
    marginTop: '4px',
  },
  content: {
    padding: '16px',
    borderTop: `1px solid ${colors.borderSubtle}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
};
