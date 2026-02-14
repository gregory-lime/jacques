/**
 * Header Component
 *
 * Displays the mascot, title, version, and connection status.
 * Layout inspired by Claude Code's header.
 */

import React from "react";
import { Box, Text } from "ink";
import { Mascot } from "./Mascot.js";
import { ACCENT_COLOR, SUCCESS_COLOR, ERROR_COLOR } from "./layout/theme.js";
import { VERSION } from "../version.js";

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
        <Text bold color={ACCENT_COLOR}>
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
        <Text color={SUCCESS_COLOR}>● Connected</Text>
        {sessionCount > 0 && (
          <Text color="gray">
            {" "}
            · {sessionCount} session{sessionCount !== 1 ? "s" : ""}
          </Text>
        )}
      </Text>
    );
  }

  return <Text color={ERROR_COLOR}>○ Disconnected</Text>;
}

export default Header;
