/**
 * ScanningIndicator Component
 *
 * Animated "Scanning for sessions..." indicator shown during
 * server startup while session discovery is in progress.
 */

import React, { useState, useEffect } from "react";
import { Text } from "ink";
import { ACCENT_COLOR } from "../layout/theme.js";

const SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

export function ScanningIndicator(): React.ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <Text color={ACCENT_COLOR}>
      {SPINNER_FRAMES[frame]} Scanning for sessions...
    </Text>
  );
}
