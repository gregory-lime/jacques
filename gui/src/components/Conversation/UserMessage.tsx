import { useState } from 'react';
import { FileText, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import type { ConversationMessage } from '../../types';
import { colors } from '../../styles/theme';
import { estimateTokens, formatTokens } from '../../utils/tokens';
import { MarkdownRenderer } from './MarkdownRenderer';

interface UserMessageProps {
  message: ConversationMessage;
}

/**
 * Plan trigger patterns (same as in plan-extractor.ts)
 */
const PLAN_TRIGGER_PATTERNS = [
  { pattern: /^implement the following plan[:\s]*/i, label: 'Implement the following plan:' },
  { pattern: /^here is the plan[:\s]*/i, label: 'Here is the plan:' },
  { pattern: /^follow this plan[:\s]*/i, label: 'Follow this plan:' },
];

/**
 * Extract plan title from content (first markdown heading)
 */
function extractPlanTitle(content: string): string {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    const title = headingMatch[1].trim();
    // If it already starts with "Plan:", keep it; otherwise add prefix
    return title.startsWith('Plan:') ? title : `Plan: ${title}`;
  }
  return 'Plan';
}

/**
 * Check if content looks like a markdown plan
 */
function looksLikeMarkdownPlan(content: string): boolean {
  if (!content || content.length < 100) return false;

  // Must have a markdown heading
  const hasHeading = /^#+\s+.+/m.test(content);
  if (!hasHeading) return false;

  // Should have some structure (lists or multiple paragraphs)
  const hasListOrParagraph = /^[-*]\s+.+/m.test(content) || content.split('\n\n').length > 1;

  return hasListOrParagraph;
}

interface ParsedContent {
  type: 'text' | 'plan';
  content: string;
  planTitle?: string;
  triggerLabel?: string;
}

/**
 * Parse text content to extract embedded plans
 */
function parseContent(text: string): ParsedContent[] {
  const results: ParsedContent[] = [];

  // Check for plan trigger patterns
  for (const { pattern, label } of PLAN_TRIGGER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const beforePlan = text.substring(0, match.index || 0).trim();
      const planContent = text.substring((match.index || 0) + match[0].length).trim();

      // Validate plan content
      if (looksLikeMarkdownPlan(planContent)) {
        // Add any text before the plan trigger
        if (beforePlan.length > 0) {
          results.push({ type: 'text', content: beforePlan });
        }

        // Add the plan
        results.push({
          type: 'plan',
          content: planContent,
          planTitle: extractPlanTitle(planContent),
          triggerLabel: label,
        });

        return results;
      }
    }
  }

  // No plan found - return as plain text
  return [{ type: 'text', content: text }];
}

