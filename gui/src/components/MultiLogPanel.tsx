import { useState, useEffect, useRef, useCallback } from 'react';
import { colors } from '../styles/theme';
import { API_URL } from '../api/client';
import { usePersistedState } from '../hooks/usePersistedState';
import type { ClaudeOperation, ApiLog, ClaudeOperationDebug } from '../types';
import type { ServerLog } from '../hooks/useJacquesClient';

type LogTab = 'all' | 'server' | 'api' | 'claude';

const DEFAULT_PANEL_HEIGHT = 250;
const MIN_PANEL_HEIGHT = 60; // Minimum shows just the header
const MAX_PANEL_HEIGHT = 600;
const HEADER_HEIGHT = 40;

/**
 * Expandable text component - click to toggle between truncated and full text
 */
function ExpandableText({ text, maxLength = 200 }: { text: string; maxLength?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const needsTruncation = text.length > maxLength;

  if (!needsTruncation) {
    return <span>{text}</span>;
  }

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
      }}
      style={{
        cursor: 'pointer',
        wordBreak: 'break-word',
      }}
      title={isExpanded ? 'Click to collapse' : 'Click to expand'}
    >
      {isExpanded ? text : text.substring(0, maxLength)}
      <span style={{
        color: colors.accent,
        marginLeft: '4px',
        fontWeight: 500,
      }}>
        {isExpanded ? ' ◂ less' : '… more ▸'}
      </span>
    </span>
  );
}



interface MultiLogPanelProps {
  serverLogs: ServerLog[];
  apiLogs: ApiLog[];
  claudeOperations: ClaudeOperation[];
  maxLogs?: number;
}

/**
 * Format token count for display (e.g., 28500 -> "28.5k")
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}

/**
 * Format duration for display (e.g., 45200 -> "45.2s")
 */
