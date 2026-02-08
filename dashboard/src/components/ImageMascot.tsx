/**
 * ImageMascot Component
 *
 * Displays the ANSI art mascot from assets/jacsub.png
 */

import React from "react";
import { Box, Text } from "ink";
import { MASCOT_ANSI } from "../assets/mascot-ansi.js";

export function ImageMascot(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text>{MASCOT_ANSI}</Text>
    </Box>
  );
}
