import { useState } from 'react';
import { MessageSquare, ChevronDown, ChevronRight } from 'lucide-react';
import type { ConversationMessage } from '../../types';
import { colors } from '../../styles/theme';

interface QuestionNavigatorProps {
  messages: ConversationMessage[];
  currentIndex: number;
  onNavigate: (messageIndex: number, contentIndex?: number, contentId?: string) => void;
}

export function QuestionNavigator({
  messages,
  currentIndex,
  onNavigate,
}: QuestionNavigatorProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Get user questions with their indices
  const questions = messages
    .map((msg, index) => ({ msg, index }))
    .filter(({ msg }) => msg.role === 'user');

  if (questions.length === 0) {
    return null;
  }

  // Calculate which question is currently visible
  const findCurrentQuestion = () => {
    for (let i = questions.length - 1; i >= 0; i--) {
      if (questions[i].index <= currentIndex) {
        return i;
      }
    }
    return 0;
  };

  const activeQuestionIdx = findCurrentQuestion();

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, cursor: 'pointer' }} onClick={() => setCollapsed(!collapsed)}>
        <span style={styles.headerIcon}><MessageSquare size={14} /></span>
        <span style={{ flex: 1 }}>Questions ({questions.length})</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', color: colors.textMuted }}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </span>
      </div>
      {!collapsed && (
        <>
          <div style={styles.list}>
            {questions.map((q, idx) => {
              const isActive = idx === activeQuestionIdx;
              const isHovered = idx === hoveredIndex;
              const preview = getQuestionPreview(q.msg);

              return (
                <button
                  key={q.index}
                  style={{
                    ...styles.item,
                    ...(isActive ? styles.itemActive : {}),
                    ...(isHovered && !isActive ? styles.itemHovered : {}),
                  }}
                  onClick={() => onNavigate(q.index)}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  title={preview}
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
          <div style={styles.hint}>
            <span style={styles.key}>[</span> / <span style={styles.key}>]</span> Jump
          </div>
        </>
      )}
    </div>
  );
}

function getQuestionPreview(message: ConversationMessage): string {
  const textContent = message.content.find((c) => c.type === 'text');
  if (textContent && textContent.type === 'text') {
    const text = textContent.text.trim();
    const firstLine = text.split('\n')[0];
    return firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine;
  }
  return 'User message';
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    flexShrink: 0,
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
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '10px 12px',
    minHeight: '36px',
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    textAlign: 'left' as const,
    color: colors.textMuted,
    fontSize: '12px',
    transition: 'all 150ms ease',
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
  hint: {
    padding: '12px 16px',
    fontSize: '11px',
    color: colors.textMuted,
    borderTop: `1px solid ${colors.borderSubtle}`,
    textAlign: 'center' as const,
  },
  key: {
    color: colors.accent,
    fontWeight: 600,
  },
};
