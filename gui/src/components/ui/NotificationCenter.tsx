/**
 * Notification Center
 *
 * Bell icon with unread badge + dropdown panel showing notification history.
 * Lives in the sidebar footer next to Settings.
 */

import { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { Bell, Check, Trash2, X } from 'lucide-react';
import { colors } from '../../styles/theme';
import { notificationStore, type NotificationItem, type NotificationPriority, type NotificationCategory } from './NotificationStore';

// ============================================================
// Priority colors
// ============================================================

const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  low: colors.textMuted,
  medium: colors.accent,
  high: colors.warning,
  critical: colors.danger,
};

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  context: 'Context',
  operation: 'Operation',
  plan: 'Plan',
  'auto-compact': 'Compact',
  handoff: 'Handoff',
};

// ============================================================
// Component
// ============================================================

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const notifications = useSyncExternalStore(
    notificationStore.subscribe,
    notificationStore.getSnapshot,
  );
  const unreadCount = notifications.filter(n => !n.read).length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(prev => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'all 150ms ease',
          flexShrink: 0,
          backgroundColor: open ? colors.bgElevated : 'transparent',
          color: open ? colors.accent : colors.textMuted,
          position: 'relative',
        }}
        title="Notification center"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span style={styles.badge}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div ref={panelRef} style={styles.panel}>
          {/* Header */}
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Notifications</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {unreadCount > 0 && (
                <button
                  style={styles.headerAction}
                  onClick={() => notificationStore.markAllRead()}
                  title="Mark all read"
                >
                  <Check size={12} />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  style={styles.headerAction}
                  onClick={() => notificationStore.clear()}
                  title="Clear all"
                >
                  <Trash2 size={12} />
                </button>
              )}
              <button
                style={styles.headerAction}
                onClick={() => setOpen(false)}
                title="Close"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={styles.list}>
            {notifications.length === 0 ? (
              <div style={styles.empty}>No notifications</div>
            ) : (
              notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onClick={() => notificationStore.markRead(n.id)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Row component
// ============================================================

function NotificationRow({
  notification,
  onClick,
}: {
  notification: NotificationItem;
  onClick: () => void;
}) {
  const age = formatAge(notification.timestamp);

  return (
    <div
      style={{
        ...styles.row,
        opacity: notification.read ? 0.6 : 1,
        backgroundColor: notification.read ? 'transparent' : `${colors.bgElevated}80`,
      }}
      onClick={onClick}
    >
      {/* Priority dot */}
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: PRIORITY_COLORS[notification.priority],
          flexShrink: 0,
          marginTop: 5,
        }}
      />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.rowHeader}>
          <span style={styles.rowTitle}>{notification.title}</span>
          <span style={styles.rowCategory}>
            {CATEGORY_LABELS[notification.category] ?? notification.category}
          </span>
        </div>
        <div style={styles.rowBody}>{notification.body}</div>
        <div style={styles.rowTime}>{age}</div>
      </div>

      {/* Unread indicator */}
      {!notification.read && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: colors.accent,
            flexShrink: 0,
            marginTop: 5,
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatAge(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ============================================================
// Styles
// ============================================================

const styles: Record<string, React.CSSProperties> = {
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.danger,
    color: '#fff',
    fontSize: 9,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 3px',
    lineHeight: 1,
  },
  panel: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    width: 320,
    maxHeight: 400,
    backgroundColor: colors.bgSecondary,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: 8,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: colors.textPrimary,
  },
  headerAction: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: colors.textMuted,
    transition: 'all 150ms ease',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    maxHeight: 350,
  },
  empty: {
    padding: 24,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
  },
  row: {
    display: 'flex',
    gap: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    borderBottom: `1px solid ${colors.borderSubtle}20`,
    transition: 'background-color 150ms ease',
  },
  rowHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  rowTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.textPrimary,
  },
  rowCategory: {
    fontSize: 10,
    color: colors.textMuted,
    backgroundColor: colors.bgElevated,
    padding: '1px 5px',
    borderRadius: 3,
  },
  rowBody: {
    fontSize: 12,
    color: colors.textSecondary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  rowTime: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
};
