/**
 * Menu Component
 *
 * 5-button numbered menu for context management actions.
 * Each item can be enabled or disabled.
 */

import React from "react";
import { Box, Text } from "ink";

export interface MenuItem {
  key: string; // "1", "2", etc.
  icon: string; // "💾", "📂", etc.
  label: string; // "Save Current Context"
  enabled: boolean; // false for placeholders
}

interface MenuProps {
  items: MenuItem[];
  selectedKey: string | null;
  onSelect?: (key: string) => void;
}

// Default menu items
export const DEFAULT_MENU_ITEMS: MenuItem[] = [
  { key: "1", icon: "💾", label: "Save Current Context", enabled: true },
  { key: "2", icon: "📂", label: "Load Context", enabled: false },
  { key: "3", icon: "📝", label: "Create Handoff", enabled: true },
  { key: "4", icon: "⚙️ ", label: "Settings", enabled: false },
  { key: "5", icon: "❌", label: "Quit", enabled: true },
];

export function Menu({ items, selectedKey }: MenuProps): React.ReactElement {
  const boxWidth = 43;

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Top border */}
      <Text color="#FF6600">╭{"─".repeat(boxWidth)}╮</Text>

      {/* Menu items */}
      {items.map((item) => (
        <MenuItemRow
          key={item.key}
          item={item}
          isSelected={selectedKey === item.key}
          boxWidth={boxWidth}
        />
      ))}

      {/* Bottom border */}
      <Text color="#FF6600">╰{"─".repeat(boxWidth)}╯</Text>
    </Box>
  );
}

interface MenuItemRowProps {
  item: MenuItem;
  isSelected: boolean;
  boxWidth: number;
}

function MenuItemRow({
  item,
  isSelected,
  boxWidth,
}: MenuItemRowProps): React.ReactElement {
  const { key, icon, label, enabled } = item;

  // Build the label with proper spacing
  const content = `  [${key}] ${icon} ${label}`;
  const padding = boxWidth - content.length;
  const paddedContent = content + " ".repeat(Math.max(0, padding));

  // Determine styling
  const textColor = enabled ? (isSelected ? "cyan" : "white") : "gray";
  const borderColor = "#FF6600";

  return (
    <Text>
      <Text color={borderColor}>│</Text>
      <Text color={textColor} bold={isSelected}>
        {paddedContent}
      </Text>
      <Text color={borderColor}>│</Text>
    </Text>
  );
}

export default Menu;
