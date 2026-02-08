/**
 * Header Component
 *
 * Displays the mascot, title, version, and connection status.
 * Layout inspired by Claude Code's header.
 */

import React from "react";
import { Box, Text } from "ink";
import { Mascot } from "./Mascot.js";

const VERSION = "0.1.0";

interface HeaderProps {
  connected: boolean;
  sessionCount: number;
}

export function Header({
  connected,
  sessionCount,
}: HeaderProps): React.ReactElement {
  return (
    <Box>
      <Mascot size="large" />
      <Box flexDirection="column" marginLeft={2}>
        <Text bold color="#FF6600">
          Jacques <Text color="gray">v{VERSION}</Text>
        </Text>
        <Text color="gray">Jacques Context Monitor</Text>
        <ConnectionStatus connected={connected} sessionCount={sessionCount} />
      </Box>
    </Box>
  );
}

interface ConnectionStatusProps {
  connected: boolean;
  sessionCount: number;
}

function ConnectionStatus({
  connected,
  sessionCount,
}: ConnectionStatusProps): React.ReactElement {
  if (connected) {
    return (
      <Text>
        <Text color="green">● Connected</Text>
        {sessionCount > 0 && (
          <Text color="gray">
            {" "}
            · {sessionCount} session{sessionCount !== 1 ? "s" : ""}
          </Text>
        )}
      </Text>
    );
  }

  return <Text color="red">○ Disconnected</Text>;
}

export default Header;
