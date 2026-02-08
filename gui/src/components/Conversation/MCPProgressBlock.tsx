import { Check, Loader } from 'lucide-react';
import type { MCPProgressContent } from '../../types';
import { colors } from '../../styles/theme';

interface MCPProgressBlockProps {
  content: MCPProgressContent;
}

export function MCPProgressBlock({ content }: MCPProgressBlockProps) {
  const isCompleted = content.status === 'completed';
  const statusColor = isCompleted ? colors.success : colors.accent;

  return (
    <div style={styles.container}>
      <span style={{ ...styles.icon, color: statusColor }}>
        {isCompleted
          ? <Check size={14} />
          : <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
        }
      </span>
      <span style={styles.label}>MCP</span>
      {content.serverName && (
        <span style={styles.server}>{content.serverName}</span>
      )}
      {content.toolName && (
        <span style={styles.tool}>{content.toolName}</span>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: colors.bgElevated,
    borderRadius: '6px',
    border: `1px solid ${colors.borderSubtle}`,
    marginTop: '8px',
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: colors.textMuted,
  },
  server: {
    fontSize: '12px',
    color: colors.textSecondary,
    backgroundColor: colors.bgSecondary,
    padding: '2px 6px',
    borderRadius: '3px',
  },
  tool: {
    fontSize: '12px',
    color: colors.accent,
  },
};