function formatDuration(ms: number): string {
  if (ms >= 60000) {
    return `${(ms / 60000).toFixed(1)}m`;
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${ms}ms`;
}

/**
 * Format timestamp for display (HH:MM:SS)
 */
function formatTime(timestamp: number | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Get status indicator for HTTP status code
 */
function getStatusColor(status: number): string {
  if (status >= 500) return colors.danger;
  if (status >= 400) return colors.warning;
  if (status >= 200 && status < 300) return colors.success;
  return colors.textMuted;
}

export function MultiLogPanel({
  serverLogs,
  apiLogs,
  claudeOperations,
  maxLogs = 100,
}: MultiLogPanelProps) {
  const [activeTab, setActiveTab] = useState<LogTab>('server');
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [selectedDebug, setSelectedDebug] = useState<ClaudeOperationDebug | null>(null);
  const [loadingDebug, setLoadingDebug] = useState<string | null>(null);

  // Resizable panel state
  const [panelHeight, setPanelHeight] = usePersistedState('logPanelHeight', DEFAULT_PANEL_HEIGHT);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  // Panel is "expanded" (showing content) when height is above header height
  const isExpanded = panelHeight > HEADER_HEIGHT + 20;

  // Handle mouse move during resize
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const delta = dragStartY.current - e.clientY;
    const newHeight = Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, dragStartHeight.current + delta));
    setPanelHeight(newHeight);
  }, [isDragging]);

  // Handle mouse up to stop resizing
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add/remove mouse event listeners for resize
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Start resize drag
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartHeight.current = panelHeight;
    setIsDragging(true);
  };

  // Double-click to toggle expand/collapse
  const handleResizeDoubleClick = () => {
    if (isExpanded) {
      setPanelHeight(MIN_PANEL_HEIGHT);
    } else {
      setPanelHeight(DEFAULT_PANEL_HEIGHT);
    }
  };

  // Fetch debug data for an operation
  const fetchDebugData = async (operationId: string) => {
    setLoadingDebug(operationId);
    try {
      const response = await fetch(`${API_URL}/claude/operations/${operationId}/debug`);
      if (response.ok) {
        const data = await response.json();
        setSelectedDebug(data);
      } else {
        console.error('Failed to fetch debug data');
      }
    } catch (error) {
      console.error('Error fetching debug data:', error);
    } finally {
      setLoadingDebug(null);
    }
  };

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current && isExpanded) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [serverLogs, apiLogs, claudeOperations, autoScroll, isExpanded, activeTab]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (logContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
      setAutoScroll(isAtBottom);
    }
  };

  const recentServerLogs = serverLogs.slice(-maxLogs);
  const recentApiLogs = apiLogs.slice(-maxLogs);
  const recentClaudeOps = claudeOperations.slice(-50);

  // Count errors/warnings for badges
  const serverErrorCount = recentServerLogs.filter(l => l.level === 'error').length;
  const serverWarnCount = recentServerLogs.filter(l => l.level === 'warn').length;
  const apiErrorCount = recentApiLogs.filter(l => l.status >= 400).length;
  const claudeErrorCount = recentClaudeOps.filter(op => !op.success).length;

  const getLevelColor = (level: ServerLog['level']) => {
    switch (level) {
      case 'error': return colors.danger;
      case 'warn': return colors.warning;
      default: return colors.textMuted;
    }
  };

  const getLevelIcon = (level: ServerLog['level']) => {
    switch (level) {
      case 'error': return '✕';
      case 'warn': return '⚠';
      default: return '●';
    }
  };

  const getTabColor = (tab: LogTab): string => {
    switch (tab) {
      case 'all': return colors.textPrimary;
      case 'server': return colors.textSecondary;
      case 'api': return colors.success;
      case 'claude': return colors.accent;
    }
  };

  const getTabCount = (tab: LogTab): number => {
    switch (tab) {
      case 'all': return recentServerLogs.length + recentApiLogs.length + recentClaudeOps.length;
      case 'server': return recentServerLogs.length;
      case 'api': return recentApiLogs.length;
      case 'claude': return recentClaudeOps.length;
    }
  };

  const getTabBadge = (tab: LogTab): { count: number; color: string } | null => {
    const totalErrors = serverErrorCount + apiErrorCount + claudeErrorCount;
    switch (tab) {
      case 'all':
        if (totalErrors > 0) return { count: totalErrors, color: colors.danger };
        if (serverWarnCount > 0) return { count: serverWarnCount, color: colors.warning };
        return null;
      case 'server':
        if (serverErrorCount > 0) return { count: serverErrorCount, color: colors.danger };
        if (serverWarnCount > 0) return { count: serverWarnCount, color: colors.warning };
        return null;
      case 'api':
        if (apiErrorCount > 0) return { count: apiErrorCount, color: colors.warning };
        return null;
      case 'claude':
        if (claudeErrorCount > 0) return { count: claudeErrorCount, color: colors.danger };
        return null;
    }
  };

  const renderServerLogs = () => (
    <>
      {recentServerLogs.length === 0 ? (
        <div style={styles.emptyState}>No server logs yet</div>
      ) : (
        recentServerLogs.map((log, index) => (
          <div key={index} style={styles.logEntry}>
            <span style={styles.timestamp}>{formatTime(log.timestamp)}</span>
            <span style={{ ...styles.levelIcon, color: getLevelColor(log.level) }}>
              {getLevelIcon(log.level)}
            </span>
            <span style={styles.source}>[{log.source}]</span>
            <span style={{ ...styles.message, color: getLevelColor(log.level) }}>
              <ExpandableText text={log.message.replace(/^\[[^\]]+\]\s*/, '')} maxLength={200} />
            </span>
          </div>
        ))
      )}
    </>
  );

  const renderApiLogs = () => (
    <>
      {recentApiLogs.length === 0 ? (
        <div style={styles.emptyState}>No API requests yet</div>
      ) : (
        recentApiLogs.map((log, index) => (
          <div key={index} style={styles.logEntry}>
            <span style={styles.timestamp}>{formatTime(log.timestamp)}</span>
            <span style={{ ...styles.method, color: colors.success }}>{log.method}</span>
            <span style={styles.path}>{log.path}</span>
            <span style={{ ...styles.status, color: getStatusColor(log.status) }}>
              {log.status}
            </span>
            <span style={styles.duration}>{formatDuration(log.durationMs)}</span>
          </div>
        ))
      )}
    </>
  );

  const renderClaudeOperations = () => (
    <>
      {recentClaudeOps.length === 0 ? (
        <div style={styles.emptyState}>No Claude operations yet</div>
      ) : (
        recentClaudeOps.map((op, index) => {
          const isStart = op.phase === 'start';
          const promptEstTotal = (op.userPromptTokensEst || 0) + (op.systemPromptTokensEst || 0);
          const overhead = op.inputTokens > 0 ? op.inputTokens - promptEstTotal : 0;

          return (
            <div key={`claude-${index}`} style={styles.claudeEntry}>
              {/* Main row */}
              <div style={styles.logEntry}>
                <span style={styles.timestamp}>{formatTime(op.timestamp)}</span>
                <span style={{
                  ...styles.tag,
                  backgroundColor: isStart ? `${colors.warning}30` : `${colors.accent}30`,
                  color: isStart ? colors.warning : colors.accent,
                }}>
                  {isStart ? 'start' : 'done'}
                </span>
                <span style={{ ...styles.operation, color: colors.accent }}>{op.operation}</span>
                {isStart ? (
                  <span style={styles.tokens}>
                    est: {formatTokens(op.userPromptTokensEst || 0)} user + {formatTokens(op.systemPromptTokensEst || 0)} system = {formatTokens(promptEstTotal)}
                  </span>
                ) : (
                  <span style={styles.tokens}>
                    {formatTokens(op.inputTokens)} in → {formatTokens(op.outputTokens)} out
                    {overhead > 1000 && (
                      <span style={{ color: colors.warning, marginLeft: '8px' }}>
                        (overhead: {formatTokens(overhead)})
                      </span>
                    )}
                  </span>
                )}
                {!isStart && <span style={styles.duration}>{formatDuration(op.durationMs)}</span>}
                <span style={{
                  ...styles.statusIndicator,
                  color: op.success ? colors.success : colors.danger,
                }}>
                  {isStart ? '⋯' : (op.success ? '✓' : '✕')}
                </span>
              </div>
              {/* Details row for "start" phase */}
              {isStart && op.userPromptPreview && (
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>prompt:</span>
                  <span style={styles.detailValue}>
                    <ExpandableText text={op.userPromptPreview} maxLength={150} />
                  </span>
                </div>
              )}
              {/* Details row for "complete" phase with breakdown */}
              {!isStart && op.inputTokens > 0 && (
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>breakdown:</span>
                  <span style={styles.detailValue}>
                    user ~{formatTokens(op.userPromptTokensEst || 0)} +
                    system ~{formatTokens(op.systemPromptTokensEst || 0)} +
                    <span style={{ color: overhead > 10000 ? colors.danger : colors.warning }}>
                      claude overhead ~{formatTokens(overhead)}
                    </span>
                    {' '}= {formatTokens(op.inputTokens)} actual
                  </span>
                </div>
              )}
              {/* Tools called row for complete phase */}
              {!isStart && op.toolsCalled && op.toolsCalled.length > 0 && (
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>tools:</span>
                  <span style={styles.detailValue}>
                    {op.toolsCalled.map((tool, i) => {
                      const isNonWrite = tool !== 'Write';
                      return (
                        <span key={tool}>
                          {i > 0 && ' → '}
                          <span style={{
                            color: isNonWrite ? colors.warning : colors.success,
                            fontWeight: isNonWrite ? 600 : 400,
                          }}>
                            {tool}
                          </span>
                        </span>
                      );
                    })}
                    {op.toolsCalled.some(t => t !== 'Write') && (
                      <span style={{ color: colors.warning, marginLeft: '8px' }} title="Non-Write tools indicate prompt needs optimization">
                        ⚠ extra tools used
                      </span>
                    )}
                  </span>
                </div>
              )}
              {op.errorMessage && (
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>error:</span>
                  <span style={{ ...styles.detailValue, color: colors.danger }}>
                    <ExpandableText text={op.errorMessage} maxLength={150} />
                  </span>
                </div>
              )}
              {/* View Details button for completed operations */}
              {!isStart && (
                <div style={styles.detailRow}>
                  <button
                    style={styles.viewDetailsButton}
                    onClick={() => fetchDebugData(op.id)}
                    disabled={loadingDebug === op.id}
                  >
                    {loadingDebug === op.id ? 'Loading...' : 'View Full Details'}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );

  // Render the debug detail panel
  const renderDebugPanel = () => {
    if (!selectedDebug) return null;

    // Parse CLI events to extract useful info
    const events = selectedDebug.cliEvents || [];
    const toolUses: { name: string; inputPreview: string }[] = [];

    for (const event of events) {
      const e = event as Record<string, unknown>;
      // Look for tool uses in content blocks
      if (e.type === 'stream_event') {
        const inner = e.event as Record<string, unknown> | undefined;
        if (inner?.type === 'content_block_start') {
          const block = inner.content_block as { type?: string; name?: string; input?: unknown } | undefined;
          if (block?.type === 'tool_use' && block.name) {
            toolUses.push({
              name: block.name,
              inputPreview: JSON.stringify(block.input || {}).substring(0, 100),
            });
          }
        }
      }
    }

    return (
      <div style={styles.debugPanel}>
        <div style={styles.debugHeader}>
          <span style={styles.debugTitle}>Operation Details: {selectedDebug.operationId.substring(0, 8)}...</span>
          <button style={styles.closeButton} onClick={() => setSelectedDebug(null)}>×</button>
        </div>
        <div style={styles.debugContent}>
          {/* Summary */}
          <div style={styles.debugSection}>
            <div style={styles.debugSectionTitle}>Summary</div>
            <div style={styles.debugText}>
              CLI args: {selectedDebug.cliArgs.join(' ').substring(0, 100)}...
            </div>
            <div style={styles.debugText}>
              Events received: {events.length}
            </div>
            {toolUses.length > 0 && (
              <div style={styles.debugText}>
                Tools used: {toolUses.map(t => t.name).join(', ')}
              </div>
            )}
          </div>

          {/* User Prompt */}
          <div style={styles.debugSection}>
            <div style={styles.debugSectionTitle}>
              User Prompt ({selectedDebug.userPrompt.length} chars, ~{Math.ceil(selectedDebug.userPrompt.length / 4)} tokens est)
            </div>
            <pre style={styles.debugPre}>{selectedDebug.userPrompt}</pre>
          </div>

          {/* System Prompt */}
          <div style={styles.debugSection}>
            <div style={styles.debugSectionTitle}>
              System Prompt ({selectedDebug.systemPrompt.length} chars, ~{Math.ceil(selectedDebug.systemPrompt.length / 4)} tokens est)
            </div>
            <pre style={styles.debugPre}>{selectedDebug.systemPrompt}</pre>
          </div>

          {/* Response */}
          {selectedDebug.response && (
            <div style={styles.debugSection}>
              <div style={styles.debugSectionTitle}>
                Response ({selectedDebug.response.length} chars)
              </div>
              <pre style={styles.debugPre}>{selectedDebug.response}</pre>
            </div>
          )}

          {/* Raw Events */}
          <div style={styles.debugSection}>
            <div style={styles.debugSectionTitle}>Raw CLI Events ({events.length})</div>
            <pre style={styles.debugPre}>
              {JSON.stringify(events, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    );
  };

  // Combined view for "All" tab - merge and sort by timestamp
  const renderAllLogs = () => {
    type UnifiedLog =
      | { type: 'server'; timestamp: number; data: ServerLog }
      | { type: 'api'; timestamp: number; data: ApiLog }
      | { type: 'claude'; timestamp: number; data: ClaudeOperation };

    const allLogs: UnifiedLog[] = [
      ...recentServerLogs.map(log => ({ type: 'server' as const, timestamp: log.timestamp, data: log })),
      ...recentApiLogs.map(log => ({ type: 'api' as const, timestamp: log.timestamp, data: log })),
      ...recentClaudeOps.map(op => ({
        type: 'claude' as const,
        timestamp: new Date(op.timestamp).getTime(),
        data: op
      })),
    ].sort((a, b) => a.timestamp - b.timestamp);

    if (allLogs.length === 0) {
      return <div style={styles.emptyState}>No logs yet</div>;
    }

    return allLogs.map((log, index) => {
      if (log.type === 'server') {
        const serverLog = log.data;
        return (
          <div key={`all-server-${index}`} style={styles.logEntry}>
            <span style={styles.timestamp}>{formatTime(serverLog.timestamp)}</span>
            <span style={{ ...styles.tag, backgroundColor: `${colors.textSecondary}30`, color: colors.textSecondary }}>server</span>
            <span style={{ ...styles.levelIcon, color: getLevelColor(serverLog.level) }}>
              {getLevelIcon(serverLog.level)}
            </span>
            <span style={styles.source}>[{serverLog.source}]</span>
            <span style={{ ...styles.message, color: getLevelColor(serverLog.level) }}>
              <ExpandableText text={serverLog.message.replace(/^\[[^\]]+\]\s*/, '')} maxLength={200} />
            </span>
          </div>
        );
      } else if (log.type === 'api') {
        const apiLog = log.data;
        return (
          <div key={`all-api-${index}`} style={styles.logEntry}>
            <span style={styles.timestamp}>{formatTime(apiLog.timestamp)}</span>
            <span style={{ ...styles.tag, backgroundColor: `${colors.success}30`, color: colors.success }}>api</span>
            <span style={{ ...styles.method, color: colors.success }}>{apiLog.method}</span>
            <span style={styles.path}>{apiLog.path}</span>
            <span style={{ ...styles.status, color: getStatusColor(apiLog.status) }}>
              {apiLog.status}
            </span>
            <span style={styles.duration}>{formatDuration(apiLog.durationMs)}</span>
          </div>
        );
      } else {
        const op = log.data;
        const isStart = op.phase === 'start';
        const promptEstTotal = (op.userPromptTokensEst || 0) + (op.systemPromptTokensEst || 0);
        return (
          <div key={`all-claude-${index}`} style={styles.logEntry}>
            <span style={styles.timestamp}>{formatTime(op.timestamp)}</span>
            <span style={{
              ...styles.tag,
              backgroundColor: isStart ? `${colors.warning}30` : `${colors.accent}30`,
              color: isStart ? colors.warning : colors.accent,
            }}>
              {isStart ? 'start' : 'done'}
            </span>
            <span style={{ ...styles.operation, color: colors.accent }}>{op.operation}</span>
            {isStart ? (
              <span style={styles.tokens}>est: {formatTokens(promptEstTotal)}</span>
            ) : (
              <>
                <span style={styles.tokens}>
                  {formatTokens(op.inputTokens)} in → {formatTokens(op.outputTokens)} out
                </span>
                <span style={styles.duration}>{formatDuration(op.durationMs)}</span>
              </>
            )}
            <span style={{
              ...styles.statusIndicator,
              color: op.success ? colors.success : colors.danger,
            }}>
              {isStart ? '⋯' : (op.success ? '✓' : '✕')}
            </span>
          </div>
        );
      }
    });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'all': return renderAllLogs();
      case 'server': return renderServerLogs();
      case 'api': return renderApiLogs();
      case 'claude': return renderClaudeOperations();
    }
  };

  const toggleExpanded = () => {
    if (isExpanded) {
      setPanelHeight(MIN_PANEL_HEIGHT);
    } else {
      setPanelHeight(DEFAULT_PANEL_HEIGHT);
    }
  };

  return (
    <div style={{
      ...styles.container,
      height: panelHeight,
    }}>
      {/* Resize handle - always visible */}
      <div
        style={{
          ...styles.resizeHandle,
          backgroundColor: isDragging ? `${colors.accent}30` : undefined,
        }}
        onMouseDown={handleResizeStart}
        onDoubleClick={handleResizeDoubleClick}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${colors.accent}20`; }}
        onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.backgroundColor = 'transparent'; }}
        title="Drag to resize, double-click to toggle"
      >
        {/* Visual grip indicator */}
        <div style={styles.resizeGrip}>
          <div style={styles.resizeGripBar} />
          <div style={styles.resizeGripBar} />
        </div>
      </div>
        {/* Header / Tab Bar - entire bar is clickable */}
        <div
          style={styles.header}
          onClick={toggleExpanded}
        >
          <div style={styles.tabs} onClick={(e) => e.stopPropagation()}>
            {(['all', 'server', 'api', 'claude'] as LogTab[]).map((tab) => {
              const isActive = activeTab === tab;
              const badge = getTabBadge(tab);
              return (
                <button
                  key={tab}
                  style={{
                    ...styles.tab,
                    ...(isActive && {
                      backgroundColor: colors.bgElevated,
                      color: getTabColor(tab),
                      borderBottom: `2px solid ${getTabColor(tab)}`,
                    }),
                  }}
                  onClick={() => setActiveTab(tab)}
                >
                  <span style={{
                    color: isActive ? getTabColor(tab) : colors.textSecondary,
                    textTransform: 'capitalize',
                  }}>
                    {tab}
                  </span>
                  {!isExpanded && (
                    <span style={styles.tabCount}>({getTabCount(tab)})</span>
                  )}
                  {badge && (
                    <span style={{
                      ...styles.badge,
                      backgroundColor: `${badge.color}30`,
                      color: badge.color,
                    }}>
                      {badge.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div style={styles.expandArea}>
            <span style={styles.expandText}>
              {isExpanded ? '▾ collapse' : '▴ expand'}
            </span>
          </div>
        </div>

        {/* Log Content */}
        {isExpanded && (
          <div
            ref={logContainerRef}
            style={styles.logContainer}
            onScroll={handleScroll}
          >
            {renderContent()}
          </div>
        )}

        {/* Auto-scroll indicator */}
        {isExpanded && !autoScroll && (
          <button
            style={styles.scrollButton}
            onClick={() => {
              setAutoScroll(true);
              if (logContainerRef.current) {
                logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
              }
            }}
          >
            ↓ Scroll to bottom
          </button>
        )}

        {/* Debug detail panel */}
        {selectedDebug && renderDebugPanel()}
      </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: colors.bgSecondary,
    borderTop: `2px solid ${colors.borderSubtle}`,
    boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'height 150ms ease',
  },
  resizeHandle: {
    position: 'absolute',
    top: -8,
    left: 0,
    right: 0,
    height: '16px',
    cursor: 'row-resize',
    backgroundColor: 'transparent',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 150ms ease',
  },
  resizeGrip: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '4px 30px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '4px 4px 0 0',
    border: `1px solid ${colors.borderSubtle}`,
    borderBottom: 'none',
  },
  resizeGripBar: {
    width: '50px',
    height: '3px',
    backgroundColor: colors.textMuted,
    borderRadius: '2px',
    opacity: 0.6,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
    cursor: 'pointer',
    userSelect: 'none',
  },
  tabs: {
    display: 'flex',
    gap: '0',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    color: colors.textSecondary,
    transition: 'all 150ms ease',
  },
  tabCount: {
    fontSize: '11px',
    color: colors.textMuted,
  },
  badge: {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '8px',
    fontWeight: 600,
  },
  expandArea: {
    flex: 1,
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '8px 0',
  },
  expandText: {
    fontSize: '11px',
    color: colors.textMuted,
  },
  logContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 16px',
    fontFamily: 'monospace',
    fontSize: '12px',
    backgroundColor: colors.bgPrimary,
    minHeight: 0,
  },
  tag: {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '4px',
    fontWeight: 500,
    flexShrink: 0,
  },
  emptyState: {
    color: colors.textMuted,
    textAlign: 'center',
    padding: '16px',
  },
  logEntry: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '2px 0',
    lineHeight: 1.4,
  },
  timestamp: {
    color: colors.textMuted,
    flexShrink: 0,
    minWidth: '70px',
  },
  levelIcon: {
    flexShrink: 0,
    width: '12px',
    textAlign: 'center',
  },
  source: {
    color: colors.textSecondary,
    flexShrink: 0,
  },
  message: {
    color: colors.textPrimary,
    wordBreak: 'break-word',
  },
  // API log styles
  method: {
    flexShrink: 0,
    fontWeight: 600,
    minWidth: '48px',
  },
  path: {
    color: colors.textPrimary,
    flexGrow: 1,
    wordBreak: 'break-word',
  },
  status: {
    flexShrink: 0,
    fontWeight: 500,
    minWidth: '32px',
    textAlign: 'right',
  },
  duration: {
    color: colors.textMuted,
    flexShrink: 0,
    minWidth: '50px',
    textAlign: 'right',
  },
  // Claude operation styles
  operation: {
    flexShrink: 0,
    fontWeight: 500,
    minWidth: '90px',
  },
  tokens: {
    color: colors.textSecondary,
    flexShrink: 0,
    minWidth: '140px',
  },
  statusIndicator: {
    flexShrink: 0,
    fontWeight: 600,
    width: '16px',
    textAlign: 'center',
  },
  errorMessage: {
    color: colors.danger,
    fontSize: '11px',
    marginLeft: '8px',
  },
  claudeEntry: {
    marginBottom: '4px',
    paddingBottom: '4px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  detailRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    paddingLeft: '78px', // Align with timestamp
    fontSize: '11px',
    marginTop: '2px',
  },
  detailLabel: {
    color: colors.textMuted,
    flexShrink: 0,
    minWidth: '70px',
  },
  detailValue: {
    color: colors.textSecondary,
    wordBreak: 'break-word',
    fontFamily: 'monospace',
  },
  scrollButton: {
    position: 'absolute',
    bottom: '60px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '4px 12px',
    fontSize: '11px',
    backgroundColor: colors.accent,
    color: colors.textPrimary,
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    zIndex: 11,
  },
  viewDetailsButton: {
    padding: '4px 8px',
    fontSize: '11px',
    backgroundColor: colors.bgElevated,
    color: colors.accent,
    border: `1px solid ${colors.accent}`,
    borderRadius: '4px',
    cursor: 'pointer',
  },
  debugPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgPrimary,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1002,
  },
  debugHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    backgroundColor: colors.bgSecondary,
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  debugTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.accent,
  },
  closeButton: {
    padding: '4px 8px',
    fontSize: '16px',
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    border: 'none',
    cursor: 'pointer',
  },
  debugContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },
  debugSection: {
    marginBottom: '16px',
  },
  debugSectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: colors.textSecondary,
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  debugText: {
    fontSize: '12px',
    color: colors.textPrimary,
    marginBottom: '4px',
  },
  debugPre: {
    fontFamily: 'monospace',
    fontSize: '11px',
    backgroundColor: colors.bgSecondary,
    padding: '12px',
    borderRadius: '4px',
    color: colors.textPrimary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '300px',
    overflowY: 'auto',
    margin: 0,
  },
};

export default MultiLogPanel;
