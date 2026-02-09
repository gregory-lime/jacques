/**
 * BottomControls Component
 *
 * Displays keyboard shortcuts at the bottom of the dashboard
 */

import React from "react";
import { Text, Box } from "ink";

/**
 * Bottom control bar showing available keyboard shortcuts
 */
export function BottomControls(): React.ReactElement {
  return (
    <Box>
      <Text>
        <Text color="#FF6600">[Q]</Text>
        <Text>uit  </Text>
        <Text color="#FF6600">[S]</Text>
        <Text>ettings</Text>
      </Text>
    </Box>
  );
}

export default BottomControls;
