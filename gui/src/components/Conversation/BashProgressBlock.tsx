import { useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { Terminal } from 'lucide-react';
import type { BashProgressContent } from '../../types';
import { colors } from '../../styles/theme';
import { CollapsibleBlock, type CollapsibleBlockRef } from './CollapsibleBlock';

interface BashProgressBlockProps {
  content: BashProgressContent;
  expanded?: boolean;
}

export interface BashProgressBlockRef {
  expand: () => void;
  scrollIntoView: () => void;
}

export const BashProgressBlock = forwardRef<BashProgressBlockRef, BashProgressBlockProps>(function BashProgressBlock({ content, expanded = false }, ref) {
  const [forceExpanded, setForceExpanded] = useState(false);
  const collapsibleRef = useRef<CollapsibleBlockRef>(null);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    expand: () => {
      setForceExpanded(true);
      collapsibleRef.current?.expand();
    },
    scrollIntoView: () => {
      collapsibleRef.current?.scrollIntoView();
    },
  }));

  const elapsed = content.elapsedSeconds
    ? `${content.elapsedSeconds}s`
    : '';
  const lines = content.totalLines !== undefined
    ? `${content.totalLines} lines`
    : '';
  const summary = [elapsed, lines].filter(Boolean).join(' • ') || 'Running...';

  const displayOutput = content.fullOutput || content.output || '';
  const hasOutput = displayOutput.length > 0;

  return (
    <CollapsibleBlock
      ref={collapsibleRef}
      title="Bash Output"
      icon={<Terminal size={14} />}
      summary={summary}
      defaultExpanded={expanded}
      forceExpanded={forceExpanded}
    >
      <div style={styles.container}>
        {hasOutput ? (
          <pre style={styles.output}>{displayOutput}</pre>
        ) : (
          <span style={styles.empty}>No output</span>
        )}
      </div>
    </CollapsibleBlock>
  );
});

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxHeight: '300px',
    overflow: 'auto',
  },
  output: {
    margin: 0,
    padding: '8px',
    backgroundColor: colors.bgPrimary,
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'monospace',
    color: colors.textSecondary,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
  },
  empty: {
    fontSize: '12px',
    color: colors.textMuted,
    fontStyle: 'italic' as const,
  },
};
