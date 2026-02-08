import React, { useState } from 'react';
import { FileText, Compass, Search, Globe, ScrollText, CheckCircle2 } from 'lucide-react';
import { colors, typography } from '../styles/theme';
import type { Artifact, ArtifactType } from './ArtifactViewer';
import type { SessionTaskSummary } from '../api';

interface ArtifactListProps {
  plans: Artifact[];
  explorations: Artifact[];
  handoffs: Artifact[];
  webSearches: Artifact[];
  onSelectArtifact: (artifact: Artifact) => void;
  selectedIds: Set<string>;
  searchQuery: string;
  taskSummaries?: Map<string, SessionTaskSummary>;
}

type FilterType = 'all' | ArtifactType;

const typeConfig: Record<ArtifactType, { icon: typeof FileText; label: string; color: string }> = {
  plan: { icon: FileText, label: 'Plan', color: '#34D399' },
  exploration: { icon: Compass, label: 'Explore', color: colors.accent },
  research: { icon: Search, label: 'Research', color: '#A78BFA' },
  'web-search': { icon: Globe, label: 'Web', color: '#60A5FA' },
  handoff: { icon: ScrollText, label: 'Handoff', color: '#F59E0B' },
};

const filters: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'plan', label: 'Plans' },
  { key: 'exploration', label: 'Explorations' },
  { key: 'handoff', label: 'Handoffs' },
  { key: 'web-search', label: 'Web Searches' },
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

export function ArtifactList({
  plans,
  explorations,
  handoffs,
  webSearches,
  onSelectArtifact,
  selectedIds,
  searchQuery,
  taskSummaries,
}: ArtifactListProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Combine all artifacts and sort by timestamp
  const allArtifacts: Artifact[] = [
    ...filterByQuery(plans, searchQuery),
    ...filterByQuery(explorations, searchQuery),
    ...filterByQuery(handoffs, searchQuery),
    ...filterByQuery(webSearches, searchQuery),
  ].sort((a, b) => {
    if (!a.timestamp || !b.timestamp) return 0;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  // Filter by active type
  const filteredArtifacts =
    activeFilter === 'all'
      ? allArtifacts
      : allArtifacts.filter((a) => a.type === activeFilter);

  // Count items per type
  const counts: Record<FilterType, number> = {
    all: allArtifacts.length,
    plan: filterByQuery(plans, searchQuery).length,
    exploration: filterByQuery(explorations, searchQuery).length,
    handoff: filterByQuery(handoffs, searchQuery).length,
    research: 0,
    'web-search': filterByQuery(webSearches, searchQuery).length,
  };

  return (
    <div style={styles.container}>
      {/* Filter tabs */}
      <div style={styles.filterBar}>
        {filters.map((filter) => {
          const isActive = activeFilter === filter.key;
          const count = counts[filter.key];
          return (
            <button
              key={filter.key}
              style={{
                ...styles.filterTab,
                backgroundColor: isActive ? colors.bgElevated : 'transparent',
                color: isActive ? colors.textPrimary : colors.textMuted,
                borderColor: isActive ? colors.accent : 'transparent',
              }}
              onClick={() => setActiveFilter(filter.key)}
            >
              <span>{filter.label}</span>
              {count > 0 && (
                <span
                  style={{
                    ...styles.filterCount,
                    backgroundColor: isActive ? colors.accent : colors.bgElevated,
                    color: isActive ? '#fff' : colors.textMuted,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Items list */}
      <div style={styles.list}>
        {filteredArtifacts.length === 0 ? (
          <div style={styles.emptyList}>
            <p style={styles.emptyText}>
              {searchQuery ? 'No artifacts match your search' : 'No artifacts in this category'}
            </p>
          </div>
        ) : (
          filteredArtifacts.map((item) => {
            const config = typeConfig[item.type];
            const Icon = config.icon;
            const isSelected = selectedIds.has(item.id);

            return (
              <button
                key={item.id}
                className="jacques-artifact-item"
                style={{
                  ...styles.listItem,
                  backgroundColor: isSelected ? `${config.color}08` : 'transparent',
                  borderLeftColor: isSelected ? config.color : 'transparent',
                }}
                onClick={() => onSelectArtifact(item)}
              >
                <div style={styles.itemLeft}>
                  <div
                    style={{
                      ...styles.itemIcon,
                      backgroundColor: `${config.color}15`,
                      color: config.color,
                    }}
                  >
                    <Icon size={12} />
                  </div>
                  <div style={styles.itemContent}>
                    <span style={styles.itemTitle}>{item.title}</span>
                    {item.timestamp && (
                      <span style={styles.itemTime}>
                        {formatDateTime(item.timestamp)}
                      </span>
                    )}
                  </div>
                </div>
                {item.type === 'plan' && taskSummaries?.get(item.id) && (() => {
                  const summary = taskSummaries.get(item.id)!;
                  const done = summary.percentage === 100;
                  const progressColor = done ? colors.success : '#34D399';
                  return (
                    <div style={{ ...styles.progressBadge, backgroundColor: `${progressColor}15`, color: progressColor }}>
                      <CheckCircle2 size={10} />
                      <span>{summary.completed}/{summary.total}</span>
                    </div>
                  );
                })()}
                <div
                  style={{
                    ...styles.typeBadge,
                    backgroundColor: `${config.color}15`,
                    color: config.color,
                  }}
                >
                  {config.label}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: colors.bgSecondary,
    borderRadius: '8px',
    border: `1px solid ${colors.borderSubtle}`,
    overflow: 'hidden',
  },
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '10px 12px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgSecondary,
    overflowX: 'auto',
  },
  filterTab: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '6px',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    whiteSpace: 'nowrap',
  },
  filterCount: {
    fontSize: '10px',
    fontWeight: 500,
    padding: '2px 6px',
    borderRadius: '8px',
    fontFamily: typography.fontFamily.mono,
  },
  list: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    maxHeight: '320px',
  },
  emptyList: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
  },
  emptyText: {
    margin: 0,
    fontSize: '13px',
    color: colors.textMuted,
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    borderLeft: '3px solid transparent',
    borderBottom: `1px solid ${colors.borderSubtle}`,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 150ms ease',
    width: '100%',
  },
  itemLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: 0,
    flex: 1,
  },
  itemIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    flexShrink: 0,
  },
  itemContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    minWidth: 0,
    flex: 1,
  },
  itemTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: colors.textPrimary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemTime: {
    fontSize: '11px',
    color: colors.textMuted,
    fontFamily: typography.fontFamily.mono,
  },
  progressBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    fontWeight: 600,
    padding: '3px 7px',
    borderRadius: '4px',
    flexShrink: 0,
    fontFamily: typography.fontFamily.mono,
  },
  typeBadge: {
    fontSize: '10px',
    fontWeight: 500,
    padding: '4px 8px',
    borderRadius: '4px',
    flexShrink: 0,
  },
};
