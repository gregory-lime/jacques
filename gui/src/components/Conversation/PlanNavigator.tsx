import { useState, type ReactNode } from 'react';
import { FileText, PenTool, Bot, ChevronDown, ChevronRight } from 'lucide-react';
import type { ConversationMessage, ToolUseContent } from '../../types';
import { colors } from '../../styles/theme';

/** Backend plan reference (from catalog extraction) */
interface BackendPlanRef {
  title: string;
  source: 'embedded' | 'write' | 'agent';
  sources?: Array<'embedded' | 'write' | 'agent'>;
  messageIndex: number;
  filePath?: string;
  agentId?: string;
  catalogId?: string;
}

interface PlanNavigatorProps {
  messages: ConversationMessage[];
  currentIndex: number;
  onNavigate: (messageIndex: number, contentIndex?: number, contentId?: string) => void;
  onViewPlan?: (planInfo: PlanInfo) => void;
  /** Pre-deduplicated plan refs from backend catalog. When provided, skips message re-detection. */
  planRefs?: BackendPlanRef[];
}

export interface PlanInfo {
  title: string;
  source: 'embedded' | 'write' | 'agent';
  /** All detection methods that found this plan (when deduplicated) */
  sources?: Array<'embedded' | 'write' | 'agent'>;
  messageIndex: number;
  filePath?: string;
  agentId?: string;
  /** Links to catalog plan ID for content loading */
  catalogId?: string;
}

interface DetectedPlan {
  title: string;
  source: 'embedded' | 'write' | 'agent';
  /** All detection methods that found this plan (populated during dedup) */
  mergedSources?: Array<'embedded' | 'write' | 'agent'>;
  messageIndex: number;
  contentIndex?: number;
  filePath?: string;
  agentId?: string;
  /** Links to catalog plan ID for content loading */
  catalogId?: string;
  preview: string;
}

/**
 * Plan trigger patterns (same as in plan-extractor.ts)
 */
const PLAN_TRIGGER_PATTERNS = [
  /^implement the following plan[:\s]*/i,
  /^here is the plan[:\s]*/i,
  /^follow this plan[:\s]*/i,
];

/**
 * Code file extensions that should NOT be considered plans
 */
const CODE_FILE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.php',
  '.vue', '.svelte', '.astro',
  '.css', '.scss', '.less', '.sass',
  '.html', '.htm', '.xml', '.svg',
  '.json', '.yaml', '.yml', '.toml',
  '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.graphql', '.prisma',
];

/**
 * Check if a file path is a code file (not a plan)
 */
function isCodeFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return CODE_FILE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Check if content looks like a markdown plan (not code)
 */
function looksLikeMarkdownPlan(content: string): boolean {
  // Must have a markdown heading
  if (!content.includes('#')) return false;

  // Should not start with import/export/const/function (code patterns)
  const firstNonEmptyLine = content.split('\n').find(line => line.trim().length > 0) || '';
  const codePatterns = [
    /^import\s+/,
    /^export\s+/,
    /^const\s+/,
    /^let\s+/,
    /^var\s+/,
    /^function\s+/,
    /^class\s+/,
    /^interface\s+/,
    /^type\s+/,
    /^def\s+/,
    /^from\s+.*\s+import/,
    /^package\s+/,
    /^use\s+/,
    /^#include/,
    /^#!\//,
  ];
  if (codePatterns.some(pattern => pattern.test(firstNonEmptyLine.trim()))) {
    return false;
  }

  // Must have reasonable markdown structure
  const hasHeading = /^#+\s+.+/m.test(content);
  const hasListOrParagraph = /^[-*]\s+.+/m.test(content) || content.split('\n\n').length > 1;

  return hasHeading && hasListOrParagraph;
}

/**
 * Get icon and color for plan source
 */
function getPlanSourceStyle(source: 'embedded' | 'write' | 'agent'): { icon: ReactNode; color: string; label: string } {
  if (source === 'embedded') {
    return { icon: <FileText size={12} />, color: '#34D399', label: 'Embedded' };
  }
  if (source === 'agent') {
    return { icon: <Bot size={12} />, color: '#A78BFA', label: 'Agent' };
  }
  return { icon: <PenTool size={12} />, color: '#60A5FA', label: 'Written' };
}

/**
 * Extract title from plan content
 * Prefers first markdown heading, falls back to first line
 */
