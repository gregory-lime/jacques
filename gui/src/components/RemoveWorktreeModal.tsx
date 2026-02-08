/**
 * RemoveWorktreeModal - Modal for listing and removing git worktrees
 *
 * Shows all local worktrees with status (uncommitted changes, merge status).
 * Allows removing worktrees with confirmation and optional branch deletion.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Loader, Trash2, AlertTriangle, CheckCircle, GitBranch, Check } from 'lucide-react';
import { colors } from '../styles/theme';
import type { WorktreeWithStatus, Session } from '../types';

interface RemoveWorktreeModalProps {
  repoRoot: string;
  activeSessions: Session[];
  onClose: () => void;
  onRemoveSuccess: (worktreePath: string) => void;
  listWorktrees: (repoRoot: string) => void;
  removeWorktree: (repoRoot: string, path: string, force?: boolean, deleteBranch?: boolean) => void;
  onListWorktreesResult: (callback: (success: boolean, worktrees?: WorktreeWithStatus[], error?: string) => void) => void;
  onRemoveWorktreeResult: (callback: (success: boolean, worktreePath?: string, branchDeleted?: boolean, error?: string) => void) => void;
}

export function RemoveWorktreeModal({
  repoRoot,
  activeSessions,
  onClose,
  onRemoveSuccess,
  listWorktrees,
  removeWorktree,
  onListWorktreesResult,
  onRemoveWorktreeResult,
}: RemoveWorktreeModalProps) {
  const [worktrees, setWorktrees] = useState<WorktreeWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<WorktreeWithStatus | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [forceRemove, setForceRemove] = useState(false);

  // Count active sessions per worktree path
  const getActiveSessionCount = useCallback((worktreePath: string): number => {
    const wtBasename = worktreePath.split('/').pop() || '';
    return activeSessions.filter(s => {
      if (s.git_worktree === wtBasename) return true;
      if (s.cwd && s.cwd.startsWith(worktreePath)) return true;
      return false;
    }).length;
  }, [activeSessions]);

  // Register callbacks
  useEffect(() => {
    onListWorktreesResult((success, wts, err) => {
      setLoading(false);
      if (success && wts) {
        setWorktrees(wts.filter(w => !w.isMain));
      } else {
        setError(err || 'Failed to list worktrees');
      }
    });

    onRemoveWorktreeResult((success, worktreePath, _branchDeleted, err) => {
      setRemoving(null);
      if (success && worktreePath) {
        onRemoveSuccess(worktreePath);
        // Refresh the list
        setLoading(true);
        setConfirmTarget(null);
        setForceRemove(false);
        listWorktrees(repoRoot);
      } else {
        setError(err || 'Failed to remove worktree');
      }
    });
  }, [onListWorktreesResult, onRemoveWorktreeResult, onRemoveSuccess, listWorktrees, repoRoot]);

  // Fetch worktrees on mount
  useEffect(() => {
    listWorktrees(repoRoot);
  }, [listWorktrees, repoRoot]);

  // Esc key handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmTarget) {
          setConfirmTarget(null);
          setForceRemove(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, confirmTarget]);

  // Prevent body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleDeleteClick = useCallback((wt: WorktreeWithStatus) => {
    setConfirmTarget(wt);
    setForceRemove(false);
    setDeleteBranch(true);
    setError(null);
  }, []);

  const handleConfirmRemove = useCallback(() => {
    if (!confirmTarget) return;
    setRemoving(confirmTarget.path);
    setError(null);
    removeWorktree(repoRoot, confirmTarget.path, forceRemove, deleteBranch);
  }, [confirmTarget, repoRoot, removeWorktree, forceRemove, deleteBranch]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmTarget(null);
    setForceRemove(false);
    setError(null);
  }, []);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Chrome bar */}
        <div style={styles.chromeBar}>
          <div style={styles.chromeLeft}>
            <GitBranch size={15} color={colors.textMuted} />
            <span style={styles.chromeTitle}>Remove Worktree</span>
          </div>
          <button
            type="button"
            style={styles.closeButton}
            onClick={onClose}
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={styles.contentArea}>
          {loading ? (
            <div style={styles.loadingContainer}>
              <Loader size={18} className="jacques-spin" />
              <span>Loading worktrees...</span>
            </div>
          ) : worktrees.length === 0 ? (
            <div style={styles.emptyState}>
              No linked worktrees found.
            </div>
          ) : (
            <div style={styles.worktreeList}>
              {worktrees.map(wt => {
                const sessionCount = getActiveSessionCount(wt.path);
                const isConfirming = confirmTarget?.path === wt.path;
                const isRemoving = removing === wt.path;

                return (
                  <div key={wt.path} style={styles.worktreeRow}>
                    {/* Worktree info row */}
                    <div style={styles.worktreeInfo}>
                      <div style={styles.worktreeHeader}>
                        <span style={styles.worktreeName}>{wt.name}</span>
                        {wt.branch && wt.branch !== wt.name && (
                          <span style={styles.branchHint}>{wt.branch}</span>
                        )}
                      </div>
                      <div style={styles.statusRow}>
                        {/* Status badges */}
                        {wt.status.hasUncommittedChanges && (
                          <span style={styles.badgeWarning}>
                            <AlertTriangle size={10} />
                            Uncommitted changes
                          </span>
                        )}
                        {wt.status.isMergedToMain ? (
                          <span style={styles.badgeMerged}>
                            <CheckCircle size={10} />
                            Merged
                          </span>
                        ) : (
                          <span style={styles.badgeUnmerged}>
                            Unmerged
                          </span>
                        )}
                        {sessionCount > 0 && (
                          <span style={styles.badgeSession}>
                            {sessionCount} active {sessionCount === 1 ? 'session' : 'sessions'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Delete button */}
                    {!isConfirming && (
                      <button
                        onClick={() => handleDeleteClick(wt)}
                        style={styles.deleteButton}
                        className="jacques-window-toolbar-btn"
                        title="Remove this worktree"
                        disabled={isRemoving}
                      >
                        {isRemoving ? (
                          <Loader size={14} className="jacques-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    )}

                    {/* Confirmation panel */}
                    {isConfirming && (
                      <div style={styles.confirmPanel}>
                        <div style={styles.confirmWarnings}>
                          {wt.status.hasUncommittedChanges && (
                            <div style={styles.confirmWarning}>
                              <AlertTriangle size={12} color={colors.warning} />
                              <span>Uncommitted changes will be lost</span>
                            </div>
                          )}
                          {!wt.status.isMergedToMain && (
                            <div style={styles.confirmWarning}>
                              <AlertTriangle size={12} color={colors.warning} />
                              <span>Branch is not merged to main</span>
                            </div>
                          )}
                          {sessionCount > 0 && (
                            <div style={styles.confirmWarning}>
                              <AlertTriangle size={12} color={colors.danger} />
                              <span>{sessionCount} active {sessionCount === 1 ? 'session' : 'sessions'} in this worktree</span>
                            </div>
                          )}
                        </div>
                        <div style={styles.confirmOptions}>
                          {wt.branch && (
                            <div
                              style={styles.checkboxRow}
                              onClick={() => setDeleteBranch(!deleteBranch)}
                            >
                              <div style={{
                                ...styles.checkboxBox,
                                backgroundColor: deleteBranch ? colors.accent : 'transparent',
                                borderColor: deleteBranch ? colors.accent : colors.borderSubtle,
                              }}>
                                {deleteBranch && <Check size={10} color="#fff" strokeWidth={3} />}
                              </div>
                              <span style={styles.checkboxLabel}>Delete branch <code style={styles.code}>{wt.branch}</code></span>
                            </div>
                          )}
                          {wt.status.hasUncommittedChanges && (
                            <div
                              style={styles.checkboxRow}
                              onClick={() => setForceRemove(!forceRemove)}
                            >
                              <div style={{
                                ...styles.checkboxBox,
                                backgroundColor: forceRemove ? colors.danger : 'transparent',
                                borderColor: forceRemove ? colors.danger : colors.borderSubtle,
                              }}>
                                {forceRemove && <Check size={10} color="#fff" strokeWidth={3} />}
                              </div>
                              <span style={styles.checkboxLabel}>Force remove (discard changes)</span>
                            </div>
                          )}
                        </div>
                        <div style={styles.confirmActions}>
                          <button
                            onClick={handleCancelConfirm}
                            style={styles.cancelBtn}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleConfirmRemove}
                            style={{
                              ...styles.confirmBtn,
                              opacity: (wt.status.hasUncommittedChanges && !forceRemove) ? 0.4 : 1,
                              cursor: (wt.status.hasUncommittedChanges && !forceRemove) ? 'not-allowed' : 'pointer',
                            }}
                            disabled={wt.status.hasUncommittedChanges && !forceRemove}
                          >
                            {isRemoving ? (
                              <Loader size={12} className="jacques-spin" />
                            ) : (
                              'Remove'
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Error display */}
          {error && (
            <div style={styles.errorBar}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <span style={styles.footerHint}>Esc to close</span>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '24px',
    backdropFilter: 'blur(4px)',
  },
  modal: {
    width: '100%',
    maxWidth: '520px',
    maxHeight: '70vh',
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: colors.bgSecondary,
    borderRadius: '10px',
    border: `1px solid ${colors.borderSubtle}`,
    overflow: 'hidden',
    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
  },
  chromeBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    backgroundColor: colors.bgElevated,
    borderBottom: `1px solid ${colors.borderSubtle}`,
    flexShrink: 0,
  },
  chromeLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  chromeTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.textPrimary,
  },
  closeButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: colors.textMuted,
    cursor: 'pointer',
    flexShrink: 0,
  },
  contentArea: {
    flex: 1,
    overflow: 'auto',
    padding: '12px 16px',
    minHeight: 0,
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '36px 0',
    color: colors.textMuted,
    fontSize: '13px',
  },
  emptyState: {
    padding: '36px 0',
    textAlign: 'center' as const,
    color: colors.textMuted,
    fontSize: '13px',
  },
  worktreeList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  worktreeRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '10px 12px',
    borderRadius: '6px',
    backgroundColor: colors.bgPrimary,
    border: `1px solid ${colors.borderSubtle}`,
  },
  worktreeInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    flex: 1,
  },
  worktreeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    justifyContent: 'space-between',
  },
  worktreeName: {
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    color: colors.textPrimary,
    letterSpacing: '0.01em',
  },
  branchHint: {
    fontSize: '10px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', monospace",
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between',
  },
  badgeWarning: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 500,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    color: colors.warning,
  },
  badgeMerged: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 500,
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    color: colors.success,
  },
  badgeUnmerged: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 500,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    color: colors.danger,
  },
  badgeSession: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 500,
    backgroundColor: 'rgba(230, 126, 82, 0.12)',
    color: colors.accent,
  },
  deleteButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    width: 28,
    height: 28,
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'transparent',
    color: colors.textMuted,
    cursor: 'pointer',
    opacity: 0.6,
    transition: 'all 150ms ease',
    padding: 0,
    flexShrink: 0,
    marginTop: 4,
  },
  confirmPanel: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: `1px solid ${colors.borderSubtle}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  confirmWarnings: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  confirmWarning: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: colors.textSecondary,
  },
  confirmOptions: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    padding: '3px 0',
  },
  checkboxBox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    border: `1.5px solid ${colors.borderSubtle}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 150ms ease',
  },
  checkboxLabel: {
    fontSize: '11px',
    color: colors.textSecondary,
  },
  code: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    padding: '1px 4px',
    borderRadius: '3px',
    backgroundColor: colors.bgElevated,
    color: colors.textPrimary,
  },
  confirmActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '4px',
  },
  cancelBtn: {
    padding: '4px 12px',
    fontSize: '11px',
    fontWeight: 500,
    borderRadius: '4px',
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    cursor: 'pointer',
  },
  confirmBtn: {
    padding: '4px 12px',
    fontSize: '11px',
    fontWeight: 600,
    borderRadius: '4px',
    border: 'none',
    backgroundColor: colors.danger,
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  errorBar: {
    marginTop: '8px',
    padding: '8px 12px',
    borderRadius: '4px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: colors.danger,
    fontSize: '11px',
    fontFamily: "'JetBrains Mono', monospace",
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '8px 16px',
    borderTop: `1px solid ${colors.borderSubtle}`,
    flexShrink: 0,
  },
  footerHint: {
    fontSize: '11px',
    color: colors.textMuted,
  },
};
