/**
 * WorktreeSessionsView - Git worktree visualization
 *
 * Subtle chunky pixel tree with glow, git icon, and clear worktree names.
 * Supports multi-select for window tiling.
 * Selection can be controlled externally (via props) or managed internally.
 * Inline worktree creation replaces modal flow.
 */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { Session, SessionBadges } from '../types';
import { colors } from '../styles/theme';
import { CompactSessionCard } from './CompactSessionCard';
import { Terminal, GitBranch, X, Plus, CornerDownLeft, Loader } from 'lucide-react';

export interface PendingWorktree {
  id: string;       // worktree directory name (basename of path)
  branch: string;   // git branch name
  path: string;     // full worktree path
  createdAt: number; // for timeout
}

interface Props {
  sessions: Session[];
  pendingWorktrees?: PendingWorktree[];
  focusedSessionId: string | null;
  /** Keyboard navigation cursor (from j/k shortcuts) */
  keyboardFocusedId?: string | null;
  badges: Map<string, SessionBadges>;
  onSessionClick: (session: Session) => void;
  onFocusSession?: (sessionId: string) => void;
  onPlanClick?: (sessionId: string) => void;
  onAgentClick?: (sessionId: string) => void;
  onTileSessions?: (sessionIds: string[], layout?: 'side-by-side' | 'thirds' | '2x2') => void;
  onLaunchSession?: (cwd: string) => void;
  onCreateWorktreeSubmit?: (repoRoot: string, name: string) => void;
  onDismissPendingWorktree?: (id: string) => void;
  worktreeCreation?: { loading: boolean; error?: string };
  // Controlled selection (optional - falls back to internal state)
  selectedSessionIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

interface WorktreeGroup {
  id: string;
  branch: string;
  isMain: boolean;
  sessions: Session[];
}

function groupSessions(sessions: Session[]): WorktreeGroup[] {
  const map = new Map<string, WorktreeGroup>();

  for (const s of sessions) {
    const id = s.git_worktree || 'main';
    const branch = s.git_branch || 'main';
    const isMain = !s.git_worktree || id === 'main';

    if (!map.has(id)) {
      map.set(id, { id, branch, isMain, sessions: [] });
    }
    map.get(id)!.sessions.push(s);
  }

  return [...map.values()].sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

// ─── Validation & Helpers ────────────────────────────────────

const VALID_NAME_RE = /^[a-zA-Z0-9_-]+$/;

function validateWorktreeName(value: string): string | null {
  if (!value) return null;
  if (!VALID_NAME_RE.test(value)) return 'Letters, numbers, hyphens, underscores only';
  if (value.length > 100) return 'Max 100 characters';
  return null;
}

function getPathPreview(repoRoot: string, name: string): string {
  const sep = repoRoot.includes('\\') ? '\\' : '/';
  const parts = repoRoot.split(/[\\/]/);
  const base = parts.pop() || '';
  const parent = parts.slice(-2).join(sep);
  return `${sep === '\\' ? '' : '~/'}${parent}${sep}${base}-${name}`;
}

// Pixel sizes
const PX = 4;
const TRUNK_W = PX * 2;
const BRANCH_H = PX * 2;
const NODE_SIZE = PX * 3;
const GUTTER_LEFT = 8;

export function WorktreeSessionsView({
  sessions, pendingWorktrees = [], focusedSessionId, keyboardFocusedId, badges, onSessionClick, onFocusSession,
  onPlanClick, onAgentClick, onTileSessions, onLaunchSession,
  onCreateWorktreeSubmit, onDismissPendingWorktree, worktreeCreation,
  selectedSessionIds: controlledIds, onSelectionChange: controlledOnChange,
}: Props) {
  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  // Internal state used when not controlled
  const [internalIds, setInternalIds] = useState<Set<string>>(new Set());

  // Use controlled or internal state
  const selectedSessionIds = controlledIds ?? internalIds;
  const setSelectedSessionIds = controlledOnChange ?? setInternalIds;

  // ─── Inline creation state ──────────────────────────────────
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasLoadingRef = useRef(false);

  // Auto-focus input when inline row appears
  useEffect(() => {
    if (isCreating) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isCreating]);

  // Dismiss inline row on successful creation
  useEffect(() => {
    const isLoading = worktreeCreation?.loading ?? false;
    if (isCreating && wasLoadingRef.current && !isLoading && !worktreeCreation?.error) {
      // Was loading, now not loading and no error → success
      setIsCreating(false);
      setNewName('');
      setValidationError(null);
    }
    wasLoadingRef.current = isLoading;
  }, [worktreeCreation, isCreating]);

  // ─── Selection handlers ──────────────────────────────────────

  const handleSelectionChange = useCallback((sessionId: string, selected: boolean) => {
    const newSet = new Set(selectedSessionIds);
    if (selected) {
      newSet.add(sessionId);
    } else {
      newSet.delete(sessionId);
    }
    setSelectedSessionIds(newSet);
  }, [selectedSessionIds, setSelectedSessionIds]);

  // ─── Inline creation handlers ────────────────────────────────

  const repoRoot = sessions[0]?.git_repo_root || '';

  const handleInlineSubmit = useCallback(() => {
    if (!newName || worktreeCreation?.loading) return;
    const err = validateWorktreeName(newName);
    if (err) {
      setValidationError(err);
      return;
    }
    if (repoRoot && onCreateWorktreeSubmit) {
      onCreateWorktreeSubmit(repoRoot, newName);
    }
  }, [newName, worktreeCreation, repoRoot, onCreateWorktreeSubmit]);

  const handleInlineCancel = useCallback(() => {
    setIsCreating(false);
    setNewName('');
    setValidationError(null);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewName(value);
    setValidationError(validateWorktreeName(value));
  }, []);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInlineSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleInlineCancel();
    }
  }, [handleInlineSubmit, handleInlineCancel]);

  // ─── Render ──────────────────────────────────────────────────

  if (!sessions.length) {
    return (
      <div style={styles.empty}>
        <Terminal size={20} style={{ opacity: 0.3 }} />
        <span>No active sessions</span>
      </div>
    );
  }

  // Get the root directory for launching in a worktree group
  const getCwd = (group: WorktreeGroup): string => {
    const s = group.sessions[0];
    if (!s) return '';

    // For main worktree, git_repo_root is correct
    if (group.isMain) {
      return s.git_repo_root || s.cwd || '';
    }

    // For linked worktrees, git_repo_root points to the MAIN repo root (wrong).
    // Derive the worktree root from cwd: find the git_worktree basename in the path.
    if (s.git_worktree && s.cwd) {
      // Try both separators for cross-platform support (/ and \)
      const fwdMarker = '/' + s.git_worktree;
      const bwdMarker = '\\' + s.git_worktree;
      for (const marker of [fwdMarker, bwdMarker]) {
        const idx = s.cwd.lastIndexOf(marker);
        if (idx >= 0) {
          const endIdx = idx + marker.length;
          if (endIdx === s.cwd.length || s.cwd[endIdx] === '/' || s.cwd[endIdx] === '\\') {
            return s.cwd.substring(0, endIdx);
          }
        }
      }
    }

    return s.cwd || '';
  };

  const total = groups.length;
  const isLoading = worktreeCreation?.loading ?? false;
  const serverError = worktreeCreation?.error;
  const displayError = validationError || serverError;
  const canSubmit = newName.length > 0 && !validationError && !isLoading;

  return (
    <div style={styles.root}>
      {groups.map((g, i) => {
        const isFirst = i === 0;
        const hasMoreNodes = pendingWorktrees.length > 0 || isCreating || !!onCreateWorktreeSubmit;
        const isLast = i === total - 1 && !hasMoreNodes;
        const nodeColor = g.isMain ? colors.success : colors.accent;
        const trunkLeft = GUTTER_LEFT + (NODE_SIZE - TRUNK_W) / 2;

        return (
          <div key={g.id} style={styles.group}>
            {/* Node row: tree node + branch + label (all on same line) */}
            <div style={styles.nodeRow}>
              {/* Trunk ABOVE the node (connecting from previous) */}
              {!isFirst && (
                <div
                  style={{
                    position: 'absolute',
                    left: trunkLeft,
                    top: 0,
                    width: TRUNK_W,
                    height: NODE_SIZE / 2 + 2, // Connect to center of node
                    backgroundColor: colors.borderSubtle,
                    opacity: 0.35,
                  }}
                />
              )}

              {/* Node */}
              <div
                style={{
                  width: NODE_SIZE,
                  height: NODE_SIZE,
                  backgroundColor: nodeColor,
                  opacity: 0.8,
                  boxShadow: `0 0 8px ${nodeColor}60, 0 0 12px ${nodeColor}30`,
                  marginLeft: GUTTER_LEFT,
                  flexShrink: 0,
                  position: 'relative',
                  zIndex: 1,
                }}
              />

              {/* Horizontal branch */}
              <div
                style={{
                  width: PX * 3,
                  height: BRANCH_H,
                  backgroundColor: nodeColor,
                  opacity: 0.35,
                  flexShrink: 0,
                }}
              />

              {/* Label inline */}
              <div style={styles.labelRow}>
                <GitBranch
                  size={13}
                  color={g.isMain ? colors.success : colors.textSecondary}
                  strokeWidth={2}
                />
                <span style={{ ...styles.label, color: g.isMain ? colors.success : colors.textSecondary }}>
                  {g.id}
                </span>
                {g.branch !== g.id && (
                  <span style={styles.branchHint}>→ {g.branch}</span>
                )}
                {onLaunchSession && (
                  <button
                    onClick={() => onLaunchSession(getCwd(g))}
                    className="jacques-window-toolbar-btn"
                    title="Launch new Claude session in this worktree"
                    style={styles.launchBtn}
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Cards area */}
            <div style={styles.cardArea}>
              {/* Trunk BELOW the node (continuing to next) */}
              {!isLast && (
                <div
                  style={{
                    position: 'absolute',
                    left: trunkLeft,
                    top: 0,
                    bottom: 0,
                    width: TRUNK_W,
                    backgroundColor: colors.borderSubtle,
                    opacity: 0.35,
                  }}
                />
              )}

              {/* Cards */}
              <div style={styles.cards}>
                {g.sessions.map(s => (
                  <CompactSessionCard
                    key={s.session_id}
                    session={s}
                    isFocused={s.session_id === focusedSessionId}
                    isKeyboardFocused={s.session_id === keyboardFocusedId}
                    badges={badges.get(s.session_id)}
                    onClick={() => onSessionClick(s)}
                    onFocusClick={onFocusSession ? () => onFocusSession(s.session_id) : undefined}
                    onPlanClick={onPlanClick ? () => onPlanClick(s.session_id) : undefined}
                    onAgentClick={onAgentClick ? () => onAgentClick(s.session_id) : undefined}
                    isSelected={selectedSessionIds.has(s.session_id)}
                    onSelectionChange={onTileSessions ? (selected) => handleSelectionChange(s.session_id, selected) : undefined}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {/* ─── Inline creation row ──────────────────────────────── */}
      {isCreating && repoRoot && (() => {
        const nodeColor = colors.accent;
        const trunkLeft = GUTTER_LEFT + (NODE_SIZE - TRUNK_W) / 2;

        return (
          <div style={styles.group}>
            <div style={styles.nodeRow}>
              {/* Trunk above (connecting from previous node) */}
              {(groups.length > 0 || pendingWorktrees.length > 0) && (
                <div
                  style={{
                    position: 'absolute',
                    left: trunkLeft,
                    top: 0,
                    width: TRUNK_W,
                    height: NODE_SIZE / 2 + 2,
                    backgroundColor: colors.borderSubtle,
                    opacity: 0.35,
                  }}
                />
              )}

              {/* Node - pulses during loading */}
              <div
                style={{
                  width: NODE_SIZE,
                  height: NODE_SIZE,
                  backgroundColor: nodeColor,
                  opacity: isLoading ? 0.5 : 0.8,
                  boxShadow: `0 0 8px ${nodeColor}60, 0 0 12px ${nodeColor}30`,
                  marginLeft: GUTTER_LEFT,
                  flexShrink: 0,
                  position: 'relative',
                  zIndex: 1,
                  animation: isLoading ? 'pulse-glow 1.5s ease-in-out infinite' : undefined,
                }}
              />

              {/* Horizontal branch */}
              <div
                style={{
                  width: PX * 3,
                  height: BRANCH_H,
                  backgroundColor: nodeColor,
                  opacity: 0.35,
                  flexShrink: 0,
                }}
              />

              {/* Label row with inline input */}
              <div style={styles.labelRow}>
                <GitBranch
                  size={13}
                  color={colors.textSecondary}
                  strokeWidth={2}
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={newName}
                  onChange={handleInputChange}
                  onKeyDown={handleInputKeyDown}
                  placeholder="worktree-name"
                  disabled={isLoading}
                  autoComplete="off"
                  spellCheck={false}
                  style={styles.inlineInput}
                />
                {/* Path preview hint */}
                {newName && !validationError && (
                  <span style={styles.branchHint}>→ {getPathPreview(repoRoot, newName)}</span>
                )}
                {/* Submit / loading button */}
                <button
                  onClick={handleInlineSubmit}
                  className="jacques-window-toolbar-btn"
                  title={isLoading ? 'Creating worktree...' : 'Create worktree (Enter)'}
                  style={{
                    ...styles.launchBtn,
                    opacity: isLoading ? 0.8 : canSubmit ? 0.6 : 0.25,
                    cursor: canSubmit ? 'pointer' : 'default',
                  }}
                  disabled={!canSubmit}
                >
                  {isLoading ? (
                    <Loader size={13} className="jacques-spin" />
                  ) : (
                    <CornerDownLeft size={14} />
                  )}
                </button>
              </div>
            </div>

            {/* Inline error display */}
            {displayError && (
              <div style={styles.inlineError}>
                <span style={styles.inlineErrorText}>{displayError}</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── Pending worktrees (launching, awaiting session) ──── */}
      {pendingWorktrees.map((pending, i) => {
        const nodeColor = colors.accent;
        const trunkLeft = GUTTER_LEFT + (NODE_SIZE - TRUNK_W) / 2;
        const pendingIndex = groups.length + i;
        const isLastPending = i === pendingWorktrees.length - 1 && !isCreating && !onCreateWorktreeSubmit;

        return (
          <div key={`pending-${pending.id}`} style={styles.group}>
            <div style={styles.nodeRow}>
              {/* Trunk above */}
              {pendingIndex > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: trunkLeft,
                    top: 0,
                    width: TRUNK_W,
                    height: NODE_SIZE / 2 + 2,
                    backgroundColor: colors.borderSubtle,
                    opacity: 0.35,
                  }}
                />
              )}

              {/* Node - pulsing */}
              <div
                style={{
                  width: NODE_SIZE,
                  height: NODE_SIZE,
                  backgroundColor: nodeColor,
                  opacity: 0.6,
                  boxShadow: `0 0 8px ${nodeColor}60, 0 0 12px ${nodeColor}30`,
                  marginLeft: GUTTER_LEFT,
                  flexShrink: 0,
                  position: 'relative',
                  zIndex: 1,
                  animation: 'pulse-glow 1.5s ease-in-out infinite',
                }}
              />

              {/* Horizontal branch */}
              <div
                style={{
                  width: PX * 3,
                  height: BRANCH_H,
                  backgroundColor: nodeColor,
                  opacity: 0.35,
                  flexShrink: 0,
                }}
              />

              {/* Label with spinner and dismiss */}
              <div style={styles.labelRow}>
                <GitBranch size={13} color={colors.textSecondary} strokeWidth={2} />
                <span style={{ ...styles.label, color: colors.textSecondary }}>
                  {pending.id}
                </span>
                <span style={styles.branchHint}>→ {pending.branch}</span>
                <Loader size={13} className="jacques-spin" style={{ marginLeft: 4, color: colors.accent }} />
                {onDismissPendingWorktree && (
                  <button
                    onClick={() => onDismissPendingWorktree(pending.id)}
                    className="jacques-window-toolbar-btn"
                    title="Dismiss — Claude Code didn't start"
                    style={styles.launchBtn}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Cards area - launching hint */}
            <div style={styles.cardArea}>
              {!isLastPending && (
                <div
                  style={{
                    position: 'absolute',
                    left: trunkLeft,
                    top: 0,
                    bottom: 0,
                    width: TRUNK_W,
                    backgroundColor: colors.borderSubtle,
                    opacity: 0.35,
                  }}
                />
              )}
              <div style={styles.pendingHint}>
                Launching Claude Code...
              </div>
            </div>
          </div>
        );
      })}

      {/* ─── New Worktree tree node ─────────────────────────────── */}
      {!isCreating && onCreateWorktreeSubmit && sessions.length > 0 && repoRoot && (() => {
        const nodeColor = colors.textMuted;
        const trunkLeft = GUTTER_LEFT + (NODE_SIZE - TRUNK_W) / 2;
        const prevNodes = groups.length + pendingWorktrees.length;

        return (
          <div style={styles.group}>
            <div style={styles.nodeRow}>
              {/* Trunk above */}
              {prevNodes > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: trunkLeft,
                    top: 0,
                    width: TRUNK_W,
                    height: NODE_SIZE / 2 + 2,
                    backgroundColor: colors.borderSubtle,
                    opacity: 0.35,
                  }}
                />
              )}

              {/* Node - dimmed */}
              <div
                style={{
                  width: NODE_SIZE,
                  height: NODE_SIZE,
                  backgroundColor: nodeColor,
                  opacity: 0.4,
                  marginLeft: GUTTER_LEFT,
                  flexShrink: 0,
                  position: 'relative',
                  zIndex: 1,
                }}
              />

              {/* Horizontal branch */}
              <div
                style={{
                  width: PX * 3,
                  height: BRANCH_H,
                  backgroundColor: nodeColor,
                  opacity: 0.2,
                  flexShrink: 0,
                }}
              />

              {/* Label + button */}
              <div style={styles.labelRow}>
                <button
                  onClick={() => setIsCreating(true)}
                  className="jacques-window-toolbar-btn"
                  title="Create a new git worktree and launch Claude in it"
                  style={styles.launchBtn}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
  },

  group: {
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },

  nodeRow: {
    display: 'flex',
    alignItems: 'center',
    position: 'relative',
    paddingTop: 8,
  },

  labelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },

  label: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.01em',
    textTransform: 'uppercase',
  },

  branchHint: {
    color: colors.textMuted,
    opacity: 0.6,
    textTransform: 'none',
    fontWeight: 400,
    fontSize: 10,
  },

  cardArea: {
    display: 'flex',
    position: 'relative',
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: GUTTER_LEFT + NODE_SIZE + PX * 3 + 20, // Align with after the branch
  },

  cards: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    flex: 1,
  },

  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '48px 24px',
    color: colors.textMuted,
    fontSize: 13,
  },

  launchBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'transparent',
    color: colors.textMuted,
    cursor: 'pointer',
    opacity: 0.6,
    transition: 'all 150ms ease',
    marginLeft: 4,
    padding: 0,
    flexShrink: 0,
  },

  pendingHint: {
    fontSize: 11,
    color: colors.textMuted,
    opacity: 0.6,
    fontStyle: 'italic' as const,
    fontFamily: "'JetBrains Mono', monospace",
  },

  // ─── Inline creation styles ──────────────────────────────────

  inlineInput: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.01em',
    textTransform: 'uppercase' as const,
    color: colors.textSecondary,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    padding: 0,
    margin: 0,
    width: 160,
    caretColor: colors.accent,
  },

  inlineError: {
    paddingLeft: GUTTER_LEFT + NODE_SIZE + PX * 3 + 8 + 6 + 13 + 6,
    paddingTop: 2,
    paddingBottom: 4,
  },

  inlineErrorText: {
    fontSize: 10,
    color: colors.danger,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 500,
  },
};
