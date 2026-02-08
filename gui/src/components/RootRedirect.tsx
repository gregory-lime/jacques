/**
 * RootRedirect - Handles `/` by redirecting to the best active project.
 *
 * Priority:
 * 1. Focused session's project
 * 2. localStorage hint (last visited project)
 * 3. Most recent active project
 * 4. /archive fallback (no projects)
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJacquesClient } from '../hooks/useJacquesClient';
import { getProjectGroupKey } from '../utils/git';

export function RootRedirect() {
  const navigate = useNavigate();
  const { sessions, focusedSessionId, initialStateReceived } = useJacquesClient();

  useEffect(() => {
    // Wait until the server has delivered the initial session snapshot
    if (!initialStateReceived) return;

    // Priority 1: Focused session's project
    if (focusedSessionId) {
      const focused = sessions.find(s => s.session_id === focusedSessionId);
      if (focused) {
        const slug = getProjectGroupKey(focused);
        navigate(`/${slug}/sessions`, { replace: true });
        return;
      }
    }

    // Priority 2: localStorage hint (use even if no active sessions match)
    const lastSlug = localStorage.getItem('jacques:lastProjectSlug');

    // Priority 3: Most recent active session's project
    if (sessions.length > 0) {
      // Prefer localStorage slug if it still has active sessions
      if (lastSlug && sessions.some(s => getProjectGroupKey(s) === lastSlug)) {
        navigate(`/${lastSlug}/sessions`, { replace: true });
        return;
      }
      const sorted = [...sessions].sort((a, b) => b.last_activity - a.last_activity);
      const slug = getProjectGroupKey(sorted[0]);
      navigate(`/${slug}/sessions`, { replace: true });
      return;
    }

    // Priority 4: No active sessions — use last project slug so user stays
    // on the sessions page (empty state) rather than getting stuck on /archive
    if (lastSlug) {
      navigate(`/${lastSlug}/sessions`, { replace: true });
      return;
    }

    // Priority 5: Absolute fallback — no sessions ever, no localStorage
    navigate('/archive', { replace: true });
  }, [sessions, focusedSessionId, initialStateReceived, navigate]);

  // Show nothing while waiting for session data
  return null;
}
