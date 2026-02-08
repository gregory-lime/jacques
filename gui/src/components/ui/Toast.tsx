import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { colors, typography } from '../../styles/theme';

export type ToastPriority = 'low' | 'medium' | 'high' | 'critical';

export interface ToastData {
  id: string;
  title: string;
  body: string;
  priority: ToastPriority;
  timestamp: number;
  /** Category label shown in the chrome bar, e.g. "context" / "operation" */
  category?: string;
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
  /** Auto-dismiss duration in ms. 0 = no auto-dismiss. Default: 6000 */
  duration?: number;
  /** Stagger index for entrance delay */
  index?: number;
}

const priorityAccent: Record<ToastPriority, string> = {
  low: colors.textMuted,
  medium: colors.accent,
  high: colors.warning,
  critical: colors.danger,
};

const priorityGlow: Record<ToastPriority, string> = {
  low: 'none',
  medium: `0 0 20px ${colors.accent}15, 0 8px 24px rgba(0,0,0,0.5)`,
  high: `0 0 20px ${colors.warning}20, 0 8px 24px rgba(0,0,0,0.5)`,
  critical: `0 0 24px ${colors.danger}25, 0 8px 24px rgba(0,0,0,0.5)`,
};

// Inject keyframes once
let stylesInjected = false;
function injectKeyframes() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes jacques-toast-in {
      0% {
        opacity: 0;
        transform: translateX(100%) scale(0.95);
      }
      60% {
        opacity: 1;
        transform: translateX(-4px) scale(1.005);
      }
      100% {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
    }
    @keyframes jacques-toast-out {
      0% {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translateX(40%) scale(0.96);
      }
    }
    @keyframes jacques-progress-shrink {
      from { transform: scaleX(1); }
      to   { transform: scaleX(0); }
    }
    @keyframes jacques-toast-flash {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
  `;
  document.head.appendChild(style);
}

export function Toast({ toast, onDismiss, duration = 6000, index = 0 }: ToastProps) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const accentColor = priorityAccent[toast.priority];

  useEffect(() => {
    injectKeyframes();
  }, []);

  // Auto-dismiss
  useEffect(() => {
    if (duration <= 0) return;
    timerRef.current = setTimeout(() => {
      setExiting(true);
    }, duration);
    return () => clearTimeout(timerRef.current);
  }, [duration]);

  // Remove after exit animation
  useEffect(() => {
    if (!exiting) return;
    const t = setTimeout(() => onDismiss(toast.id), 220);
    return () => clearTimeout(t);
  }, [exiting, onDismiss, toast.id]);

  const handleDismiss = () => {
    clearTimeout(timerRef.current);
    setExiting(true);
  };

  const entranceDelay = `${index * 80}ms`;

  return (
    <div
      style={{
        ...styles.container,
        borderLeftColor: accentColor,
        boxShadow: priorityGlow[toast.priority],
        animation: exiting
          ? 'jacques-toast-out 200ms ease-in forwards'
          : `jacques-toast-in 350ms cubic-bezier(0.16, 1, 0.3, 1) ${entranceDelay} both`,
      }}
      onMouseEnter={() => clearTimeout(timerRef.current)}
      onMouseLeave={() => {
        if (duration > 0 && !exiting) {
          timerRef.current = setTimeout(() => setExiting(true), 2000);
        }
      }}
    >
      {/* Terminal chrome bar */}
      <div style={styles.chrome}>
        <div style={styles.chromeLeft}>
          {/* Priority dot */}
          <span
            style={{
              ...styles.priorityDot,
              backgroundColor: accentColor,
              animation: toast.priority === 'critical'
                ? 'jacques-toast-flash 1.2s ease-in-out infinite'
                : 'none',
            }}
          />
          <span style={styles.chromeTitle}>
            {toast.category || 'notification'}
          </span>
        </div>
        <button
          style={styles.dismissBtn}
          onClick={handleDismiss}
          aria-label="Dismiss notification"
        >
          <X size={11} />
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        <img
          src="/jacsub.png"
          alt=""
          style={styles.mascot}
          draggable={false}
        />
        <div style={styles.textBlock}>
          <div style={styles.title}>{toast.title}</div>
          <div style={styles.body}>{toast.body}</div>
        </div>
      </div>

      {/* Progress bar — auto-dismiss countdown */}
      {duration > 0 && !exiting && (
        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressFill,
              backgroundColor: accentColor,
              animation: `jacques-progress-shrink ${duration}ms linear forwards`,
              animationDelay: entranceDelay,
            }}
          />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '340px',
    maxWidth: 'calc(100vw - 32px)',
    backgroundColor: colors.bgSecondary,
    border: `1px solid ${colors.borderSubtle}`,
    borderLeft: '3px solid',
    borderRadius: '8px',
    overflow: 'hidden',
    pointerEvents: 'auto',
    backdropFilter: 'blur(12px)',
    willChange: 'transform, opacity',
  },

  // -- Chrome bar (mini terminal header)
  chrome: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '26px',
    padding: '0 8px 0 10px',
    backgroundColor: colors.bgElevated,
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  chromeLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
  },
  priorityDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  chromeTitle: {
    fontSize: '10px',
    fontFamily: typography.fontFamily.mono,
    color: colors.textMuted,
    letterSpacing: '0.3px',
    textTransform: 'lowercase' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  dismissBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    padding: 0,
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: colors.textMuted,
    cursor: 'pointer',
    transition: 'all 120ms ease',
    flexShrink: 0,
  },

  // -- Content
  content: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 12px',
  },
  mascot: {
    width: '26px',
    height: '26px',
    borderRadius: '6px',
    objectFit: 'contain' as const,
    flexShrink: 0,
    marginTop: '1px',
    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: colors.textPrimary,
    lineHeight: 1.3,
    marginBottom: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  body: {
    fontSize: '11px',
    color: colors.textSecondary,
    lineHeight: 1.4,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
  },

  // -- Progress bar
  progressTrack: {
    height: '2px',
    backgroundColor: colors.bgPrimary,
  },
  progressFill: {
    height: '100%',
    transformOrigin: 'left',
    willChange: 'transform',
  },
};
