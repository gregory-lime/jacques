/**
 * WindowToolbar - Minimal icon-only toolbar for window management.
 *
 * 5 buttons: Maximize, Tile, Focus, Browser+Terminal, Browser+2Terminals
 * Dark by default, lighter on hover. Always visible between header and content.
 * Buttons glow based on selection count to suggest the most relevant layout.
 */

import { Maximize2, LayoutGrid, Crosshair, PanelRight, Columns3, GitFork } from 'lucide-react';
import { colors } from '../styles/theme';

interface WindowToolbarProps {
  selectedCount: number;
  hasSelection: boolean;
  hasTwoSelected: boolean;
  onMaximize: () => void;
  onTileSelected: () => void;
  onFocus: () => void;
  onBrowserTerminal: () => void;
  onBrowserTwoTerminals: () => void;
  onManageWorktrees?: () => void;
  manageWorktreesDisabled?: boolean;
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  title: string;
  disabled: boolean;
  highlighted?: boolean;
  onClick: () => void;
}

function ToolbarButton({ icon, title, disabled, highlighted, onClick }: ToolbarButtonProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        border: 'none',
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: 'transparent',
        color: highlighted ? colors.accent : colors.textMuted,
        opacity: disabled ? 0.2 : highlighted ? 0.95 : 0.6,
        transition: 'all 150ms ease',
        flexShrink: 0,
        padding: 0,
        boxShadow: highlighted ? `0 0 8px rgba(230, 126, 82, 0.35)` : 'none',
      }}
      className="jacques-window-toolbar-btn"
      disabled={disabled}
    >
      {icon}
    </button>
  );
}

export function WindowToolbar({
  selectedCount,
  hasSelection,
  hasTwoSelected,
  onMaximize,
  onTileSelected,
  onFocus,
  onBrowserTerminal,
  onBrowserTwoTerminals,
  onManageWorktrees,
  manageWorktreesDisabled,
}: WindowToolbarProps) {
  // Determine which buttons glow based on selection count
  const highlightTile = selectedCount >= 2;
  const highlightBrowserTerminal = selectedCount === 1;
  const highlightBrowserTwo = selectedCount === 2;

  return (
    <div style={styles.toolbar}>
      <ToolbarButton
        icon={<Maximize2 size={14} />}
        title="Maximize terminal fullscreen"
        disabled={!hasSelection}
        onClick={onMaximize}
      />
      <ToolbarButton
        icon={<LayoutGrid size={14} />}
        title="Tile selected sessions"
        disabled={!hasTwoSelected}
        highlighted={highlightTile}
        onClick={onTileSelected}
      />
      <ToolbarButton
        icon={<Crosshair size={14} />}
        title="Focus terminal"
        disabled={!hasSelection}
        onClick={onFocus}
      />
      <div style={styles.separator} />
      <ToolbarButton
        icon={<PanelRight size={14} />}
        title="Browser + terminal (5/7 + 2/7)"
        disabled={!hasSelection}
        highlighted={highlightBrowserTerminal}
        onClick={onBrowserTerminal}
      />
      <ToolbarButton
        icon={<Columns3 size={14} />}
        title="Browser + 2 terminals"
        disabled={!hasSelection}
        highlighted={highlightBrowserTwo}
        onClick={onBrowserTwoTerminals}
      />
      {onManageWorktrees && (
        <>
          <div style={styles.separator} />
          <ToolbarButton
            icon={<GitFork size={14} />}
            title="Manage worktrees"
            disabled={manageWorktreesDisabled ?? true}
            onClick={onManageWorktrees}
          />
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  separator: {
    width: 1,
    height: 16,
    backgroundColor: colors.textMuted,
    opacity: 0.15,
    margin: '0 4px',
    flexShrink: 0,
  },
};
