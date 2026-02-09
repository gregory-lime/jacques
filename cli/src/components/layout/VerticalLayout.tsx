/**
 * Vertical layout (no border) for narrow terminals.
 * Extracted from Dashboard.tsx.
 */

import React from "react";
import { Box, Text } from "ink";
import { MASCOT_ANSI } from "../../assets/mascot-ansi.js";
import { ACCENT_COLOR, MUTED_TEXT } from "./theme.js";

export interface VerticalLayoutProps {
  content: React.ReactNode[];
  title: string;
  showVersion: boolean;
  sessionCount?: number;
  notification?: string | null;
  /** Custom bottom controls. If omitted, default [Q]uit [S]ettings [A]ctive [P]roject shown. */
  bottomControls?: React.ReactNode;
}

export function VerticalLayout({
  content,
  title,
  showVersion,
  sessionCount,
  notification,
  bottomControls,
}: VerticalLayoutProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {/* Title */}
      <Text bold color={ACCENT_COLOR}>
        {title}
        {showVersion && <Text color={MUTED_TEXT}> v0.1.0</Text>}
      </Text>

      {/* Mascot - no width constraint, wrap=truncate-end for ANSI codes */}
      <Box marginTop={1}>
        <Text wrap="truncate-end">{MASCOT_ANSI}</Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" marginTop={1}>
        {content.map((line, index) => (
          <Box key={index}>{line}</Box>
        ))}
      </Box>

      {/* Bottom - notification or controls */}
      <Box marginTop={1}>
        {notification ? (
          (() => {
            const isError = notification.startsWith("!");
            const cleanMessage = isError ? notification.slice(1) : notification;
            return (
              <Text color={isError ? "red" : "green"}>
                {isError ? "✗" : "✓"} {cleanMessage}
              </Text>
            );
          })()
        ) : bottomControls ? (
          bottomControls
        ) : (
          <Text>
            <Text color={ACCENT_COLOR}>[Q]</Text>
            <Text color={MUTED_TEXT}>uit </Text>
            <Text color={ACCENT_COLOR}>[S]</Text>
            <Text color={MUTED_TEXT}>ettings</Text>
            {sessionCount !== undefined && (
              <>
                <Text color={ACCENT_COLOR}> [A]</Text>
                <Text color={MUTED_TEXT}>ctive ({sessionCount})</Text>
              </>
            )}
            <Text color={ACCENT_COLOR}> [P]</Text>
            <Text color={MUTED_TEXT}>roject</Text>
          </Text>
        )}
      </Box>
    </Box>
  );
}
