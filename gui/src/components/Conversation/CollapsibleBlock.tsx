import { useState, useEffect, useRef, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { colors } from '../../styles/theme';

interface CollapsibleBlockProps {
  title: string;
  icon?: ReactNode;
  summary?: string;
  defaultExpanded?: boolean;
  /** Force expand state (controlled mode) */
  forceExpanded?: boolean;
  /** Custom styles for the header */
  headerStyle?: React.CSSProperties;
  children: ReactNode;
}

export interface CollapsibleBlockRef {
  expand: () => void;
  scrollIntoView: () => void;
}

export const CollapsibleBlock = forwardRef<CollapsibleBlockRef, CollapsibleBlockProps>(function CollapsibleBlock({
  title,
  icon,
  summary,
  defaultExpanded = false,
  forceExpanded,
  headerStyle,
  children,
}, ref) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle force expanded from parent
  useEffect(() => {
    if (forceExpanded) {
      setIsExpanded(true);
    }
  }, [forceExpanded]);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    expand: () => setIsExpanded(true),
    scrollIntoView: () => {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  }));

  const defaultIcon = <ChevronRight size={14} />;

  return (
    <div ref={containerRef} style={styles.container}>
      <button
        style={{ ...styles.header, ...headerStyle }}
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <span style={{
          ...styles.icon,
          transform: isExpanded ? 'rotate(90deg)' : 'none',
        }}>
          {icon || defaultIcon}
        </span>
        <span style={styles.title}>{title}</span>
        {!isExpanded && summary && (
          <span style={styles.summary}>{summary}</span>
        )}
      </button>
      {isExpanded && (
        <div className="jacques-expand-content" style={styles.content}>
          {children}
        </div>
      )}
    </div>
  );
});

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderRadius: '6px',
    border: `1px solid ${colors.borderSubtle}`,
    overflow: 'hidden',
    marginTop: '12px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '10px 12px',
    minHeight: '44px',
    backgroundColor: colors.bgElevated,
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    color: colors.textSecondary,
    fontSize: '13px',
    transition: 'background-color 150ms ease',
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 150ms ease',
    flexShrink: 0,
  },
  title: {
    fontWeight: 500,
  },
  summary: {
    marginLeft: 'auto',
    fontSize: '12px',
    color: colors.textMuted,
  },
  content: {
    padding: '12px',
    backgroundColor: colors.bgInput,
    borderTop: `1px solid ${colors.borderSubtle}`,
  },
};