function extractPlanTitle(content: string): string {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    // Strip "Plan:" prefix if present
    return headingMatch[1].trim().replace(/^Plan:\s*/i, '');
  }
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.length <= 50) {
    return firstLine;
  }
  return firstLine.substring(0, 47) + '...';
}

/**
 * Detect plans from message content (fallback for uncataloged sessions).
 */
function detectPlansFromMessages(messages: ConversationMessage[]): DetectedPlan[] {
  const plans: DetectedPlan[] = [];

  messages.forEach((msg, msgIndex) => {
    // Check user messages for embedded plans
    if (msg.role === 'user') {
      for (const content of msg.content) {
        if (content.type === 'text') {
          const text = content.text.trim();

          // Check for plan trigger patterns
          for (const pattern of PLAN_TRIGGER_PATTERNS) {
            const match = text.match(pattern);
            if (match) {
              const planContent = text.substring(match[0].length).trim();

              // Validate plan content (>100 chars and has markdown heading)
              if (planContent.length >= 100 && looksLikeMarkdownPlan(planContent)) {
                const title = extractPlanTitle(planContent);
                const preview = planContent.split('\n').slice(0, 2).join(' ').substring(0, 60);

                plans.push({
                  title,
                  source: 'embedded',
                  messageIndex: msgIndex,
                  preview: preview + (preview.length >= 60 ? '...' : ''),
                });
              }
              break;
            }
          }
        }
      }
    }

    // Check assistant messages for Write tool calls to plan files and Plan agent responses
    if (msg.role === 'assistant') {
      const seenAgentIds = new Set<string>();

      msg.content.forEach((content, contentIdx) => {
        if (content.type === 'tool_use') {
          const toolContent = content as ToolUseContent;
          if (toolContent.name === 'Write') {
            const input = toolContent.input as { file_path?: string; content?: string };
            const filePath = input?.file_path || '';
            const fileContent = input?.content || '';

            // Skip code files - they're not plans even if they have "plan" in the name
            if (isCodeFile(filePath)) {
              return;
            }

            // Check if path looks like a plan file AND content looks like markdown
            const pathLooksLikePlan =
              filePath.toLowerCase().includes('plan') ||
              filePath.endsWith('.plan.md') ||
              filePath.includes('.jacques/plans/');

            if (pathLooksLikePlan && looksLikeMarkdownPlan(fileContent)) {
              const title = extractPlanTitle(fileContent);
              const preview = fileContent.split('\n').slice(0, 2).join(' ').substring(0, 60);

              plans.push({
                title,
                source: 'write',
                messageIndex: msgIndex,
                contentIndex: contentIdx,
                filePath,
                preview: preview + (preview.length >= 60 ? '...' : ''),
              });
            }
          }
        }

        // Detect Plan agent responses
        if (content.type === 'agent_progress') {
          const agentContent = content as import('../../types').AgentProgressContent;
          if (
            agentContent.agentType === 'Plan' &&
            agentContent.agentId &&
            !seenAgentIds.has(agentContent.agentId)
          ) {
            seenAgentIds.add(agentContent.agentId);
            const description = agentContent.agentDescription || 'Agent-Generated Plan';
            plans.push({
              title: description,
              source: 'agent',
              messageIndex: msgIndex,
              contentIndex: contentIdx,
              agentId: agentContent.agentId,
              preview: agentContent.prompt?.substring(0, 60) || description,
            });
          }
        }
      });
    }
  });

  if (plans.length === 0) {
    return [];
  }

  // --- Deduplicate plans by title similarity ---
  const normalizeTitle = (title: string) =>
    title.toLowerCase().replace(/^plan:\s*/i, '').replace(/[^a-z0-9]+/g, ' ').trim();

  const deduplicatedPlans: DetectedPlan[] = [];
  const titleMap = new Map<string, number>();

  for (const plan of plans) {
    const normalizedTitle = normalizeTitle(plan.title);
    const existingIdx = titleMap.get(normalizedTitle);

    if (existingIdx !== undefined) {
      const existing = deduplicatedPlans[existingIdx];
      if (!existing.mergedSources) {
        existing.mergedSources = [existing.source];
      }
      if (!existing.mergedSources.includes(plan.source)) {
        existing.mergedSources.push(plan.source);
      }
      if (!existing.filePath && plan.filePath) {
        existing.filePath = plan.filePath;
      }
      if (!existing.agentId && plan.agentId) {
        existing.agentId = plan.agentId;
      }
    } else {
      titleMap.set(normalizedTitle, deduplicatedPlans.length);
      deduplicatedPlans.push({
        ...plan,
        mergedSources: [plan.source],
      });
    }
  }

  return deduplicatedPlans;
}

