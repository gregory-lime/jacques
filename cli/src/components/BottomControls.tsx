/**
 * BottomControls Component
 *
 * Displays keyboard shortcuts at the bottom of the dashboard
 */

import React from "react";
import { Text, Box } from "ink";
import { SECONDARY_COLOR } from "./layout/theme.js";

/**
 * Bottom control bar showing available keyboard shortcuts
 */
export function BottomControls(): React.ReactElement {
  return (
    <Box>
      <Text>
        <Text color={SECONDARY_COLOR}>[Q]</Text>
        <Text>uit  </Text>
        <Text color={SECONDARY_COLOR}>[S]</Text>
        <Text>ettings</Text>
      </Text>
    </Box>
  );
}

export default BottomControls;
