/**
 * Animated braille spinner for the setup wizard.
 */

import React, { useState, useEffect } from "react";
import { Text } from "ink";
import { ACCENT_COLOR } from "../layout/theme.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL = 80;

interface SpinnerProps {
  color?: string;
}

export function Spinner({ color = ACCENT_COLOR }: SpinnerProps): React.ReactElement {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % FRAMES.length);
    }, INTERVAL);
    return () => clearInterval(timer);
  }, []);

  return <Text color={color}>{FRAMES[index]}</Text>;
}
