/**
 * Filter Selection View
 *
 * Shows filter options with token estimates for saving contexts.
 */

import React from "react";
import { Box, Text } from "ink";
import {
  formatSessionTokenCount as formatTokenCount,
  FILTER_CONFIGS,
  FilterType,
} from "@jacques/core";
import { ACCENT_COLOR } from "./layout/theme.js";
import type { FilterTokenEstimates } from "@jacques/core";

interface FilterSelectionViewProps {
  estimates: FilterTokenEstimates;
  selectedFilterIndex: number;
  terminalWidth: number;
}

const FILTER_ORDER = [
  FilterType.EVERYTHING,
  FilterType.WITHOUT_TOOLS,
  FilterType.MESSAGES_ONLY,
];

export function FilterSelectionView({
  estimates,
  selectedFilterIndex,
  terminalWidth,
}: FilterSelectionViewProps): React.ReactElement {
  const isHorizontal = terminalWidth >= 60;

  return (
    <Box flexDirection="column" gap={0}>
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color={ACCENT_COLOR}>
          Select save format
        </Text>
      </Box>

      {/* Filter options */}
      {FILTER_ORDER.map((filterType, index) => {
        const config = FILTER_CONFIGS[filterType];
        const estimate = estimates[filterType];
        const isSelected = index === selectedFilterIndex;

        const currentTokens = formatTokenCount(estimate.current);
        const filteredTokens = formatTokenCount(estimate.filtered);
        const savings =
          estimate.savings > 0
            ? ` (-${estimate.savingsPercent.toFixed(0)}%)`
            : "";

        const tokenDisplay =
          estimate.savings === 0
            ? `${currentTokens} tokens (no change)`
            : `${currentTokens} → ${filteredTokens} tokens${savings}`;

        return (
          <Box key={filterType} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={isSelected ? ACCENT_COLOR : "white"}>
                {isSelected ? "> " : "  "}
                <Text bold={isSelected}>{config.label}</Text>
              </Text>
            </Box>
            <Box marginLeft={4}>
              <Text dimColor>{tokenDisplay}</Text>
            </Box>
          </Box>
        );
      })}

      {/* Bottom controls */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>[↑↓] Navigate • [Enter] Select • [Esc] Cancel</Text>
      </Box>
    </Box>
  );
}
