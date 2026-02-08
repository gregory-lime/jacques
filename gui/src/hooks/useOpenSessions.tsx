import { createContext, useContext, useReducer, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useProjectScope } from './useProjectScope.js';

export interface OpenSession {
  id: string;
  type: 'active' | 'archived';
  title: string;
  project?: string;
  openedAt: number;
}

interface OpenSessionsState {
  sessions: OpenSession[];
  activeViewId: string | null;
}

type Action =
  | { type: 'OPEN_SESSION'; payload: OpenSession }
  | { type: 'CLOSE_SESSION'; payload: string }
  | { type: 'VIEW_SESSION'; payload: string }
  | { type: 'VIEW_DASHBOARD' }
  | { type: 'UPDATE_TITLE'; payload: { id: string; title: string } }
  | { type: 'SWITCH_PROJECT'; payload: OpenSession[] };

const STORAGE_KEY_PREFIX = 'jacques-open-sessions';

function storageKey(projectSlug: string | null): string {
  return projectSlug ? `${STORAGE_KEY_PREFIX}:${projectSlug}` : STORAGE_KEY_PREFIX;
}

function loadPersistedSessions(projectSlug: string | null): OpenSession[] {
  try {
    const raw = localStorage.getItem(storageKey(projectSlug));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

function persistSessions(projectSlug: string | null, sessions: OpenSession[]) {
  try {
    localStorage.setItem(storageKey(projectSlug), JSON.stringify(sessions));
  } catch {
    // ignore
  }
}

function reducer(state: OpenSessionsState, action: Action): OpenSessionsState {
  switch (action.type) {
    case 'OPEN_SESSION': {
      const exists = state.sessions.find(s => s.id === action.payload.id);
      if (exists) {
        return { ...state, activeViewId: action.payload.id };
      }
      return {
        sessions: [...state.sessions, action.payload],
        activeViewId: action.payload.id,
      };
    }
    case 'CLOSE_SESSION': {
      const next = state.sessions.filter(s => s.id !== action.payload);
      return {
        sessions: next,
        activeViewId: state.activeViewId === action.payload ? null : state.activeViewId,
      };
    }
    case 'VIEW_SESSION': {
      const found = state.sessions.find(s => s.id === action.payload);
      if (!found) return state;
      return { ...state, activeViewId: action.payload };
    }
    case 'VIEW_DASHBOARD':
      return { ...state, activeViewId: null };
    case 'UPDATE_TITLE': {
      return {
        ...state,
        sessions: state.sessions.map(s =>
          s.id === action.payload.id ? { ...s, title: action.payload.title } : s
        ),
      };
    }
    case 'SWITCH_PROJECT':
      return { sessions: action.payload, activeViewId: null };
    default:
      return state;
  }
}

interface OpenSessionsContextValue {
  state: OpenSessionsState;
  openSession: (session: Omit<OpenSession, 'openedAt'>) => void;
  closeSession: (id: string) => void;
  viewSession: (id: string) => void;
  viewDashboard: () => void;
  updateTitle: (id: string, title: string) => void;
}

const OpenSessionsContext = createContext<OpenSessionsContextValue | null>(null);

export function OpenSessionsProvider({ children }: { children: ReactNode }) {
  const { selectedProject } = useProjectScope();
  const projectRef = useRef(selectedProject);

  const [state, dispatch] = useReducer(reducer, {
    sessions: loadPersistedSessions(selectedProject),
    activeViewId: null,
  });

  // When project changes, save current sessions and load new project's sessions
  useEffect(() => {
    if (selectedProject !== projectRef.current) {
      projectRef.current = selectedProject;
      dispatch({ type: 'SWITCH_PROJECT', payload: loadPersistedSessions(selectedProject) });
    }
  }, [selectedProject]);

  // Persist sessions to localStorage on change
  useEffect(() => {
    persistSessions(projectRef.current, state.sessions);
  }, [state.sessions]);

  const openSession = useCallback((session: Omit<OpenSession, 'openedAt'>) => {
    dispatch({ type: 'OPEN_SESSION', payload: { ...session, openedAt: Date.now() } });
  }, []);

  const closeSession = useCallback((id: string) => {
    dispatch({ type: 'CLOSE_SESSION', payload: id });
  }, []);

  const viewSession = useCallback((id: string) => {
    dispatch({ type: 'VIEW_SESSION', payload: id });
  }, []);

  const viewDashboard = useCallback(() => {
    dispatch({ type: 'VIEW_DASHBOARD' });
  }, []);

  const updateTitle = useCallback((id: string, title: string) => {
    dispatch({ type: 'UPDATE_TITLE', payload: { id, title } });
  }, []);

  return (
    <OpenSessionsContext.Provider value={{ state, openSession, closeSession, viewSession, viewDashboard, updateTitle }}>
      {children}
    </OpenSessionsContext.Provider>
  );
}

export function useOpenSessions(): OpenSessionsContextValue {
  const ctx = useContext(OpenSessionsContext);
  if (!ctx) {
    throw new Error('useOpenSessions must be used within OpenSessionsProvider');
  }
  return ctx;
}
