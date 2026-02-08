import React from 'react';
import { FileText, Compass, Globe, ScrollText, CheckCircle2 } from 'lucide-react';
import { colors, typography } from '../styles/theme';
import type { Artifact, ArtifactType } from './ArtifactViewer';
import type { SessionTaskSummary } from '../api';

interface ArtifactColumn {
  type: ArtifactType;
  label: string;
  icon: typeof FileText;
  color: string;
  items: Artifact[];
}

interface ArtifactGridProps {
  plans: Artifact[];
  explorations: Artifact[];
  handoffs: Artifact[];
  webSearches: Artifact[];
  onSelectArtifact: (artifact: Artifact) => void;
  selectedIds: Set<string>;
  searchQuery: string;
  taskSummaries?: Map<string, SessionTaskSummary>;
}

const columns: Omit<ArtifactColumn, 'items'>[] = [
  { type: 'plan', label: 'Plans', icon: FileText, color: '#34D399' },
  { type: 'exploration', label: 'Explorations', icon: Compass, color: colors.accent },
  { type: 'handoff', label: 'Handoffs', icon: ScrollText, color: '#F59E0B' },
  { type: 'web-search', label: 'Web Searches', icon: Globe, color: '#60A5FA' },
];

function filterByQuery(items: Artifact[], query: string): Artifact[] {
  if (!query.trim()) return items;
  const q = query.toLowerCase();
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.content.toLowerCase().includes(q)
  );
}

export function ArtifactGrid({
  plans,
  explorations,
  handoffs,
  webSearches,
  onSelectArtifact,
  selectedIds,
  searchQuery,
  taskSummaries,
}: ArtifactGridProps) {
  const columnData: ArtifactColumn[] = [
    { ...columns[0], items: filterByQuery(plans, searchQuery) },
    { ...columns[1], items: filterByQuery(explorations, searchQuery) },
    { ...columns[2], items: filterByQuery(handoffs, searchQuery) },
    { ...columns[3], items: filterByQuery(webSearches, searchQuery) },
  ];

  // Filter out empty columns
  const visibleColumns = columnData.filter((col) => col.items.length > 0);

  if (visibleColumns.length === 0) {
    return (
      <div style={styles.emptyGrid}>
        <p style={styles.emptyText}>
          {searchQuery ? 'No artifacts match your search' : 'No artifacts found'}
        </p>
        <p style={styles.emptyHint}>
          {searchQuery
            ? 'Try a different search term'
            : 'Plans, explorations, and web searches from your sessions will appear here'}
        </p>
      </div>
    );
  }

  return (
    <div
      className="jacques-artifact-grid"
      style={{
        ...styles.grid,
        gridTemplateColumns: `repeat(${Math.min(visibleColumns.length, 4)}, 1fr)`,
      }}
    >
      {visibleColumns.map((column) => (
        <div key={column.type} style={styles.column}>
          {/* Column header */}
          <div style={styles.columnHeader}>
            <div style={{ ...styles.columnIcon, backgroundColor: `${column.color}15` }}>
              <column.icon size={14} style={{ color: column.color }} />
            </div>
            <span style={styles.columnLabel}>{column.label}</span>
            <span style={styles.columnCount}>{column.items.length}</span>
          </div>

          {/* Column items */}
          <div style={styles.columnItems}>
            {column.items.map((item) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <button
                  key={item.id}
                  className="jacques-artifact-item"
                  style={{
                    ...styles.item,
                    backgroundColor: isSelected ? `${column.color}10` : 'transparent',
                    borderColor: isSelected ? `${column.color}40` : colors.borderSubtle,
                  }}
                  onClick={() => onSelectArtifact(item)}
                  title={item.title}
                >
                  <span style={styles.itemTitle}>{item.title}</span>
                  <div style={styles.itemMeta}>
                    {item.type === 'plan' && taskSummaries?.get(item.id) && (() => {
                      const summary = taskSummaries.get(item.id)!;
                      const done = summary.percentage === 100;
                      const progressColor = done ? colors.success : '#34D399';
                      return (
                        <span style={{ ...styles.progressBadge, backgroundColor: `${progressColor}15`, color: progressColor }}>
                          <CheckCircle2 size={9} />
                          <span>{summary.completed}/{summary.total}</span>
                        </span>
                      );
                    })()}
                    {item.timestamp && (
                      <span style={styles.itemTime}>
                        {formatRelativeTime(item.timestamp)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gap: '16px',
    minHeight: '200px',
  },
  emptyGrid: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '8px',
    border: `1px dashed ${colors.borderSubtle}`,
  },
  emptyText: {
    margin: 0,
    fontSize: '14px',
    color: colors.textSecondary,
  },
  emptyHint: {
    margin: '8px 0 0',
    fontSize: '12px',
    color: colors.textMuted,
    textAlign: 'center',
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: colors.bgSecondary,
    borderRadius: '8px',
    border: `1px solid ${colors.borderSubtle}`,
    overflow: 'hidden',
  },
  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
  },
  columnIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '6px',
  },
  columnLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: colors.textPrimary,
    flex: 1,
  },
  columnCount: {
    fontSize: '11px',
    fontWeight: 500,
    color: colors.textMuted,
    backgroundColor: colors.bgSecondary,
    padding: '2px 8px',
    borderRadius: '10px',
    fontFamily: typography.fontFamily.mono,
  },
  columnItems: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '8px',
    gap: '4px',
    overflowY: 'auto',
    maxHeight: '280px',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '4px',
    padding: '10px 12px',
    backgroundColor: 'transparent',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 150ms ease',
    width: '100%',
  },
  itemTitle: {
    fontSize: '12px',
    fontWeight: 500,
    color: colors.textPrimary,
    lineHeight: 1.3,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    width: '100%',
  },
  itemMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  progressBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '9px',
    fontWeight: 600,
    padding: '2px 5px',
    borderRadius: '3px',
    fontFamily: typography.fontFamily.mono,
  },
  itemTime: {
    fontSize: '10px',
    color: colors.textMuted,
    fontFamily: typography.fontFamily.mono,
  },
};
