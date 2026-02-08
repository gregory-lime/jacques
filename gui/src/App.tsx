import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RootRedirect } from './components/RootRedirect';
import { Dashboard } from './pages/Dashboard';
import { Archive } from './pages/Archive';
import { Artifacts } from './pages/Artifacts';
import { Context } from './pages/Context';
import { Settings } from './pages/Settings';
import { Sources } from './pages/Sources';
import { GoogleDocsConnect } from './pages/GoogleDocsConnect';
import { NotionConnect } from './pages/NotionConnect';
import { SessionViewer } from './pages/SessionViewer';
import { ProjectScopeProvider } from './hooks/useProjectScope.js';
import { OpenSessionsProvider } from './hooks/useOpenSessions';

export function App() {
  return (
    <ProjectScopeProvider>
      <OpenSessionsProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* Root redirect → /:activeProject/sessions */}
            <Route index element={<RootRedirect />} />

            {/* Project-scoped routes */}
            <Route path=":projectSlug">
              <Route path="sessions" element={<Dashboard />} />
              <Route path="sessions/:sessionId" element={<SessionViewer />} />
              <Route path="artifacts" element={<Artifacts />} />
              <Route path="context" element={<Context />} />
              {/* Bare project slug → redirect to sessions */}
              <Route index element={<Navigate to="sessions" replace />} />
            </Route>

            {/* Global routes (not project-scoped) */}
            <Route path="archive" element={<Archive />} />
            <Route path="settings" element={<Settings />} />
            <Route path="sources" element={<Sources />} />
            <Route path="sources/google" element={<GoogleDocsConnect />} />
            <Route path="sources/notion" element={<NotionConnect />} />
            {/* OAuth callbacks (same components handle the callback) */}
            <Route path="oauth/google/callback" element={<GoogleDocsConnect />} />
            <Route path="oauth/notion/callback" element={<NotionConnect />} />

            {/* Catch-all → redirect to root */}
            <Route path="*" element={<RootRedirect />} />
          </Route>
        </Routes>
      </OpenSessionsProvider>
    </ProjectScopeProvider>
  );
}
