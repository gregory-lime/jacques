/**
 * SessionViewer - Route-based session viewer page
 *
 * Renders ActiveSessionViewer for the session ID from the URL.
 * Syncs with useOpenSessions to keep the sidebar list in sync.
 */

import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ActiveSessionViewer } from '../components/ActiveSessionViewer';
import { useOpenSessions } from '../hooks/useOpenSessions';

export function SessionViewer() {
  const { projectSlug, sessionId } = useParams<{ projectSlug: string; sessionId: string }>();
  const navigate = useNavigate();
  const { openSession } = useOpenSessions();

  // Register this session in the open sessions list
  useEffect(() => {
    if (sessionId) {
      openSession({
        id: sessionId,
        type: 'active',
        title: 'Loading...',
      });
    }
  }, [sessionId, openSession]);

  if (!sessionId || !projectSlug) {
    return null;
  }

  const handleBack = () => {
    navigate(`/${projectSlug}/sessions`);
  };

  return (
    <ActiveSessionViewer
      sessionId={sessionId}
      onBack={handleBack}
    />
  );
}
