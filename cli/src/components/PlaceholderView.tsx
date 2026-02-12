/**
 * Placeholder View
 *
 * Simple "coming soon" placeholder for features not yet implemented.
 * Extracted from Dashboard.tsx.
 */

import React from "react";
import { Box, Text } from "ink";
import {
  HorizontalLayout,
  VerticalLayout,
  ACCENT_COLOR,
  MUTED_TEXT,
  HORIZONTAL_LAYOUT_MIN_WIDTH,
} from "./layout/index.js";

interface PlaceholderViewProps {
  title: string;
  feature: string;
  terminalWidth: number;
}

export function PlaceholderView({
  title,
  feature,
  terminalWidth,
}: PlaceholderViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 65;

  const contentLines: React.ReactNode[] = [
    <Text bold color={ACCENT_COLOR}>
      {title}
    </Text>,
    <Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>,
    <Box />,
    <Text color={MUTED_TEXT}>Coming soon</Text>,
    <Box />,
    <Text color={MUTED_TEXT}>This feature will allow you to {feature}.</Text>,
    <Box />,
    <Text color={MUTED_TEXT}>{"─".repeat(40)}</Text>,
    <Text color={MUTED_TEXT}>Press any key to go back...</Text>,
  ];

  return useHorizontalLayout ? (
    <HorizontalLayout
      content={contentLines}
      terminalWidth={terminalWidth}
      title="Jacques"
      showVersion={showVersion}
    />
  ) : (
    <VerticalLayout
      content={contentLines}
      title="Jacques"
      showVersion={showVersion}
    />
  );
}
