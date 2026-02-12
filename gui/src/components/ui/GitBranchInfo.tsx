/**
 * GitBranchInfo — Shared git branch display for session cards.
 *
 * Shows branch name, ahead/behind divergence arrows, and dirty dot.
 * Returns null when session has no git_branch.
 */

import { GitBranch } from 'lucide-react';
import { colors } from '../../styles/theme';
import type { Session } from '../../types';

interface GitBranchInfoProps {
  session: Session;
}

export function GitBranchInfo({ session }: GitBranchInfoProps) {
  if (!session.git_branch) return null;

  return (
    <div style={styles.gitRow}>
      <GitBranch size={11} color={colors.textMuted} strokeWidth={2} />
      <span style={styles.gitBranch}>{session.git_branch}</span>
      {(session.git_ahead != null && session.git_ahead > 0 || session.git_behind != null && session.git_behind > 0) && (
        <span style={styles.gitDivergence}>
          {session.git_ahead != null && session.git_ahead > 0 ? `\u2191${session.git_ahead}` : ''}
          {session.git_behind != null && session.git_behind > 0 ? ` \u2193${session.git_behind}` : ''}
        </span>
      )}
      {session.git_dirty && <span style={styles.gitDirty}>{'\u2022'}</span>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  gitRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    marginTop: '1px',
  },
  gitBranch: {
    fontSize: '11px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '-0.01em',
  },
  gitDivergence: {
    fontSize: '10px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', monospace",
    opacity: 0.7,
  } as React.CSSProperties,
  gitDirty: {
    fontSize: '11px',
    color: '#F59E0B',
    marginLeft: '2px',
  } as React.CSSProperties,
};
