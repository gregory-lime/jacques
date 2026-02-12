/**
 * OptionsStep — interactive checkboxes for optional features.
 */

import React from "react";
import { Text } from "ink";
import {
  ACCENT_COLOR,
  MUTED_TEXT,
  SUCCESS_COLOR,
} from "../layout/theme.js";
import type { SetupOptions } from "@jacques/core";

const OPTION_ITEMS = [
  {
    key: "installStatusLine" as const,
    label: "StatusLine",
    desc: "Show context % in Claude Code status bar",
  },
  {
    key: "installSkills" as const,
    label: "Skills",
    desc: "Install /jacques-handoff and /jacques-continue",
  },
];

export function buildOptionsContent(
  options: SetupOptions,
  selectedIndex: number,
): React.ReactNode[] {
  const lines: React.ReactNode[] = [];

  lines.push(<Text key="heading" color="white" bold>Configuration Options</Text>);
  lines.push(<Text key="spacer-1"> </Text>);
  lines.push(
    <Text key="hooks">
      <Text color={SUCCESS_COLOR}>✓</Text>
      <Text color={MUTED_TEXT}> Hooks (required — 5 hooks always installed)</Text>
    </Text>,
  );
  lines.push(<Text key="spacer-2"> </Text>);
  lines.push(<Text key="optional-label" color={ACCENT_COLOR}>Optional:</Text>);

  for (let i = 0; i < OPTION_ITEMS.length; i++) {
    const item = OPTION_ITEMS[i];
    const isSelected = i === selectedIndex;
    const isChecked = options[item.key];
    const checkbox = isChecked ? "[x]" : "[ ]";
    const cursor = isSelected ? "›" : " ";

    lines.push(
      <Text key={item.key}>
        <Text color={isSelected ? ACCENT_COLOR : MUTED_TEXT}>{cursor}</Text>
        {" "}
        <Text color={isSelected ? ACCENT_COLOR : "white"}>{checkbox}</Text>
        {" "}
        <Text color={isSelected ? ACCENT_COLOR : "white"} bold={isSelected}>
          {item.label}
        </Text>
        <Text color={MUTED_TEXT}> — {item.desc}</Text>
      </Text>,
    );
  }

  // Pad to 9 lines
  while (lines.length < 9) {
    lines.push(<Text key={`pad-${lines.length}`}> </Text>);
  }

  return lines;
}

export const OPTIONS_COUNT = OPTION_ITEMS.length;
export const OPTION_KEYS = OPTION_ITEMS.map((item) => item.key);
