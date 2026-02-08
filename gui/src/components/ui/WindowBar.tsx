/**
 * WindowBar - macOS-style title bar component
 *
 * Reusable chrome bar with three colored dots, title text, and optional
 * right-side slot. Matches the terminal aesthetic used in ContentModal.
 */

import type { ReactNode, CSSProperties } from 'react';
import { colors } from '../../styles/theme';

interface WindowBarProps {
  title: ReactNode;
  accentColor?: string;
  children?: ReactNode;  // right-side slot
  style?: CSSProperties;
}

export function WindowBar({ title, children, style }: WindowBarProps) {
  return (
    <div style={{ ...styles.bar, ...style }}>
      <div style={styles.left}>
        <div style={styles.dots}>
          <span style={{ ...styles.dot, backgroundColor: colors.dotRed }} />
          <span style={{ ...styles.dot, backgroundColor: colors.dotYellow }} />
          <span style={{ ...styles.dot, backgroundColor: colors.dotGreen }} />
        </div>
        <div style={styles.titleArea}>{title}</div>
      </div>
      {children && <div style={styles.right}>{children}</div>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: colors.bgElevated,
    borderBottom: `1px solid ${colors.borderSubtle}`,
    borderRadius: '10px 10px 0 0',
    flexShrink: 0,
    minHeight: '32px',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minWidth: 0,
    flex: 1,
  },
  dots: {
    display: 'flex',
    gap: '5px',
    flexShrink: 0,
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    opacity: 0.7,
  },
  titleArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    flex: 1,
    overflow: 'hidden',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
    marginLeft: '8px',
  },
};