export function UserMessage({ message }: UserMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [planExpanded, setPlanExpanded] = useState(false);

  const timestamp = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Extract text content
  const textContent = message.content
    .filter((c) => c.type === 'text')
    .map((c) => (c as { type: 'text'; text: string }).text)
    .join('\n');

  // Parse content to find embedded plans
  const parsedContent = parseContent(textContent);
  const hasPlan = parsedContent.some(p => p.type === 'plan');

  // Estimate tokens
  const tokens = estimateTokens(textContent);

  // Check if content is long (>400 chars or >15 lines)
  const lineCount = textContent.split('\n').length;
  const isLong = textContent.length > 400 || lineCount > 15;
  const shouldCollapse = isLong && !isExpanded;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.role}>User</span>
        <div style={styles.headerRight}>
          {hasPlan && (
            <span style={styles.planIndicator}>
              <FileText size={12} /> Has Plan
            </span>
          )}
          <span style={styles.tokenBadge} title={`~${tokens} tokens`}>
            {formatTokens(tokens)} tok
          </span>
          <span style={styles.timestamp}>{timestamp}</span>
        </div>
      </div>
      <div style={styles.content}>
        {parsedContent.map((part, index) => {
          if (part.type === 'plan') {
            return (
              <div key={index}>
                {/* Trigger text */}
                {part.triggerLabel && (
                  <div style={styles.triggerText}>{part.triggerLabel}</div>
                )}

                {/* Plan box */}
                <div style={styles.planBox}>
                  {/* Plan header */}
                  <button
                    type="button"
                    style={styles.planHeader}
                    onClick={() => setPlanExpanded(!planExpanded)}
                  >
                    <span style={styles.planIcon}>
                      <FileText size={16} />
                    </span>
                    <span style={styles.planTitle}>{part.planTitle}</span>
                    <span style={styles.planToggle}>
                      {planExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                  </button>

                  {/* Plan content */}
                  {planExpanded && (
                    <div className="jacques-expand-content" style={styles.planContent}>
                      <MarkdownRenderer content={part.content} />
                    </div>
                  )}

                  {/* Collapsed preview */}
                  {!planExpanded && (
                    <div style={styles.planPreview}>
                      {part.content.split('\n').slice(0, 3).join('\n')}...
                    </div>
                  )}
                </div>
              </div>
            );
          }

          // Regular text content
          const displayText = shouldCollapse
            ? part.content.slice(0, 300) + '...'
            : part.content;

          return (
            <div key={index} style={styles.textContent}>
              {displayText}
            </div>
          );
        })}

        {/* Expand/collapse button for long messages */}
        {isLong && !hasPlan && (
          <button
            type="button"
            style={styles.expandButton}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <span style={styles.expandIcon}>
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
            {isExpanded ? 'Show less' : `Show more (${lineCount} lines)`}
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: colors.bgSecondary,
    borderRadius: '8px',
    border: `1px solid ${colors.borderSubtle}`,
    borderLeft: `2px solid ${colors.accent}`,
    overflow: 'hidden',
    marginBottom: '16px',
    width: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: colors.bgElevated,
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  role: {
    fontWeight: 600,
    color: colors.textPrimary,
  },
  planIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: '#34D399',
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: 500,
  },
  tokenBadge: {
    fontSize: '11px',
    color: colors.textMuted,
    backgroundColor: colors.bgSecondary,
    padding: '2px 8px',
    borderRadius: '4px',
    fontFamily: 'monospace',
  },
  timestamp: {
    fontSize: '12px',
    color: colors.textMuted,
  },
  content: {
    padding: '16px',
  },
  textContent: {
    color: colors.textPrimary,
    whiteSpace: 'pre-wrap' as const,
    lineHeight: 1.6,
  },
  triggerText: {
    color: colors.textSecondary,
    marginBottom: '12px',
    fontStyle: 'italic',
  },
  planBox: {
    backgroundColor: colors.bgPrimary,
    borderRadius: '8px',
    border: `1px solid #34D399`,
    overflow: 'hidden',
  },
  planHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 12px',
    minHeight: '36px',
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    border: 'none',
    borderBottom: `1px solid rgba(52, 211, 153, 0.3)`,
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  planIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    color: '#34D399',
  },
  planTitle: {
    flex: 1,
    fontSize: '14px',
    fontWeight: 600,
    color: '#34D399',
    overflow: 'visible',
    whiteSpace: 'normal' as const,
    wordBreak: 'break-word' as const,
  },
  planToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    color: colors.textMuted,
  },
  planContent: {
    padding: '8px 12px',
    maxHeight: '500px',
    overflow: 'auto',
  },
  planPreview: {
    padding: '8px 12px',
    color: colors.textMuted,
    fontSize: '13px',
    whiteSpace: 'pre-wrap' as const,
    maxHeight: '80px',
    overflow: 'hidden',
  },
  expandButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    marginTop: '12px',
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '4px',
    color: colors.textMuted,
    fontSize: '12px',
    cursor: 'pointer',
  },
  expandIcon: {
    display: 'inline-flex',
    alignItems: 'center',
  },
};
