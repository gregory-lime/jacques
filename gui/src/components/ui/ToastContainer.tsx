import { useCallback, useRef, useSyncExternalStore } from 'react';
import { Toast, type ToastData, type ToastPriority } from './Toast';

// ---------------------------------------------------------------------------
// Toast store — framework-agnostic singleton so any code can push toasts
// ---------------------------------------------------------------------------

type Listener = () => void;

const MAX_VISIBLE = 3;

let toasts: ToastData[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return toasts;
}

/** Push a toast. Returns its id. */
function pushToast(opts: {
  title: string;
  body: string;
  priority?: ToastPriority;
  category?: string;
  /** Duration in ms. Default: 6000. Pass 0 for persistent. */
  duration?: number;
}): string {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const entry: ToastData = {
    id,
    title: opts.title,
    body: opts.body,
    priority: opts.priority ?? 'medium',
    category: opts.category,
    timestamp: Date.now(),
  };

  // Prepend (newest first), cap at MAX_VISIBLE
  toasts = [entry, ...toasts].slice(0, MAX_VISIBLE);
  emit();
  return id;
}

function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function clearAll() {
  toasts = [];
  emit();
}

/** Public API for pushing toasts from anywhere (hooks, services, event handlers). */
export const toastStore = {
  push: pushToast,
  remove: removeToast,
  clear: clearAll,
  subscribe,
  getSnapshot,
} as const;

// Expose for manual console testing: __toastStore.push({...})
// Uses try/catch because SES lockdown (browser extensions) may freeze globalThis.
try {
  (globalThis as Record<string, unknown>).__toastStore = toastStore;
} catch { /* SES-locked environment, console testing unavailable */ }

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

const DURATION_BY_PRIORITY: Record<ToastPriority, number> = {
  low: 5000,
  medium: 6000,
  high: 8000,
  critical: 10000,
};

export function ToastContainer() {
  const currentToasts = useSyncExternalStore(subscribe, getSnapshot);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDismiss = useCallback((id: string) => {
    removeToast(id);
  }, []);

  if (currentToasts.length === 0) return null;

  return (
    <div ref={containerRef} style={styles.container}>
      {currentToasts.map((t, i) => (
        <Toast
          key={t.id}
          toast={t}
          onDismiss={handleDismiss}
          duration={DURATION_BY_PRIORITY[t.priority]}
          index={i}
        />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none',
  },
};
