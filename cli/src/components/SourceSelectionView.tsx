/**
 * SourceSelectionView Component
 *
 * Shows available external sources (Obsidian, Google Docs, Notion).
 * Uses the same bordered layout with mascot as the main dashboard.
 */

import React from "react";
import { Box, Text } from "ink";
import { MASCOT_ANSI } from "../assets/mascot-ansi.js";
import { ACCENT_COLOR, MUTED_TEXT, BORDER_COLOR, SUCCESS_COLOR } from "./layout/index.js";
const MASCOT_WIDTH = 14;
const MIN_CONTENT_WIDTH = 42;
const CONTENT_PADDING = 2;
const HORIZONTAL_LAYOUT_MIN_WIDTH = 62;
const FIXED_CONTENT_HEIGHT = 10;

export interface SourceItem {
  key: string;
  label: string;
  connected: boolean;
  enabled: boolean;
  statusText?: string;
}

interface SourceSelectionViewProps {
  sources: SourceItem[];
  selectedIndex: number;
  terminalWidth: number;
}

export function SourceSelectionView({
  sources,
  selectedIndex,
  terminalWidth,
}: SourceSelectionViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  // Build content lines
  const contentLines: React.ReactNode[] = [];

  // Title
  contentLines.push(
    <Text key="title" bold color={ACCENT_COLOR}>
      Select Source
    </Text>
  );

  // Separator
  contentLines.push(
    <Text key="sep" color={MUTED_TEXT}>
      {"─".repeat(35)}
    </Text>
  );

  // Source list
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const isSelected = i === selectedIndex;
    const textColor = source.enabled
      ? isSelected
        ? ACCENT_COLOR
        : "white"
      : MUTED_TEXT;

    // Status indicator
    let statusElement: React.ReactNode = null;
    if (!source.enabled) {
      statusElement = <Text color={MUTED_TEXT}> (coming soon)</Text>;
    } else if (source.connected) {
      statusElement = <Text color={SUCCESS_COLOR}> ● Connected</Text>;
    } else if (source.statusText) {
      // Show custom status text (e.g., "Connect via GUI")
      statusElement = <Text color={MUTED_TEXT}> ○ {source.statusText}</Text>;
    } else {
      statusElement = <Text color={MUTED_TEXT}> ○ Not connected</Text>;
    }

    contentLines.push(
      <Text key={source.key} color={textColor} bold={isSelected}>
        {isSelected ? "> " : "  "}
        {source.label}
        {statusElement}
      </Text>
    );
  }

  // Pad to fixed height
  while (contentLines.length < FIXED_CONTENT_HEIGHT) {
    contentLines.push(<Box key={`pad-${contentLines.length}`} />);
  }

  return (
    <Box width={terminalWidth} flexDirection="column">
      {useHorizontalLayout ? (
        <SourceHorizontalLayout
          content={contentLines}
          terminalWidth={terminalWidth}
          showVersion={showVersion}
        />
      ) : (
        <SourceVerticalLayout content={contentLines} showVersion={showVersion} />
      )}
    </Box>
  );
}

interface LayoutProps {
  content: React.ReactNode[];
  terminalWidth?: number;
  showVersion: boolean;
}

