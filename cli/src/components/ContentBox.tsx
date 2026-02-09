/**
 * ContentBox Component
 *
 * Bordered box container with orange (#FF6600) borders
 * Wraps content in side borders automatically
 */

import React from "react";
import { Box, Text } from "ink";

interface ContentBoxProps {
  children: React.ReactNode;
  width?: number;
}

/**
 * Wrap a single line of content with side borders
 */
function BorderedLine({
  children,
  width,
}: {
  children: React.ReactNode;
  width: number;
}): React.ReactElement {
  const borderColor = "#FF6600";

  return (
    <Box>
      <Text color={borderColor}>│</Text>
      <Box width={width} flexShrink={0}>
        {children}
      </Box>
      <Text color={borderColor}>│</Text>
    </Box>
  );
}

export function ContentBox({
  children,
  width = 48,
}: ContentBoxProps): React.ReactElement {
  const borderColor = "#FF6600";

  // Convert children to array for mapping
  const childArray = React.Children.toArray(children);

  return (
    <Box flexDirection="column">
      {/* Top border */}
      <Text color={borderColor}>╭{"─".repeat(width)}╮</Text>

      {/* Content with side borders */}
      {childArray.map((child, index) => (
        <BorderedLine key={index} width={width}>
          {child}
        </BorderedLine>
      ))}

      {/* Bottom border */}
      <Text color={borderColor}>╰{"─".repeat(width)}╯</Text>
    </Box>
  );
}
