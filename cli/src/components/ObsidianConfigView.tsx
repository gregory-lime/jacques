/**
 * ObsidianConfigView Component
 *
 * Configure Obsidian vault path. Shows auto-detected vaults
 * and allows manual path entry.
 */

import React from "react";
import { Box, Text } from "ink";
import type { ObsidianVault } from "@jacques/core";
import {
  HorizontalLayout,
  VerticalLayout,
  ACCENT_COLOR,
  MUTED_TEXT,
  HORIZONTAL_LAYOUT_MIN_WIDTH,
  FIXED_CONTENT_HEIGHT,
} from "./layout/index.js";

const SUCCESS_COLOR = "#4ADE80";
const ERROR_COLOR = "#EF4444";

interface ObsidianConfigViewProps {
  vaults: ObsidianVault[];
  selectedIndex: number;
  manualPath: string;
  isManualMode: boolean;
  error: string | null;
  terminalWidth: number;
}

export function ObsidianConfigView({
  vaults,
  selectedIndex,
  manualPath,
  isManualMode,
  error,
  terminalWidth,
}: ObsidianConfigViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  // Total items: detected vaults + manual entry option
  const manualEntryIndex = vaults.length;
  const isManualSelected = selectedIndex === manualEntryIndex;

  // Build content lines
  const contentLines: React.ReactNode[] = [];

  // Title
  contentLines.push(
    <Text key="title" bold color={ACCENT_COLOR}>
      Configure Obsidian
    </Text>
  );

  // Separator
  contentLines.push(
    <Text key="sep" color={MUTED_TEXT}>
      {"─".repeat(35)}
    </Text>
  );

  // Detected vaults
  if (vaults.length > 0) {
    for (let i = 0; i < vaults.length; i++) {
      const vault = vaults[i];
      const isSelected = i === selectedIndex && !isManualMode;
      const textColor = isSelected ? ACCENT_COLOR : "white";

      contentLines.push(
        <Text key={vault.id} color={textColor} bold={isSelected}>
          {isSelected ? "> " : "  "}
          {vault.name}
          {vault.isOpen && <Text color={SUCCESS_COLOR}> (open)</Text>}
        </Text>
      );
    }
  } else {
    contentLines.push(
      <Text key="no-vaults" color={MUTED_TEXT}>
        No vaults detected
      </Text>
    );
  }

  // Manual entry option
  contentLines.push(
    <Text
      key="manual"
      color={isManualSelected ? ACCENT_COLOR : "white"}
      bold={isManualSelected}
    >
      {isManualSelected ? "> " : "  "}
      Enter path manually
    </Text>
  );

  // Manual path input (if in manual mode)
  if (isManualMode) {
    contentLines.push(
      <Text key="path-input" color="white">
        {"  "}Path: {manualPath}
        <Text color={ACCENT_COLOR}>_</Text>
      </Text>
    );
  }

  // Error message
  if (error) {
    contentLines.push(
      <Text key="error" color={ERROR_COLOR}>
        ✗ {error}
      </Text>
    );
  }

  // Pad to fixed height
  while (contentLines.length < FIXED_CONTENT_HEIGHT) {
    contentLines.push(<Box key={`pad-${contentLines.length}`} />);
  }

  const bottomControls = isManualMode ? (
    <>
      <Text color={ACCENT_COLOR}>[Enter]</Text>
      <Text color={MUTED_TEXT}> Confirm </Text>
      <Text color={ACCENT_COLOR}>[Esc]</Text>
      <Text color={MUTED_TEXT}> Cancel</Text>
    </>
  ) : (
    <>
      <Text color={ACCENT_COLOR}>[Enter]</Text>
      <Text color={MUTED_TEXT}> Select </Text>
      <Text color={ACCENT_COLOR}>[Esc]</Text>
      <Text color={MUTED_TEXT}> Back</Text>
    </>
  );

  return (
    <Box width={terminalWidth} flexDirection="column">
      {useHorizontalLayout ? (
        <HorizontalLayout
          content={contentLines}
          terminalWidth={terminalWidth}
          title="Jacques"
          showVersion={showVersion}
          bottomControls={bottomControls}
        />
      ) : (
        <VerticalLayout
          content={contentLines}
          title="Jacques"
          showVersion={showVersion}
          bottomControls={bottomControls}
        />
      )}
    </Box>
  );
}
