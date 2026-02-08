/**
 * AddContextConfirmView Component
 *
 * Confirmation dialog before adding a file to project context.
 * Shows file details and allows optional description input.
 * Uses the same bordered layout with mascot as the main dashboard.
 */

import React from "react";
import { Box, Text } from "ink";
import { MASCOT_ANSI } from "../assets/mascot-ansi.js";
import type { ObsidianFile } from "@jacques/core";
import {
  formatContextFileSize as formatFileSize,
  estimateTokensFromSize,
  formatContextTokenCount as formatTokenCount,
} from "@jacques/core";

const ACCENT_COLOR = "#E67E52";
const MUTED_TEXT = "#8B9296";
const BORDER_COLOR = "#E67E52";
const SUCCESS_COLOR = "#4ADE80";
const ERROR_COLOR = "#EF4444";
const MASCOT_WIDTH = 14;
const MIN_CONTENT_WIDTH = 42;
const CONTENT_PADDING = 2;
const HORIZONTAL_LAYOUT_MIN_WIDTH = 62;
const FIXED_CONTENT_HEIGHT = 10;

interface AddContextConfirmViewProps {
  file: ObsidianFile;
  description: string;
  terminalWidth: number;
  success?: { name: string; path: string } | null;
  error?: string | null;
}

export function AddContextConfirmView({
  file,
  description,
  terminalWidth,
  success,
  error,
}: AddContextConfirmViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  // Build content lines
  const contentLines: React.ReactNode[] = [];

  if (success) {
    // Success state
    contentLines.push(
      <Text key="success" color={SUCCESS_COLOR}>
        ✓ Context added
      </Text>
    );
    contentLines.push(
      <Text key="sep" color={MUTED_TEXT}>
        {"─".repeat(35)}
      </Text>
    );
    contentLines.push(<Box key="pad1" />);
    contentLines.push(
      <Text key="name">
        <Text bold>File:</Text> {success.name}
      </Text>
    );
    contentLines.push(
      <Text key="path" color={MUTED_TEXT}>
        Added to {success.path}
      </Text>
    );
  } else if (error) {
    // Error state
    contentLines.push(
      <Text key="title" bold color={ACCENT_COLOR}>
        Add to Context
      </Text>
    );
    contentLines.push(
      <Text key="sep" color={MUTED_TEXT}>
        {"─".repeat(35)}
      </Text>
    );
    contentLines.push(<Box key="pad1" />);
    contentLines.push(
      <Text key="error" color={ERROR_COLOR}>
        ✗ {error}
      </Text>
    );
  } else {
    // Confirm form
    contentLines.push(
      <Text key="title" bold color={ACCENT_COLOR}>
        Add to Context
      </Text>
    );
    contentLines.push(
      <Text key="sep" color={MUTED_TEXT}>
        {"─".repeat(35)}
      </Text>
    );
    contentLines.push(
      <Text key="file">
        <Text bold>File:</Text> {file.name}
      </Text>
    );
    contentLines.push(
      <Text key="size">
        <Text bold>Size:</Text> {formatFileSize(file.sizeBytes)}
      </Text>
    );
    const estimatedTokens = estimateTokensFromSize(file.sizeBytes);
    contentLines.push(
      <Text key="tokens">
        <Text bold>Tokens:</Text> ~{formatTokenCount(estimatedTokens)}
      </Text>
    );
    contentLines.push(<Box key="pad1" />);
    contentLines.push(
      <Text key="desc-label" color={MUTED_TEXT}>
        Description (optional):
      </Text>
    );
    contentLines.push(
      <Text key="desc-input">
        {description}
        <Text color={ACCENT_COLOR}>_</Text>
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
        <ConfirmHorizontalLayout
          content={contentLines}
          terminalWidth={terminalWidth}
          showVersion={showVersion}
          success={!!success}
          error={!!error}
        />
      ) : (
        <ConfirmVerticalLayout
          content={contentLines}
          showVersion={showVersion}
          success={!!success}
          error={!!error}
        />
      )}
    </Box>
  );
}

interface LayoutProps {
  content: React.ReactNode[];
  terminalWidth?: number;
  showVersion: boolean;
  success: boolean;
  error: boolean;
}

function ConfirmVerticalLayout({
  content,
  showVersion,
  success,
  error,
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
        {success ? (
          <Text color={MUTED_TEXT}>Press any key to continue...</Text>
        ) : error ? (
          <Text color={MUTED_TEXT}>[Esc] Back</Text>
        ) : (
          <Text color={MUTED_TEXT}>[Enter] Add [Esc] Cancel</Text>
        )}
      </Box>
    </Box>
  );
}

function ConfirmHorizontalLayout({
  content,
  terminalWidth = 80,
  showVersion,
  success,
  error,
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

  // Bottom controls change based on state
  let bottomControlsText: string;
  if (success) {
    bottomControlsText = "Press any key...";
  } else if (error) {
    bottomControlsText = "[Esc] Back";
  } else {
    bottomControlsText = "[Enter] Add [Esc] Cancel";
  }
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
        {success ? (
          <Text color={MUTED_TEXT}>Press any key...</Text>
        ) : error ? (
          <>
            <Text color={ACCENT_COLOR}>[Esc]</Text>
            <Text color={MUTED_TEXT}> Back</Text>
          </>
        ) : (
          <>
            <Text color={ACCENT_COLOR}>[Enter]</Text>
            <Text color={MUTED_TEXT}> Add </Text>
            <Text color={ACCENT_COLOR}>[Esc]</Text>
            <Text color={MUTED_TEXT}> Cancel</Text>
          </>
        )}
        <Text color={BORDER_COLOR}>{"─".repeat(bottomRightBorder)}╯</Text>
      </Box>
    </Box>
  );
}
