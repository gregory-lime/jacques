import { useState, type ReactNode } from 'react';
import { Search, FileText, Bot, Terminal, ChevronDown, ChevronRight } from 'lucide-react';
import type { ConversationMessage, AgentProgressContent } from '../../types';
import { colors } from '../../styles/theme';

interface SubagentNavigatorProps {
  messages: ConversationMessage[];
  currentIndex: number;
  onNavigate: (messageIndex: number, contentIndex?: number, contentId?: string) => void;
}

interface SubagentInfo {
  agentId: string;
  agentType?: string;
  prompt?: string;
  messageIndex: number;
  contentIndex: number;
}

/**
 * Get icon and color for agent type
 */
function getAgentTypeStyle(agentType?: string): { icon: ReactNode; color: string; label: string } {
  switch (agentType?.toLowerCase()) {
    case 'explore':
      return { icon: <Search size={12} />, color: '#60A5FA', label: 'Explore' };
    case 'plan':
      return { icon: <FileText size={12} />, color: '#34D399', label: 'Plan' };
    case 'general-purpose':
      return { icon: <Bot size={12} />, color: '#A78BFA', label: 'General' };
    case 'bash':
      return { icon: <Terminal size={12} />, color: '#F472B6', label: 'Bash' };
    default:
      return { icon: <Bot size={12} />, color: '#9CA3AF', label: agentType || 'Agent' };
  }
}

export function SubagentNavigator({
  messages,
  currentIndex,
  onNavigate,
}: SubagentNavigatorProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Extract all subagents from messages
  const subagents: SubagentInfo[] = [];

  messages.forEach((msg, msgIndex) => {
    if (msg.role === 'assistant') {
      msg.content.forEach((content, contentIdx) => {
        if (content.type === 'agent_progress') {
          const agentContent = content as AgentProgressContent;
          if (agentContent.agentId) {
            subagents.push({
              agentId: agentContent.agentId,
              agentType: agentContent.agentType,
              prompt: agentContent.prompt,
              messageIndex: msgIndex,
              contentIndex: contentIdx,
            });
          }
        }
      });
    }
  });

  if (subagents.length === 0) {
    return null;
  }

  // Group by agent type
  const byType = new Map<string, SubagentInfo[]>();
  for (const agent of subagents) {
    const type = agent.agentType || 'unknown';
    const list = byType.get(type) || [];
    list.push(agent);
    byType.set(type, list);
  }

  // Sort types: Explore first, then Plan, then others
  const typeOrder = ['explore', 'plan', 'general-purpose', 'bash'];
  const sortedTypes = Array.from(byType.keys()).sort((a, b) => {
    const aIdx = typeOrder.indexOf(a.toLowerCase());
    const bIdx = typeOrder.indexOf(b.toLowerCase());
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  // Find which agent is currently active (closest to current scroll position)
  const findActiveAgent = () => {
    for (let i = subagents.length - 1; i >= 0; i--) {
      if (subagents[i].messageIndex <= currentIndex) {
        return subagents[i].agentId;
      }
    }
    return subagents[0]?.agentId;
  };

  const activeAgentId = findActiveAgent();

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, cursor: 'pointer' }} onClick={() => setCollapsed(!collapsed)}>
        <span style={styles.headerIcon}><Bot size={14} /></span>
        <span style={{ flex: 1 }}>Subagents ({subagents.length})</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', color: colors.textMuted }}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </span>
      </div>
      {!collapsed && <div style={styles.list}>
        {sortedTypes.map((type) => {
          const agents = byType.get(type) || [];
          const typeStyle = getAgentTypeStyle(type);

          return (
            <div key={type} style={styles.typeGroup}>
              <div style={styles.typeHeader}>
                <span style={{ color: typeStyle.color, display: 'inline-flex', alignItems: 'center' }}>
                  {typeStyle.icon}
                </span>
                <span style={{ color: typeStyle.color, fontWeight: 500 }}>
                  {typeStyle.label}
                </span>
                <span style={styles.typeCount}>({agents.length})</span>
              </div>
              {agents.map((agent) => {
                const isActive = agent.agentId === activeAgentId;
                const isHovered = agent.agentId === hoveredId;
                const preview = getPromptPreview(agent.prompt);

                return (
                  <button
                    key={agent.agentId}
                    style={{
                      ...styles.item,
                      ...(isActive ? styles.itemActive : {}),
                      ...(isHovered && !isActive ? styles.itemHovered : {}),
                    }}
                    onClick={() => onNavigate(agent.messageIndex, agent.contentIndex, agent.agentId)}
                    onMouseEnter={() => setHoveredId(agent.agentId)}
                    onMouseLeave={() => setHoveredId(null)}
                    title={agent.prompt}
                    type="button"
                  >
                    <span style={{
                      ...styles.marker,
                      backgroundColor: isActive ? colors.accent : 'transparent',
                      border: isActive ? 'none' : `1px solid ${colors.borderSubtle}`,
                    }} />
                    <span style={styles.preview}>{preview}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>}
    </div>
  );
}

function getPromptPreview(prompt?: string): string {
  if (!prompt) return 'Agent task';
  const firstLine = prompt.split('\n')[0].trim();
  return firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    flexShrink: 0,
    borderTop: `1px solid ${colors.borderSubtle}`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '12px 16px',
    fontSize: '12px',
    fontWeight: 600,
    color: colors.textSecondary,
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  headerIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    color: colors.accent,
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  typeGroup: {
    marginBottom: '12px',
  },
  typeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    fontSize: '11px',
    textTransform: 'uppercase' as const,
  },
  typeCount: {
    color: colors.textMuted,
    marginLeft: 'auto',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 10px',
    minHeight: '36px',
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    textAlign: 'left' as const,
    color: colors.textMuted,
    fontSize: '11px',
    transition: 'all 150ms ease',
    marginLeft: '8px',
  },
  itemActive: {
    backgroundColor: colors.bgElevated,
    color: colors.accent,
  },
  itemHovered: {
    backgroundColor: colors.bgElevated,
  },
  marker: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  preview: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
};