/**
 * Convert backend planRefs to DetectedPlan[] (no message re-detection needed).
 */
function convertBackendPlanRefs(planRefs: BackendPlanRef[]): DetectedPlan[] {
  return planRefs.map(ref => ({
    title: ref.title,
    source: ref.source,
    mergedSources: ref.sources || [ref.source],
    messageIndex: ref.messageIndex,
    filePath: ref.filePath,
    agentId: ref.agentId,
    catalogId: ref.catalogId,
    preview: ref.title,
  }));
}

export function PlanNavigator({
  messages,
  currentIndex,
  onNavigate,
  onViewPlan,
  planRefs,
}: PlanNavigatorProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Use backend planRefs when available (already deduplicated with catalogIds),
  // fall back to message-based detection for uncataloged sessions
  const displayPlans = planRefs && planRefs.length > 0
    ? convertBackendPlanRefs(planRefs)
    : detectPlansFromMessages(messages);

  if (displayPlans.length === 0) {
    return null;
  }

  // Find which plan is currently active (closest to current scroll position)
  const findActivePlan = () => {
    for (let i = displayPlans.length - 1; i >= 0; i--) {
      if (displayPlans[i].messageIndex <= currentIndex) {
        return displayPlans[i];
      }
    }
    return displayPlans[0];
  };

  const activePlan = findActivePlan();

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, cursor: 'pointer' }} onClick={() => setCollapsed(!collapsed)}>
        <span style={styles.headerIcon}><FileText size={14} /></span>
        <span style={{ flex: 1 }}>Plans ({displayPlans.length})</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', color: colors.textMuted }}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </span>
      </div>
      {!collapsed && <div style={styles.list}>
        {displayPlans.map((plan, idx) => {
          const isActive = plan === activePlan;
          const planKey = `plan-${plan.messageIndex}-${idx}`;
          const isHovered = hoveredKey === planKey;
          const allSources = plan.mergedSources || [plan.source];

          return (
            <div key={planKey} style={styles.planItem}>
              <button
                style={{
                  ...styles.navButton,
                  ...(isActive ? styles.navButtonActive : {}),
                  ...(isHovered && !isActive ? styles.navButtonHovered : {}),
                }}
                onClick={() => onNavigate(plan.messageIndex, plan.contentIndex)}
                onMouseEnter={() => setHoveredKey(planKey)}
                onMouseLeave={() => setHoveredKey(null)}
                title={plan.preview}
                type="button"
              >
                <span style={{
                  ...styles.marker,
                  backgroundColor: isActive ? colors.accent : 'transparent',
                  border: isActive ? 'none' : `1px solid ${colors.borderSubtle}`,
                }} />
                <span style={styles.planTitle}>{plan.title}</span>
                <span style={styles.sourceBadges}>
                  {allSources.map((src) => {
                    const srcStyle = getPlanSourceStyle(src);
                    return (
                      <span
                        key={src}
                        style={{ ...styles.sourceBadge, color: srcStyle.color, borderColor: srcStyle.color }}
                        title={srcStyle.label}
                      >
                        {srcStyle.icon}
                      </span>
                    );
                  })}
                </span>
              </button>
              {onViewPlan && (
                <button
                  style={styles.viewButton}
                  onClick={() => onViewPlan({
                    title: plan.title,
                    source: plan.source,
                    sources: allSources,
                    messageIndex: plan.messageIndex,
                    filePath: plan.filePath,
                    agentId: plan.agentId,
                    catalogId: plan.catalogId,
                  })}
                  title="View full plan"
                  type="button"
                >
                  View
                </button>
              )}
            </div>
          );
        })}
      </div>}
    </div>
  );
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
  planItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginLeft: '8px',
  },
  navButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
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
  },
  navButtonActive: {
    backgroundColor: colors.bgElevated,
    color: colors.accent,
  },
  navButtonHovered: {
    backgroundColor: colors.bgElevated,
  },
  marker: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  planTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  sourceBadges: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  sourceBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    borderRadius: '3px',
    border: '1px solid',
    opacity: 0.7,
  },
  viewButton: {
    padding: '4px 8px',
    fontSize: '10px',
    fontWeight: 500,
    color: colors.textMuted,
    backgroundColor: 'transparent',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    flexShrink: 0,
  },
};
