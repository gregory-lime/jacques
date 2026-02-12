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
import { ACCENT_COLOR, MUTED_TEXT, ERROR_COLOR, WARNING_COLOR, SUCCESS_COLOR } from "./layout/theme.js";
import type { Session } from "@jacques-ai/core";

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
  const borderColor = isDanger ? ERROR_COLOR : isHighWarning ? WARNING_COLOR : MUTED_TEXT;

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
        <Text bold color={isDanger ? ERROR_COLOR : WARNING_COLOR}>
          {isDanger ? "⚠️ CONTEXT CRITICAL" : "📋 COMPACT WORKFLOW"}
        </Text>
      </Box>

      {/* Warning Message */}
      {isDanger ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={ERROR_COLOR} bold>
            Context at {contextUsed.toFixed(0)}% - DANGER! Auto-compact may
            trigger at ~{effectiveDangerThreshold}%!
          </Text>
          <Text color={ERROR_COLOR}>Create handoff NOW before context is lost.</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color={WARNING_COLOR}>
            Context at {contextUsed.toFixed(0)}% - Create handoff before ~78%
            bug triggers.
          </Text>
        </Box>
      )}

      {/* Instructions */}
      <Box marginTop={1} flexDirection="column">
        {handoffReady ? (
          <>
            <Text color={SUCCESS_COLOR} bold>
              ✓ Handoff file ready: .jacques-handoff.md
            </Text>
            <Text>Press [h] to copy, then:</Text>
            <Text color={ACCENT_COLOR}>
              1. Close this Claude Code session (type /exit or Ctrl+C)
            </Text>
            <Text color={ACCENT_COLOR}>2. Start a NEW Claude Code session</Text>
            <Text color={ACCENT_COLOR}>3. Paste the handoff content to continue</Text>
          </>
        ) : (
          <>
            <Text>1. Press [c] to copy the compact prompt</Text>
            <Text>2. Paste it into the Claude Code chat</Text>
            <Text>3. Claude will create .jacques-handoff.md</Text>
            <Text color={ACCENT_COLOR} bold>
              4. Close Claude Code and start a NEW session
            </Text>
            <Text>5. Paste the handoff to continue your work</Text>
          </>
        )}
      </Box>

      {/* Keyboard shortcuts */}
      <Box marginTop={1}>
        <Text color={MUTED_TEXT}>
          {handoffReady
            ? "[h] Copy handoff  [c] Copy prompt  [a] Toggle auto-compact"
            : "[c] Copy prompt  [a] Toggle auto-compact"}
        </Text>
      </Box>
    </Box>
  );
}

export default CompactPanel;
