/**
 * List command — output sessions as JSON.
 */

import { withJacquesClient } from "./client-helper.js";

export async function listSessions(): Promise<void> {
  await withJacquesClient(({ sessions, focusedId }) => {
    console.log(
      JSON.stringify(
        {
          focused_session_id: focusedId,
          sessions: sessions,
        },
        null,
        2,
      ),
    );
  });
}
