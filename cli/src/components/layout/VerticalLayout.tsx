/**
 * Vertical layout (no border) for narrow terminals.
 * Extracted from Dashboard.tsx.
 */

import React from "react";
import { Box, Text } from "ink";
import { MASCOT_ANSI } from "../../assets/mascot-ansi.js";
import { ACCENT_COLOR, MUTED_TEXT, SUCCESS_COLOR, ERROR_COLOR } from "./theme.js";
import { APP_ENDEARMENT } from "@jacques-ai/core";
import { buildBottomControls, MAIN_CONTROLS } from "../../utils/bottom-controls.js";
import { VERSION } from "../../version.js";

export interface VerticalLayoutProps {
  content: React.ReactNode[];
  title: string;
  showVersion: boolean;
  sessionCount?: number;
  notification?: string | null;
  /** Custom bottom controls. If omitted, default [Q]uit shown. */
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
  const mascotLines = MASCOT_ANSI.split("\n").filter((l) => l.trim().length > 0);
  const mascotCenter = Math.floor((mascotLines.length - 1) / 2);

  return (
    <Box flexDirection="column">
      {/* Spacer */}
      <Text> </Text>

      {/* Mascot + title rendered line-by-line */}
      {mascotLines.map((line, mi) => {
        const textLineIndex = mi - mascotCenter;
        if (textLineIndex >= 0 && textLineIndex <= 2) {
          let textContent: React.ReactNode;
          if (textLineIndex === 0) {
            textContent = <Text color={MUTED_TEXT}>{APP_ENDEARMENT}</Text>;
          } else if (textLineIndex === 1) {
            textContent = <Text bold color={ACCENT_COLOR}>{title}<Text color={MUTED_TEXT}> v{VERSION}</Text></Text>;
          } else {
            textContent = <Text color="white">Sessions Manager</Text>;
          }
          return (
            <Box key={`m-${mi}`} flexDirection="row">
              <Box flexDirection="column" flexShrink={0}>
                <Text wrap="truncate-end">{line}</Text>
              </Box>
              <Box marginLeft={2}>
                {textContent}
              </Box>
            </Box>
          );
        }
        return <Text key={`m-${mi}`} wrap="truncate-end">{line}</Text>;
      })}

      {/* Spacer */}
      <Text> </Text>

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
              <Text color={isError ? ERROR_COLOR : SUCCESS_COLOR}>
                {isError ? "✗" : "✓"} {cleanMessage}
              </Text>
            );
          })()
        ) : bottomControls ? (
          bottomControls
        ) : (
          buildBottomControls(MAIN_CONTROLS).element
        )}
      </Box>
    </Box>
  );
}
