import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Bot, Terminal, Plug, Search, Wrench, Brain, ArrowLeft, Filter, ChevronsDown, ChevronsUp, FileText } from 'lucide-react';
import type { SavedConversation, ConversationMessage, MessageContent } from '../../types';
import { colors } from '../../styles/theme';
import { Badge } from '../ui';
import { useOpenSessions } from '../../hooks/useOpenSessions';
import { UserMessage } from './UserMessage';
import { AssistantMessageGroup } from './AssistantMessageGroup';
import { QuestionNavigator } from './QuestionNavigator';
import { SubagentNavigator } from './SubagentNavigator';
import { PlanNavigator, type PlanInfo } from './PlanNavigator';
import { PlanViewer } from './PlanViewer';
import { ConversationMarker, type MarkerType } from './ConversationMarker';
import { estimateContentTokens, formatTokens } from '../../utils/tokens';

/**
 * Grouped message - either a single user message, a group of consecutive assistant messages, or a marker
 */
interface MessageGroup {
  type: 'user' | 'assistant' | 'marker';
  messages: ConversationMessage[];
  startIndex: number;
  markerType?: MarkerType;
  markerTimestamp?: string;
}

/**
 * Check if a user message is a /clear command
 */
function isClearCommand(msg: ConversationMessage): boolean {
  if (msg.role !== 'user') return false;
  for (const content of msg.content) {
    if (content.type === 'text') {
      const text = content.text;
      if (text.includes('<command-name>/clear</command-name>')) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Group consecutive assistant messages together, inserting markers for /clear commands and auto-compact
 */
function groupMessages(messages: ConversationMessage[], autoCompactAt?: string): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentGroup: MessageGroup | null = null;
  let autoCompactInserted = false;
  const autoCompactTime = autoCompactAt ? new Date(autoCompactAt).getTime() : null;

  messages.forEach((msg, index) => {
    // Check if we need to insert auto-compact marker before this message
    if (autoCompactTime && !autoCompactInserted && msg.timestamp > autoCompactTime) {
      // Finish any pending group first
      if (currentGroup) {
        groups.push(currentGroup);
        currentGroup = null;
      }
      // Insert auto-compact marker
      groups.push({
        type: 'marker',
        messages: [],
        startIndex: index,
        markerType: 'auto_compact',
        markerTimestamp: autoCompactAt,
      });
      autoCompactInserted = true;
    }

    if (msg.role === 'user') {
      // Check if this is a /clear command
      if (isClearCommand(msg)) {
        // Finish any pending group
        if (currentGroup) {
          groups.push(currentGroup);
          currentGroup = null;
        }
        // Add a clear marker
        groups.push({
          type: 'marker',
          messages: [],
          startIndex: index,
          markerType: 'clear',
          markerTimestamp: new Date(msg.timestamp).toISOString(),
        });
        return;
      }

      // Regular user messages are always their own group
      if (currentGroup) {
        groups.push(currentGroup);
        currentGroup = null;
      }
      groups.push({
        type: 'user',
        messages: [msg],
        startIndex: index,
      });
    } else {
      // Assistant messages are grouped together
      if (currentGroup && currentGroup.type === 'assistant') {
        currentGroup.messages.push(msg);
      } else {
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          type: 'assistant',
          messages: [msg],
          startIndex: index,
        };
      }
    }
  });

  // Don't forget the last group
  if (currentGroup) {
    groups.push(currentGroup);
  }

  // If auto-compact occurred but no messages came after it, add marker at end
  if (autoCompactTime && !autoCompactInserted) {
    groups.push({
      type: 'marker',
      messages: [],
      startIndex: messages.length,
      markerType: 'auto_compact',
      markerTimestamp: autoCompactAt,
    });
  }

  return groups;
}

/**
 * Content type filters for granular control
 */
interface ContentTypeFilters {
  agentProgress: boolean;   // Subagent calls
  bashProgress: boolean;    // Bash streaming output
  mcpProgress: boolean;     // MCP tool calls
  webSearch: boolean;       // Web search queries/results
  toolCalls: boolean;       // Tool use/results
  thinking: boolean;        // Extended thinking
}

const defaultContentFilters: ContentTypeFilters = {
  agentProgress: true,
  bashProgress: true,
  mcpProgress: true,
  webSearch: true,
  toolCalls: true,
  thinking: true,
};

interface ConversationViewerProps {
  conversation: SavedConversation;
  onBack?: () => void;
}

/**
 * Target for navigation - identifies a specific content item
 */
interface NavigationTarget {
  messageIndex: number;
  contentIndex?: number;
  contentId?: string;  // e.g., agentId for subagents
}

const PLAN_TITLE_PATTERNS = [
  /^implement the following plan[:\s]*/i,
  /^here is the plan[:\s]*/i,
  /^follow this plan[:\s]*/i,
];

function extractSmartTitle(title: string): string | null {
  for (const pattern of PLAN_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      const rest = title.replace(pattern, '').trim();
      const headingMatch = rest.match(/^#\s+(.+)$/m);
      if (headingMatch) return headingMatch[1].trim();
      const firstLine = rest.split('\n')[0].trim();
      if (firstLine) return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine;
    }
  }
  return null;
}

export function ConversationViewer({ conversation, onBack }: ConversationViewerProps) {
  const { viewDashboard } = useOpenSessions();
  const handleBack = onBack || viewDashboard;
  const [contentFilters, setContentFilters] = useState<ContentTypeFilters>(defaultContentFilters);
  const [showContentFilters, setShowContentFilters] = useState(false);
  const [allExpanded, setAllExpanded] = useState(false);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [viewingPlan, setViewingPlan] = useState<PlanInfo | null>(null);
  // Target for auto-expanding and scrolling to specific content
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Filter messages based on selected filter and content type filters
  const filteredMessages = useMemo(() =>
    filterMessages(conversation.messages, contentFilters),
    [conversation.messages, contentFilters]
  );

  // Group consecutive assistant messages (with auto-compact marker positioning)
  const messageGroups = useMemo(() =>
    groupMessages(filteredMessages, conversation.metadata.autoCompactAt),
    [filteredMessages, conversation.metadata.autoCompactAt]
  );

  // Toggle a specific content type filter
  const toggleContentFilter = useCallback((key: keyof ContentTypeFilters) => {
    setContentFilters(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Calculate total tokens from messages - prefer actual tokens when available
  // Token counts from Claude API:
  //   - input: non-cached input tokens
  //   - cacheCreation: new tokens written to cache
  //   - cacheRead: tokens read from cache
  //   - output: tokens generated by Claude
  // Total context = input + cacheCreation + cacheRead
  const tokenStats = useMemo(() => {
    let actualInputTokens = 0;
    let actualOutputTokens = 0;
    let actualCacheCreation = 0;
    let actualCacheRead = 0;
    let hasActualTokens = false;

    // Check if we have actual tokens from metadata
    if (conversation.metadata.actualTokens) {
      hasActualTokens = true;
      actualInputTokens = conversation.metadata.actualTokens.input || 0;
      actualOutputTokens = conversation.metadata.actualTokens.output || 0;
      actualCacheCreation = conversation.metadata.actualTokens.cacheCreation || 0;
      actualCacheRead = conversation.metadata.actualTokens.cacheRead || 0;
    } else {
      // Check messages for actual tokens
      for (const msg of filteredMessages) {
        if (msg.tokens && (msg.tokens.input || msg.tokens.output)) {
          hasActualTokens = true;
          actualInputTokens += msg.tokens.input || 0;
          actualOutputTokens += msg.tokens.output || 0;
          actualCacheCreation += msg.tokens.cacheCreation || 0;
          actualCacheRead += msg.tokens.cacheRead || 0;
        }
      }
    }

    // Calculate estimated tokens
    const estimatedTokens = filteredMessages.reduce((sum, msg) => {
      return sum + msg.content.reduce((contentSum, c) => {
        return contentSum + estimateContentTokens(c);
      }, 0);
    }, 0);

    // Total context = input + cache creation + cache read
    const totalContextTokens = actualInputTokens + actualCacheCreation + actualCacheRead;

    return {
      hasActualTokens,
      actualInputTokens,
      actualOutputTokens,
      actualCacheCreation,
      actualCacheRead,
      totalContextTokens,
      estimatedTokens,
    };
  }, [filteredMessages, conversation.metadata.actualTokens]);

  // For backwards compatibility
  const totalTokens = tokenStats.hasActualTokens
    ? tokenStats.actualInputTokens + tokenStats.actualOutputTokens
    : tokenStats.estimatedTokens;

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const userQuestions = filteredMessages
        .map((msg, idx) => ({ msg, idx }))
        .filter(({ msg }) => msg.role === 'user');

      if (e.key === '[') {
        // Previous question
        const currentQ = userQuestions.findIndex(({ idx }) => idx >= currentMessageIndex);
        if (currentQ > 0) {
          navigateToMessage(userQuestions[currentQ - 1].idx);
        }
      } else if (e.key === ']') {
        // Next question
        const currentQ = userQuestions.findIndex(({ idx }) => idx > currentMessageIndex);
        if (currentQ !== -1) {
          navigateToMessage(userQuestions[currentQ].idx);
        }
      } else if (e.key === 'e') {
        setAllExpanded(true);
      } else if (e.key === 'c' && !e.metaKey && !e.ctrlKey) {
        setAllExpanded(false);
      } else if (e.key === 'End' || (e.key === 'G' && e.shiftKey)) {
        // Scroll to end
        scrollToEnd();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredMessages, currentMessageIndex]);

  const navigateToMessage = useCallback((index: number, contentIndex?: number, contentId?: string) => {
    const element = messageRefs.current.get(index);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentMessageIndex(index);
      // Set navigation target so AssistantMessage can expand the specific content
      if (contentIndex !== undefined || contentId !== undefined) {
        setNavigationTarget({ messageIndex: index, contentIndex, contentId });
        // Clear target after a short delay (after animation completes)
        setTimeout(() => setNavigationTarget(null), 500);
      }
    }
  }, []);

  const scrollToEnd = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  // Track scroll position to update current message and show/hide scroll button
  const handleScroll = () => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;

    // Show scroll button if not near the bottom (more than 200px away)
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollButton(distanceFromBottom > 200);

    let nearestIndex = 0;
    let nearestDistance = Infinity;

    messageRefs.current.forEach((element, index) => {
      const distance = Math.abs(element.offsetTop - scrollTop);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setCurrentMessageIndex(nearestIndex);
  };

  return (
    <div style={styles.container}>
      {/* Header - TerminalPanel chrome style */}
      <div style={styles.header}>
        <div style={styles.headerTop}>
          {/* Mac dots + title */}
          <div style={styles.headerChrome}>
            <button style={styles.backButton} onClick={handleBack} type="button">
              <ArrowLeft size={14} />
              <span>back</span>
            </button>
            <div style={styles.chromeDots}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.dotRed, opacity: 0.7 }} />
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.dotYellow, opacity: 0.7 }} />
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.dotGreen, opacity: 0.7 }} />
            </div>
            <span style={styles.chromeTitle}>
              conversation/{conversation.project}/{conversation.date}.jsonl
            </span>
            {conversation.metadata.hadAutoCompact && (
              <Badge label="Auto-compacted" variant="compacted" />
            )}
          </div>
          <div style={styles.titleSection}>
            {(() => {
              const smartTitle = extractSmartTitle(conversation.title);
              return smartTitle ? (
                <h2 style={styles.title}>
                  <FileText size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px', color: '#34D399' }} />
                  Plan: {smartTitle}
                </h2>
              ) : (
                <h2 style={styles.title}>{conversation.title}</h2>
              );
            })()}
          </div>
        </div>
        <div style={styles.controls}>
          {/* Content type filters toggle */}
          <div style={styles.filterDropdownContainer}>
            <button
              style={{
                ...styles.iconButton,
                ...(showContentFilters ? { backgroundColor: colors.bgElevated } : {}),
              }}
              onClick={() => setShowContentFilters(!showContentFilters)}
              type="button"
              title="Filter content types"
            >
              <Filter size={14} />
            </button>
            {showContentFilters && (
              <div style={styles.filterDropdown}>
                <label style={styles.filterCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={contentFilters.agentProgress}
                    onChange={() => toggleContentFilter('agentProgress')}
                    style={styles.filterCheckbox}
                  />
                  <Bot size={14} style={styles.filterIconLucide} /> Agents
                </label>
                <label style={styles.filterCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={contentFilters.bashProgress}
                    onChange={() => toggleContentFilter('bashProgress')}
                    style={styles.filterCheckbox}
                  />
                  <Terminal size={14} style={styles.filterIconLucide} /> Bash
                </label>
                <label style={styles.filterCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={contentFilters.mcpProgress}
                    onChange={() => toggleContentFilter('mcpProgress')}
                    style={styles.filterCheckbox}
                  />
                  <Plug size={14} style={styles.filterIconLucide} /> MCP
                </label>
                <label style={styles.filterCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={contentFilters.webSearch}
                    onChange={() => toggleContentFilter('webSearch')}
                    style={styles.filterCheckbox}
                  />
                  <Search size={14} style={styles.filterIconLucide} /> Search
                </label>
                <label style={styles.filterCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={contentFilters.toolCalls}
                    onChange={() => toggleContentFilter('toolCalls')}
                    style={styles.filterCheckbox}
                  />
                  <Wrench size={14} style={styles.filterIconLucide} /> Tools
                </label>
                <label style={styles.filterCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={contentFilters.thinking}
                    onChange={() => toggleContentFilter('thinking')}
                    style={styles.filterCheckbox}
                  />
                  <Brain size={14} style={styles.filterIconLucide} /> Thinking
                </label>
              </div>
            )}
          </div>
          {/* Expand/Collapse */}
          <button
            style={styles.iconButton}
            onClick={() => setAllExpanded(!allExpanded)}
            type="button"
            title={allExpanded ? 'Collapse all' : 'Expand all'}
          >
            {allExpanded ? <ChevronsUp size={14} /> : <ChevronsDown size={14} />}
          </button>
        </div>
      </div>

      {/* Content area with messages and navigator */}
      <div style={styles.contentArea}>
        {/* Messages */}
        <div
          ref={containerRef}
          style={styles.messages}
          onScroll={handleScroll}
        >
          {messageGroups.map((group, groupIndex) => {
            // Render markers
            if (group.type === 'marker' && group.markerType) {
              return (
                <ConversationMarker
                  key={`marker-${groupIndex}`}
                  type={group.markerType}
                  timestamp={group.markerTimestamp}
                />
              );
            }

            // Check if navigation target is within this group
            const isTargetInGroup = navigationTarget &&
              navigationTarget.messageIndex >= group.startIndex &&
              navigationTarget.messageIndex < group.startIndex + group.messages.length;

            const targetMsgIndexInGroup = isTargetInGroup
              ? navigationTarget!.messageIndex - group.startIndex
              : undefined;

            return (
              <div
                key={`group-${groupIndex}-${group.messages[0]?.id || groupIndex}`}
                ref={(el) => {
                  // Set refs for ALL message indices in this group so navigation works
                  if (el) {
                    for (let i = 0; i < group.messages.length; i++) {
                      messageRefs.current.set(group.startIndex + i, el);
                    }
                  }
                }}
                style={group.type === 'user' ? styles.userMessageWrapper : styles.assistantMessageWrapper}
              >
                {group.type === 'user' ? (
                  <UserMessage message={group.messages[0]} />
                ) : (
                  <AssistantMessageGroup
                    messages={group.messages}
                    allExpanded={allExpanded}
                    sessionId={conversation.sessionId}
                    targetMessageIndex={targetMsgIndexInGroup}
                    targetContentIndex={isTargetInGroup ? navigationTarget!.contentIndex : undefined}
                    targetContentId={isTargetInGroup ? navigationTarget!.contentId : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Scroll to End Button */}
        {showScrollButton && (
          <button
            style={styles.scrollButton}
            onClick={scrollToEnd}
            title="Scroll to end (End or Shift+G)"
            type="button"
          >
            ↓ End
          </button>
        )}

        {/* Right Panel - Navigators */}
        <div style={styles.navigatorsPanel}>
          <QuestionNavigator
            messages={filteredMessages}
            currentIndex={currentMessageIndex}
            onNavigate={navigateToMessage}
          />
          <PlanNavigator
            messages={filteredMessages}
            currentIndex={currentMessageIndex}
            onNavigate={navigateToMessage}
            onViewPlan={(plan) => setViewingPlan(plan)}
            planRefs={conversation.metadata.planRefs}
          />
          <SubagentNavigator
            messages={filteredMessages}
            currentIndex={currentMessageIndex}
            onNavigate={navigateToMessage}
          />
        </div>
      </div>

      {/* Plan Viewer Modal */}
      {viewingPlan && conversation.sessionId && (
        <PlanViewer
          plan={viewingPlan}
          sessionId={conversation.sessionId}
          projectPath={conversation.projectPath}
          onClose={() => setViewingPlan(null)}
        />
      )}

      {/* Footer with stat badges */}
      <div style={styles.footer}>
        <Badge label={`${filteredMessages.length} messages`} variant="default" />
        {tokenStats.hasActualTokens ? (
          <>
            <Badge
              label={`${formatTokens(tokenStats.totalContextTokens)} context`}
              variant="default"
            />
            <Badge
              label={`${formatTokens(tokenStats.actualOutputTokens)} out`}
              variant="default"
            />
            {(tokenStats.actualCacheCreation > 0 || tokenStats.actualCacheRead > 0) && (
              <span style={styles.cacheStat} title={`Non-cached: ${formatTokens(tokenStats.actualInputTokens)}, Cache created: ${formatTokens(tokenStats.actualCacheCreation)}, Cache read: ${formatTokens(tokenStats.actualCacheRead)}`}>
                ({formatTokens(tokenStats.actualCacheRead)} cached)
              </span>
            )}
            {conversation.metadata.subagents && conversation.metadata.subagents.totalTokens > 0 && (
              <Badge
                label={`+ ${formatTokens(conversation.metadata.subagents.totalTokens)} subagents`}
                variant="agent"
              />
            )}
          </>
        ) : (
          <Badge label={`~${formatTokens(totalTokens)} tokens`} variant="default" />
        )}
        {conversation.metadata.technologies && conversation.metadata.technologies.length > 0 && (
          <>
            {conversation.metadata.technologies.map(tech => (
              <Badge key={tech} label={tech} variant="default" />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Check if a content block should be included based on content type filters
 */
function shouldIncludeContent(content: MessageContent, filters: ContentTypeFilters): boolean {
  switch (content.type) {
    case 'agent_progress':
      return filters.agentProgress;
    case 'bash_progress':
      return filters.bashProgress;
    case 'mcp_progress':
      return filters.mcpProgress;
    case 'web_search':
      return filters.webSearch;
    case 'tool_use':
    case 'tool_result':
      return filters.toolCalls;
    case 'thinking':
      return filters.thinking;
    default:
      return true;
  }
}

function filterMessages(
  messages: ConversationMessage[],
  contentFilters: ContentTypeFilters
): ConversationMessage[] {
  return messages.map((msg) => {
    if (msg.role === 'user') {
      return msg;
    }

    // Filter assistant message content based on content type filters
    const filteredContent = msg.content.filter((content) => {
      return shouldIncludeContent(content, contentFilters);
    });

    return { ...msg, content: filteredContent };
  }).filter((msg) => msg.content.length > 0);
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    maxHeight: '100vh',
  },
  header: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    padding: '12px 16px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgSecondary,
    overflow: 'visible',
    position: 'relative' as const,
    zIndex: 10,
  },
  headerTop: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  headerChrome: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  chromeDots: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
  },
  chromeTitle: {
    fontSize: '11px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    flexShrink: 0,
  },
  titleSection: {
    flex: 1,
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: colors.textPrimary,
    margin: 0,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  iconButton: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    cursor: 'pointer',
    padding: 0,
  },
  filterDropdownContainer: {
    position: 'relative' as const,
  },
  filterDropdown: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    marginTop: '4px',
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '8px',
    padding: '8px',
    zIndex: 100,
    minWidth: '140px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  filterCheckboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    color: colors.textSecondary,
    transition: 'background-color 150ms ease',
  },
  filterCheckbox: {
    width: '14px',
    height: '14px',
    cursor: 'pointer',
    accentColor: colors.accent,
  },
  filterIconLucide: {
    opacity: 0.7,
    flexShrink: 0,
  },
  contentArea: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  messages: {
    flex: 1,
    padding: '16px',
    overflow: 'auto',
    position: 'relative' as const,
  },
  navigatorsPanel: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '260px',
    flexShrink: 0,
    backgroundColor: colors.bgSecondary,
    borderLeft: `1px solid ${colors.borderSubtle}`,
    overflow: 'auto',
  },
  scrollButton: {
    position: 'absolute' as const,
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 16px',
    backgroundColor: colors.accent,
    color: colors.textPrimary,
    border: 'none',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    zIndex: 10,
    transition: 'all 150ms ease',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    borderTop: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgSecondary,
    fontSize: '12px',
    color: colors.textMuted,
  },
  tokenStat: {
    fontFamily: 'monospace',
    fontWeight: 500,
    color: colors.textSecondary,
  },
  cacheStat: {
    fontFamily: 'monospace',
    fontWeight: 400,
    color: colors.textMuted,
    fontSize: '11px',
    marginLeft: '4px',
    cursor: 'help',
  },
  subagentStat: {
    fontFamily: 'monospace',
    fontWeight: 500,
    color: colors.accentOrange,
    marginLeft: '4px',
  },
  // Chat-style layout wrappers
  userMessageWrapper: {
    display: 'flex',
    marginBottom: '8px',
  },
  assistantMessageWrapper: {
    display: 'flex',
    marginBottom: '8px',
  },
};
