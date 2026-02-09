/**
 * AddContextConfirmView Component
 *
 * Confirmation dialog before adding a file to project context.
 * Shows file details and allows optional description input.
 */

import React from "react";
import { Box, Text } from "ink";
import type { ObsidianFile } from "@jacques/core";
import {
  formatContextFileSize as formatFileSize,
  estimateTokensFromSize,
  formatContextTokenCount as formatTokenCount,
} from "@jacques/core";
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

  const bottomControls = success ? (
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
