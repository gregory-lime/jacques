/**
 * Bottom Controls Builder
 *
 * Builds bottom border controls JSX and auto-computes the character width
 * from the same data. This prevents off-by-one bugs from manual counting.
 */

import React from "react";
import { Text } from "ink";
import { ACCENT_COLOR, MUTED_TEXT } from "../components/layout/theme.js";

export interface ControlItem {
  /** Key shown in brackets, e.g. "Q", "Esc", "Enter". Use ASCII only — Unicode arrows like ↩ render as 2 cells in some terminals. */
  key: string;
  /** Label text after the key, e.g. "uit", " back", " focus " */
  label: string;
}

/**
 * Build bottom controls JSX element and compute its exact character width.
 * Width = sum of `[${key}]`.length + label.length for each item.
 */
export function buildBottomControls(items: ControlItem[]): {
  element: React.ReactNode;
  width: number;
} {
  let width = 0;
  const elements: React.ReactNode[] = [];

  items.forEach((item, i) => {
    const keyText = `[${item.key}]`;
    width += keyText.length + item.label.length;
    elements.push(
      <Text key={`k${i}`} color={ACCENT_COLOR}>{keyText}</Text>
    );
    if (item.label) {
      elements.push(
        <Text key={`l${i}`} color={MUTED_TEXT}>{item.label}</Text>
      );
    }
  });

  return { element: <>{elements}</>, width };
}

/** Default main menu controls: [Q]uit */
export const MAIN_CONTROLS: ControlItem[] = [
  { key: "Q", label: "uit" },
];
