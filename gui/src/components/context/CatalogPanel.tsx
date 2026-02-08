/**
 * CatalogPanel - Minimal context catalog sidebar
 *
 * Clean, monochrome design that matches the rest of the app.
 * No colored accents except coral for primary actions.
 */

import { useState } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronRightIcon,
  Plus,
  FileCode,
  GitBranch,
  History,
  Loader,
  Layers,
} from 'lucide-react';
import { colors } from '../../styles/theme';
import type { ProjectCatalog, CatalogItem, CatalogPlanEntry, CatalogSessionEntry } from '../../types';

// ─── Props ────────────────────────────────────────────────────

interface CatalogPanelProps {
  catalog: ProjectCatalog | null;
  loading: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onItemClick: (type: 'context' | 'plan' | 'session', item: CatalogItem | CatalogPlanEntry | CatalogSessionEntry) => void;
  onAddContext: () => void;
}

// ─── Component ────────────────────────────────────────────────

export function CatalogPanel({
  catalog,
  loading,
  collapsed,
  onToggleCollapse,
  onItemClick,
  onAddContext,
}: CatalogPanelProps) {
  const [search, setSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    context: true,
    plans: true,
    sessions: false,
  });

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Filter items by search
  const filterText = search.toLowerCase();
  const contextItems = catalog?.context.filter(f =>
    f.name.toLowerCase().includes(filterText) ||
    f.description?.toLowerCase().includes(filterText)
  ) ?? [];
  const planItems = catalog?.plans.filter(p =>
    p.title.toLowerCase().includes(filterText)
  ) ?? [];
  const sessionItems = catalog?.sessions.filter(s =>
    s.title.toLowerCase().includes(filterText)
  ) ?? [];

  const totalItems = contextItems.length + planItems.length + sessionItems.length;

  // Collapsed state
  if (collapsed) {
    return (
      <div style={styles.collapsedContainer}>
        <button
          style={styles.expandBtn}
          onClick={onToggleCollapse}
          title="Expand"
        >
          <ChevronRightIcon size={14} />
        </button>
        <div style={styles.collapsedIcons}>
          <CollapsedIcon icon={<FileCode size={15} />} count={contextItems.length} />
          <CollapsedIcon icon={<GitBranch size={15} />} count={planItems.length} />
          <CollapsedIcon icon={<History size={15} />} count={sessionItems.length} />
        </div>
        <button style={styles.collapsedAddBtn} onClick={onAddContext} title="New context">
          <Plus size={16} strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Layers size={14} color={colors.accent} strokeWidth={2} />
          <span style={styles.headerTitle}>Context</span>
        </div>
        <button style={styles.collapseBtn} onClick={onToggleCollapse} title="Collapse">
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* Search */}
      <div style={styles.searchWrap}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="filter..."
          style={styles.searchInput}
        />
        {search && <span style={styles.searchCount}>{totalItems}</span>}
      </div>

      {/* Sections */}
      <div style={styles.sections}>
        {/* Files */}
        <Section
          icon={<FileCode size={13} />}
          label="Files"
          count={contextItems.length}
          expanded={expandedSections.context}
          onToggle={() => toggleSection('context')}
        >
          {loading && contextItems.length === 0 ? (
            <LoadingRow />
          ) : contextItems.length === 0 ? (
            <EmptyRow text="No context files" />
          ) : (
            contextItems.map(file => (
              <ItemRow
                key={file.id}
                label={file.name}
                meta={file.source}
                onClick={() => onItemClick('context', file)}
              />
            ))
          )}
        </Section>

        {/* Plans */}
        <Section
          icon={<GitBranch size={13} />}
          label="Plans"
          count={planItems.length}
          expanded={expandedSections.plans}
          onToggle={() => toggleSection('plans')}
        >
          {planItems.length === 0 ? (
            <EmptyRow text="No plans" />
          ) : (
            planItems.map(plan => (
              <ItemRow
                key={plan.id}
                label={plan.title}
                meta={plan.sessions.length > 0 ? `${plan.sessions.length}` : undefined}
                onClick={() => onItemClick('plan', plan)}
              />
            ))
          )}
        </Section>

        {/* Sessions */}
        <Section
          icon={<History size={13} />}
          label="Sessions"
          count={sessionItems.length}
          expanded={expandedSections.sessions}
          onToggle={() => toggleSection('sessions')}
        >
          {sessionItems.length === 0 ? (
            <EmptyRow text="No saved sessions" />
          ) : (
            sessionItems.map(session => (
              <ItemRow
                key={session.id}
                label={session.title}
                meta={`${session.messageCount}`}
                onClick={() => onItemClick('session', session)}
              />
            ))
          )}
        </Section>
      </div>

      {/* Add Button */}
      <div style={styles.footer}>
        <button style={styles.addButton} onClick={onAddContext}>
          <Plus size={14} strokeWidth={2.5} />
          <span>New Context</span>
        </button>
      </div>
    </div>
  );
}