function SourceVerticalLayout({
  content,
  showVersion,
}: LayoutProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold color={ACCENT_COLOR}>
        Jacques
        {showVersion && <Text color={MUTED_TEXT}> v0.1.0</Text>}
      </Text>

      <Box marginTop={1}>
        <Text wrap="truncate-end">{MASCOT_ANSI}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {content.map((line, index) => (
          <Box key={index}>{line}</Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color={MUTED_TEXT}>[↑↓] Navigate [Enter] Select [Esc] Back</Text>
      </Box>
    </Box>
  );
}

function SourceHorizontalLayout({
  content,
  terminalWidth = 80,
  showVersion,
}: LayoutProps): React.ReactElement {
  const mascotVisualWidth = MASCOT_WIDTH;
  const mascotPadding = 3;
  const mascotDisplayWidth = mascotVisualWidth + mascotPadding;

  const contentWidth = Math.max(
    MIN_CONTENT_WIDTH,
    terminalWidth - mascotDisplayWidth - 3
  );

  const mascotLines = MASCOT_ANSI.split("\n").filter(
    (line) => line.trim().length > 0
  );

  const mascotHeight = mascotLines.length;
  const totalHeight = FIXED_CONTENT_HEIGHT;
  const mascotTopPadding = Math.floor((totalHeight - mascotHeight) / 2);

  const visibleContent = content.slice(0, totalHeight);

  const titlePart = "─ Jacques";
  const versionPart = showVersion ? " v0.1.0" : "";
  const titleLength = titlePart.length + versionPart.length;
  const remainingBorder = Math.max(0, terminalWidth - titleLength - 3);

  const bottomControlsText = "[Enter] Select [Esc] Back";
  const bottomControlsLength = bottomControlsText.length;
  const totalBottomDashes = terminalWidth - bottomControlsLength - 2;
  const bottomLeftBorder = Math.max(0, Math.floor(totalBottomDashes / 2));
  const bottomRightBorder = Math.max(0, totalBottomDashes - bottomLeftBorder);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={BORDER_COLOR}>╭</Text>
        <Text color={ACCENT_COLOR}>{titlePart}</Text>
        {showVersion && <Text color={MUTED_TEXT}>{versionPart}</Text>}
        <Text color={BORDER_COLOR}> {"─".repeat(remainingBorder)}╮</Text>
      </Box>

      {Array.from({ length: totalHeight }).map((_, rowIndex) => {
        const mascotLineIndex = rowIndex - mascotTopPadding;
        const mascotLine =
          mascotLineIndex >= 0 && mascotLineIndex < mascotLines.length
            ? mascotLines[mascotLineIndex]
            : "";

        const contentLine = visibleContent[rowIndex];

        return (
          <Box key={rowIndex} flexDirection="row">
            <Text color={BORDER_COLOR}>│</Text>
            <Box
              width={mascotDisplayWidth}
              justifyContent="center"
              flexShrink={0}
            >
              <Text wrap="truncate-end">{mascotLine}</Text>
            </Box>
            <Text color={BORDER_COLOR}>│</Text>
            <Box
              width={contentWidth}
              paddingLeft={CONTENT_PADDING}
              paddingRight={CONTENT_PADDING}
              flexShrink={0}
            >
              {contentLine || <Text> </Text>}
            </Box>
            <Text color={BORDER_COLOR}>│</Text>
          </Box>
        );
      })}

      <Box>
        <Text color={BORDER_COLOR}>╰{"─".repeat(bottomLeftBorder)}</Text>
        <Text color={ACCENT_COLOR}>[Enter]</Text>
        <Text color={MUTED_TEXT}> Select </Text>
        <Text color={ACCENT_COLOR}>[Esc]</Text>
        <Text color={MUTED_TEXT}> Back</Text>
        <Text color={BORDER_COLOR}>{"─".repeat(bottomRightBorder)}╯</Text>
      </Box>
    </Box>
  );
}

/**
 * Build source items list from config state
 */
export function buildSourceItems(
  isObsidianConnected: boolean,
  isGoogleDocsConnected: boolean = false,
  isNotionConnected: boolean = false
): SourceItem[] {
  return [
    {
      key: "obsidian",
      label: "Obsidian",
      connected: isObsidianConnected,
      enabled: true,
    },
    {
      key: "google_docs",
      label: "Google Docs",
      connected: isGoogleDocsConnected,
      enabled: true,
      statusText: isGoogleDocsConnected ? undefined : "Connect via GUI (localhost:5173)",
    },
    {
      key: "notion",
      label: "Notion",
      connected: isNotionConnected,
      enabled: true,
      statusText: isNotionConnected ? undefined : "Connect via GUI (localhost:5173)",
    },
  ];
}
