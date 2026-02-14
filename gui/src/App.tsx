import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RootRedirect } from './components/RootRedirect';
import { Dashboard } from './pages/Dashboard';
import { Archive } from './pages/Archive';
import { Artifacts } from './pages/Artifacts';
import { Settings } from './pages/Settings';
import { SessionViewer } from './pages/SessionViewer';
import { ProjectScopeProvider } from './hooks/useProjectScope.js';
import { OpenSessionsProvider } from './hooks/useOpenSessions';
import { FocusZoneProvider } from './hooks/useFocusZone';
import { ShortcutActionsProvider } from './hooks/useShortcutActions';
import { JacquesClientProvider } from './hooks/useJacquesClient';
import { ErrorBoundary } from './components/ui';

export function App() {
  return (
    <FocusZoneProvider>
    <ShortcutActionsProvider>
    <JacquesClientProvider>
    <ProjectScopeProvider>
      <OpenSessionsProvider>
        <ErrorBoundary level="app">
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* Root redirect → /:activeProject/sessions */}
            <Route index element={<RootRedirect />} />

            {/* Project-scoped routes */}
            <Route path=":projectSlug">
              <Route path="sessions" element={<Dashboard />} />
              <Route path="sessions/:sessionId" element={<SessionViewer />} />
              <Route path="artifacts" element={<Artifacts />} />
              {/* Bare project slug → redirect to sessions */}
              <Route index element={<Navigate to="sessions" replace />} />
            </Route>

            {/* Global routes (not project-scoped) */}
            <Route path="archive" element={<Archive />} />
            <Route path="settings" element={<Settings />} />

            {/* Catch-all → redirect to root */}
            <Route path="*" element={<RootRedirect />} />
          </Route>
        </Routes>
        </ErrorBoundary>
      </OpenSessionsProvider>
    </ProjectScopeProvider>
    </JacquesClientProvider>
    </ShortcutActionsProvider>
    </FocusZoneProvider>
  );
}
