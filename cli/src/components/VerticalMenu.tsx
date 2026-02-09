/**
 * VerticalMenu Component
 *
 * Vertical list with selection indicator
 */

import React from "react";
import { Box, Text } from "ink";

export interface VerticalMenuItem {
  key: string;
  label: string;
  enabled: boolean;
}

interface VerticalMenuProps {
  items: VerticalMenuItem[];
  selectedIndex: number;
}

export function VerticalMenu({
  items,
  selectedIndex,
}: VerticalMenuProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        const textColor = item.enabled
          ? isSelected
            ? "#FF6600"
            : "white"
          : "gray";

        return (
          <Box key={item.key}>
            <Text color={textColor} bold={isSelected}>
              {isSelected ? "> " : "  "}
              {item.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
