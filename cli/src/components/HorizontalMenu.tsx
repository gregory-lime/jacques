/**
 * HorizontalMenu Component
 *
 * Arrow-navigable horizontal button menu
 */

import React from "react";
import { Text, Box } from "ink";

export interface MenuItem {
  key: string;
  label: string;
  enabled: boolean;
}

interface HorizontalMenuProps {
  items: MenuItem[];
  selectedIndex: number;
}

/**
 * Horizontal menu with arrow navigation
 * - Selected + enabled: "> Button" (cyan, bold)
 * - Unselected + enabled: "  Button" (white)
 * - Disabled: "  Button" (gray, dim)
 */
export function HorizontalMenu({ items, selectedIndex }: HorizontalMenuProps): React.ReactElement {
  return (
    <Box marginLeft={4}>
      {items.map((item, index) => {
        const isSelected = index === selectedIndex && item.enabled;
        const prefix = isSelected ? "> " : "  ";
        const color = isSelected ? "cyan" : item.enabled ? "white" : "gray";
        const bold = isSelected;

        return (
          <Text key={item.key}>
            {prefix}
            <Text color={color} bold={bold} dimColor={!item.enabled}>
              {item.label}
            </Text>
            {index < items.length - 1 && "    "}
          </Text>
        );
      })}
    </Box>
  );
}

export default HorizontalMenu;
