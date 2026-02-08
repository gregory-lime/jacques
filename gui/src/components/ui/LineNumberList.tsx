import type { ReactNode } from 'react';
import { colors } from '../../styles/theme';

interface LineNumberListProps {
  items: ReactNode[];
  onItemClick?: (index: number) => void;
  selectedIndex?: number;
  startNumber?: number;
}

export function LineNumberList({
  items,
  onItemClick,
  selectedIndex,
  startNumber = 1,
}: LineNumberListProps) {
  return (
    <div style={styles.container}>
      {items.map((item, i) => {
        const lineNum = startNumber + i;
        const isSelected = selectedIndex === i;

        return (
          <div
            key={i}
            style={{
              ...styles.row,
              ...(isSelected ? styles.rowSelected : {}),
              cursor: onItemClick ? 'pointer' : 'default',
            }}
            onClick={() => onItemClick?.(i)}
          >
            <span style={styles.lineNumber}>{lineNum}</span>
            <div style={styles.content}>{item}</div>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    transition: 'background-color 150ms ease',
    borderRadius: '4px',
  },
  rowSelected: {
    backgroundColor: colors.bgElevated,
  },
  lineNumber: {
    width: '32px',
    fontSize: '11px',
    color: colors.textMuted,
    opacity: 0.4,
    textAlign: 'right' as const,
    paddingRight: '12px',
    flexShrink: 0,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    userSelect: 'none',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
};
