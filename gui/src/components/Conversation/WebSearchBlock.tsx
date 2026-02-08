import { useState } from 'react';
import { Search, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import type { WebSearchContent } from '../../types';
import { colors } from '../../styles/theme';

interface WebSearchBlockProps {
  content: WebSearchContent;
}

export function WebSearchBlock({ content }: WebSearchBlockProps) {
  const [showUrls, setShowUrls] = useState(false);
  const isResults = content.searchType === 'results';
  const label = isResults
    ? `${content.resultCount || 0} results`
    : 'Searching...';
  const hasUrls = content.urls && content.urls.length > 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>
          {isResults ? <FileText size={14} /> : <Search size={14} />}
        </span>
        <span style={styles.label}>Web Search</span>
        {content.query && (
          <span style={styles.query}>"{content.query}"</span>
        )}
        <span style={styles.status}>{label}</span>
        {hasUrls && (
          <button
            type="button"
            style={styles.toggleButton}
            onClick={() => setShowUrls(!showUrls)}
          >
            <span style={styles.toggleIcon}>
              {showUrls ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            {showUrls ? 'Hide URLs' : 'Show URLs'}
          </button>
        )}
      </div>
      {showUrls && content.urls && (
        <div className="jacques-expand-content" style={styles.urlList}>
          {content.urls.map((item, idx) => (
            <a
              key={idx}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.urlItem}
              title={item.url}
            >
              <span style={styles.urlNumber}>{idx + 1}.</span>
              <span style={styles.urlTitle}>{item.title}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: colors.bgElevated,
    borderRadius: '6px',
    border: `1px solid ${colors.borderSubtle}`,
    marginTop: '8px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    color: colors.textMuted,
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: colors.textMuted,
  },
  query: {
    fontSize: '12px',
    color: colors.textSecondary,
    fontStyle: 'italic' as const,
    flex: 1,
    minWidth: '100px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  status: {
    fontSize: '11px',
    color: colors.textMuted,
    backgroundColor: colors.bgSecondary,
    padding: '2px 6px',
    borderRadius: '3px',
  },
  toggleButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    backgroundColor: 'transparent',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '4px',
    color: colors.accent,
    fontSize: '11px',
    cursor: 'pointer',
  },
  toggleIcon: {
    display: 'inline-flex',
    alignItems: 'center',
  },
  urlList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    marginTop: '4px',
    paddingTop: '8px',
    borderTop: `1px solid ${colors.borderSubtle}`,
    maxHeight: '200px',
    overflow: 'auto',
  },
  urlItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 8px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '4px',
    color: colors.textSecondary,
    textDecoration: 'none',
    fontSize: '12px',
    transition: 'background-color 150ms ease',
  },
  urlNumber: {
    fontSize: '11px',
    color: colors.textMuted,
    minWidth: '16px',
  },
  urlTitle: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
};
