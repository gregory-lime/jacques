/**
 * ContentModal - Full-screen overlay for viewing markdown content
 *
 * Used for plans, explore agent results, and web search results.
 * Minimalistic terminal aesthetic with chrome bar title + badge.
 */

import { useEffect, useCallback, useState } from 'react';
import { X, Loader } from 'lucide-react';
import type { ReactNode } from 'react';
import { colors } from '../../styles/theme';
import { MarkdownRenderer } from '../Conversation/MarkdownRenderer';

// ─── Types ───────────────────────────────────────────────────

export interface ContentModalConfig {
  /** Title shown in the chrome bar */
  title: string;
  /** Optional badge next to title */
  badge?: { label: string; variant: 'plan' | 'agent' | 'web' };
  /** Icon to the left of the title */
  icon?: ReactNode;
  /** Subtitle under the chrome bar */
  subtitle?: string;
  /** Render mode */
  mode: 'markdown';
  /** Markdown content string */
  content: string;
  /** Optional footer info (e.g., token count) */
  footerInfo?: string;
  /** Modal size */
  size?: 'md' | 'lg';
  /** Loading state — shows spinner instead of content */
  loading?: boolean;
}

interface ContentModalProps extends ContentModalConfig {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Hook ────────────────────────────────────────────────────

export function useContentModal() {
  const [modalConfig, setModalConfig] = useState<ContentModalConfig | null>(null);

  const openModal = useCallback((config: ContentModalConfig) => {
    setModalConfig(config);
  }, []);

  const closeModal = useCallback(() => {
    setModalConfig(null);
  }, []);

  /** Update an open modal's config (e.g., replace loading with content) */
  const updateModal = useCallback((updates: Partial<ContentModalConfig>) => {
    setModalConfig(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  const modalProps: ContentModalProps | null = modalConfig
    ? { ...modalConfig, isOpen: true, onClose: closeModal }
    : null;

  return { openModal, closeModal, updateModal, modalProps };
}

// ─── Badge Colors ────────────────────────────────────────────

const BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  plan: { bg: 'rgba(52, 211, 153, 0.15)', fg: '#34D399' },
  agent: { bg: 'rgba(255, 102, 0, 0.15)', fg: '#FF6600' },
  web: { bg: 'rgba(96, 165, 250, 0.15)', fg: '#60A5FA' },
};

// ─── Component ───────────────────────────────────────────────

export function ContentModal({
  isOpen,
  onClose,
  title,
  badge,
  icon,
  subtitle,
  content,
  footerInfo,
  size = 'lg',
  loading = false,
}: ContentModalProps) {
  // Esc key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

  const badgeStyle = badge ? BADGE_COLORS[badge.variant] || BADGE_COLORS.agent : null;
  const maxWidth = size === 'lg' ? '820px' : '640px';

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={{ ...styles.modal, maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Chrome bar */}
        <div style={styles.chromeBar}>
          <div style={styles.chromeLeft}>
            {icon && <span style={styles.chromeIcon}>{icon}</span>}
            <span style={styles.chromeTitle}>{title}</span>
            {badge && badgeStyle && (
              <span style={{
                ...styles.chromeBadge,
                backgroundColor: badgeStyle.bg,
                color: badgeStyle.fg,
              }}>
                {badge.label}
              </span>
            )}
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

        {/* Subtitle */}
        {subtitle && (
          <div style={styles.subtitle}>{subtitle}</div>
        )}

        {/* Content */}
        <div style={styles.contentArea}>
          {loading ? (
            <div style={styles.loadingContainer}>
              <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
              <span>Loading...</span>
            </div>
          ) : (
            <MarkdownRenderer content={content} />
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          {footerInfo && <span style={styles.footerInfo}>{footerInfo}</span>}
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
    transition: 'opacity 150ms ease',
  },
  modal: {
    width: '100%',
    maxHeight: '85vh',
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
    minWidth: 0,
  },
  chromeIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    color: colors.textMuted,
    flexShrink: 0,
  },
  chromeTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  chromeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    flexShrink: 0,
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
    transition: 'color 150ms ease',
  },
  subtitle: {
    padding: '8px 16px',
    fontSize: '12px',
    color: colors.textSecondary,
    borderBottom: `1px solid ${colors.borderSubtle}`,
    flexShrink: 0,
  },
  contentArea: {
    flex: 1,
    overflow: 'auto',
    padding: '20px 24px',
    minHeight: 0,
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '48px 0',
    color: colors.textMuted,
    fontSize: '13px',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderTop: `1px solid ${colors.borderSubtle}`,
    flexShrink: 0,
  },
  footerInfo: {
    fontSize: '11px',
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  footerHint: {
    fontSize: '11px',
    color: colors.textMuted,
    marginLeft: 'auto',
  },
};
