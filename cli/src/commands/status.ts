/**
 * Status command — one-shot display of active sessions.
 */

import { withJacquesClient } from "./client-helper.js";

export async function showStatus(): Promise<void> {
  await withJacquesClient(({ sessions, focusedId }) => {
    if (sessions.length === 0) {
      console.log("No active Claude Code sessions");
    } else {
      console.log(`\nActive Sessions: ${sessions.length}\n`);

      for (const session of sessions) {
        const isFocused = session.session_id === focusedId;
        const marker = isFocused ? "▶" : " ";
        const title = session.session_title || "Untitled";
        const model =
          session.model?.display_name || session.model?.id || "?";
        const pct =
          session.context_metrics?.used_percentage.toFixed(1) || "?";
        const status = session.status;

        console.log(`${marker} [${model}] ${title}`);
        console.log(`   Status: ${status} | Context: ${pct}%`);
        console.log(`   Project: ${session.project}`);
        console.log("");
      }
    }
  });
}
