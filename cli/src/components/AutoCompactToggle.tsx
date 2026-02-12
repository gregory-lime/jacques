/**
 * AutoCompactToggle Component
 *
 * Displays auto-compact status and allows toggling via keyboard shortcut [a].
 * Shows warning about the 78% bug when auto-compact is disabled.
 */

import React from "react";
import { Box, Text } from "ink";
import { MUTED_TEXT, SUCCESS_COLOR, WARNING_COLOR } from "./layout/theme.js";
import type { AutoCompactStatus } from "@jacques/core";

interface AutoCompactToggleProps {
  autocompact: AutoCompactStatus | null;
  onToggle?: () => void;
  showHint?: boolean;
}

export function AutoCompactToggle({
  autocompact,
  onToggle,
  showHint = true,
}: AutoCompactToggleProps): React.ReactElement {
  if (!autocompact) {
    return (
      <Box>
        <Text color={MUTED_TEXT}>Auto-compact: Unknown </Text>
        {showHint && <Text color={MUTED_TEXT}>[a] toggle</Text>}
      </Box>
    );
  }

  const { enabled, threshold, bug_threshold } = autocompact;

  return (
    <Box>
      <Text>Auto-compact: </Text>
      <Text color={enabled ? SUCCESS_COLOR : WARNING_COLOR} bold>
        [{enabled ? "ON" : "OFF"}]
      </Text>
      {enabled ? (
        <Text color={MUTED_TEXT}> at {threshold}%</Text>
      ) : (
        <Text color={WARNING_COLOR}> (bug@~{bug_threshold}%)</Text>
      )}
      {showHint && onToggle && <Text color={MUTED_TEXT}> [a] toggle</Text>}
    </Box>
  );
}

export default AutoCompactToggle;
