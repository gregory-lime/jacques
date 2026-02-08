/**
 * AutoCompactToggle Component
 *
 * Displays auto-compact status and allows toggling via keyboard shortcut [a].
 * Shows warning about the 78% bug when auto-compact is disabled.
 */

import React from "react";
import { Box, Text } from "ink";
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
        <Text color="gray">Auto-compact: Unknown </Text>
        {showHint && <Text color="gray">[a] toggle</Text>}
      </Box>
    );
  }

  const { enabled, threshold, bug_threshold } = autocompact;

  return (
    <Box>
      <Text>Auto-compact: </Text>
      <Text color={enabled ? "green" : "yellow"} bold>
        [{enabled ? "ON" : "OFF"}]
      </Text>
      {enabled ? (
        <Text color="gray"> at {threshold}%</Text>
      ) : (
        <Text color="yellow"> (bug@~{bug_threshold}%)</Text>
      )}
      {showHint && onToggle && <Text color="gray"> [a] toggle</Text>}
    </Box>
  );
}

export default AutoCompactToggle;