// ─── Collapsed Icon ───────────────────────────────────────────

function CollapsedIcon({ icon, count }: { icon: React.ReactNode; count: number }) {
  return (
    <div style={styles.collapsedIcon}>
      <span style={{ color: colors.textMuted }}>{icon}</span>
      {count > 0 && <span style={styles.collapsedCount}>{count}</span>}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────

function Section({
  icon,
  label,
  count,
  expanded,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.section}>
      <button style={styles.sectionHeader} onClick={onToggle}>
        <span style={styles.sectionChevron}>
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
        <span style={styles.sectionIcon}>{icon}</span>
        <span style={styles.sectionLabel}>{label}</span>
        <span style={styles.sectionCount}>{count}</span>
      </button>
      {expanded && (
        <div style={styles.sectionContent}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Item Row ─────────────────────────────────────────────────

function ItemRow({
  label,
  meta,
  onClick,
}: {
  label: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button style={styles.itemRow} onClick={onClick}>
      <FileText size={12} color={colors.textMuted} />
      <span style={styles.itemLabel}>{label}</span>
      {meta && <span style={styles.itemMeta}>{meta}</span>}
    </button>
  );
}

// ─── Empty / Loading ──────────────────────────────────────────

function EmptyRow({ text }: { text: string }) {
  return <div style={styles.emptyRow}>{text}</div>;
}

function LoadingRow() {
  return (
    <div style={styles.loadingRow}>
      <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} />
      <span>Loading...</span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '240px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRight: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgSecondary,
    height: '100%',
    overflow: 'hidden',
  },
  collapsedContainer: {
    width: '52px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    borderRight: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgSecondary,
    height: '100%',
    paddingTop: '14px',
  },
  expandBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: colors.textMuted,
    cursor: 'pointer',
  },
  collapsedIcons: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
    paddingTop: '24px',
    flex: 1,
  },
  collapsedIcon: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  collapsedCount: {
    fontSize: '10px',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 500,
    color: colors.textMuted,
  },
  collapsedAddBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    marginBottom: '16px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: colors.accent,
    color: '#000',
    cursor: 'pointer',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 14px 14px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  headerTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.textPrimary,
    letterSpacing: '-0.01em',
  },
  collapseBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: colors.textMuted,
    cursor: 'pointer',
  },
  searchWrap: {
    position: 'relative',
    padding: '12px 12px 8px',
  },
  searchInput: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', monospace",
    backgroundColor: colors.bgPrimary,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    color: colors.textPrimary,
    outline: 'none',
  },
  searchCount: {
    position: 'absolute',
    right: '22px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '10px',
    color: colors.accent,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
  },
  sections: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 0 16px',
  },
  section: {
    marginBottom: '20px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    padding: '6px 14px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  sectionChevron: {
    display: 'inline-flex',
    alignItems: 'center',
    color: colors.textMuted,
  },
  sectionIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    color: colors.textMuted,
  },
  sectionLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: colors.textSecondary,
  },
  sectionCount: {
    marginLeft: 'auto',
    fontSize: '11px',
    fontFamily: "'JetBrains Mono', monospace",
    color: colors.textMuted,
  },
  sectionContent: {
    marginTop: '4px',
    marginLeft: '22px',
    paddingLeft: '12px',
    borderLeft: `1px solid ${colors.borderSubtle}`,
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '8px 10px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: colors.textPrimary,
    cursor: 'pointer',
    fontSize: '12px',
    textAlign: 'left' as const,
    transition: 'background-color 100ms ease',
  },
  itemLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontSize: '12px',
  },
  itemMeta: {
    fontSize: '10px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', monospace",
  },
  emptyRow: {
    padding: '10px',
    fontSize: '11px',
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px',
    fontSize: '11px',
    color: colors.textMuted,
  },
  footer: {
    padding: '12px 14px 16px',
    borderTop: `1px solid ${colors.borderSubtle}`,
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '11px 16px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: colors.accent,
    color: '#000',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    transition: 'opacity 150ms ease',
  },
};
