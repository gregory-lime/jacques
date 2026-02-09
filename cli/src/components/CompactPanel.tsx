/**
 * CompactPanel Component
 *
 * Shows manual compact workflow instructions and copy buttons
 * when context usage exceeds a threshold (e.g., 70%).
 *
 * Panel States:
 * 1. Hidden - Context below threshold
 * 2. Warning - Shows instructions + "Copy Compact Prompt" hint
 * 3. Ready - Handoff file detected, shows "Copy Handoff Content" hint
 */

import React from "react";
import { Box, Text } from "ink";
import type { Session } from "@jacques/core";

interface CompactPanelProps {
  session: Session | undefined;
  handoffReady?: boolean;
  onCopyPrompt?: () => void;
  onCopyHandoff?: () => void;
}

// Thresholds for showing the panel
const WARNING_THRESHOLD = 70;
const DANGER_THRESHOLD = 78;

export function CompactPanel({
  session,
  handoffReady = false,
  onCopyPrompt,
  onCopyHandoff,
}: CompactPanelProps): React.ReactElement | null {
  if (!session) {
    return null;
  }

  const contextUsed = session.context_metrics?.used_percentage ?? 0;
  const autocompact = session.autocompact;

  // Determine the effective danger threshold
  // If auto-compact is disabled, the bug may trigger at 78%
  const effectiveDangerThreshold =
    autocompact && !autocompact.enabled && autocompact.bug_threshold
      ? autocompact.bug_threshold
      : (autocompact?.threshold ?? 95);

  // Don't show if context is below warning threshold
  if (contextUsed < WARNING_THRESHOLD) {
    return null;
  }

  // Determine panel state and styling
  const isDanger = contextUsed >= effectiveDangerThreshold - 5;
  const isHighWarning = contextUsed >= WARNING_THRESHOLD;
  const borderColor = isDanger ? "red" : isHighWarning ? "yellow" : "gray";

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      paddingX={1}
      marginTop={1}
    >
      {/* Panel Title */}
      <Box>
        <Text bold color={isDanger ? "red" : "yellow"}>
          {isDanger ? "⚠️ CONTEXT CRITICAL" : "📋 COMPACT WORKFLOW"}
        </Text>
      </Box>

      {/* Warning Message */}
      {isDanger ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="red" bold>
            Context at {contextUsed.toFixed(0)}% - DANGER! Auto-compact may
            trigger at ~{effectiveDangerThreshold}%!
          </Text>
          <Text color="red">Create handoff NOW before context is lost.</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color="yellow">
            Context at {contextUsed.toFixed(0)}% - Create handoff before ~78%
            bug triggers.
          </Text>
        </Box>
      )}

      {/* Instructions */}
      <Box marginTop={1} flexDirection="column">
        {handoffReady ? (
          <>
            <Text color="green" bold>
              ✓ Handoff file ready: .jacques-handoff.md
            </Text>
            <Text>Press [h] to copy, then:</Text>
            <Text color="cyan">
              1. Close this Claude Code session (type /exit or Ctrl+C)
            </Text>
            <Text color="cyan">2. Start a NEW Claude Code session</Text>
            <Text color="cyan">3. Paste the handoff content to continue</Text>
          </>
        ) : (
          <>
            <Text>1. Press [c] to copy the compact prompt</Text>
            <Text>2. Paste it into the Claude Code chat</Text>
            <Text>3. Claude will create .jacques-handoff.md</Text>
            <Text color="cyan" bold>
              4. Close Claude Code and start a NEW session
            </Text>
            <Text>5. Paste the handoff to continue your work</Text>
          </>
        )}
      </Box>

      {/* Keyboard shortcuts */}
      <Box marginTop={1}>
        <Text color="gray">
          {handoffReady
            ? "[h] Copy handoff  [c] Copy prompt  [a] Toggle auto-compact"
            : "[c] Copy prompt  [a] Toggle auto-compact"}
        </Text>
      </Box>
    </Box>
  );
}

export default CompactPanel;
