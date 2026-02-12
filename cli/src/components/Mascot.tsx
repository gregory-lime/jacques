/**
 * Mascot Component
 *
 * Jacques Derrida mascot - philosopher with white hair and pipe
 * Supports both vertical (standalone) and inline (compact header) variants
 *
 * Design features:
 * - Fuller white hair with gradient shading (░▒▓)
 * - Expressive eyes with clear spacing
 * - Subtle smile for approachable look
 * - Distinctive pipe character
 */

import React from "react";
import { Text, Box } from "ink";
import { ACCENT_COLOR } from "./layout/theme.js";

interface MascotProps {
  variant?: "vertical" | "inline";
  size?: "small" | "large";
}

/**
 * Jacques Derrida mascot - philosopher with distinctive features
 * Uses Unicode block elements (U+2580-259F) for terminal art
 */
export function Mascot({ variant = "vertical", size = "large" }: MascotProps): React.ReactElement {
  if (variant === "inline") {
    return <InlineMascot />;
  }

  if (size === "small") {
    return <SmallMascot />;
  }
  return <LargeMascot />;
}

/**
 * Inline variant for compact header (3 lines, 12 chars width)
 * Enhanced design with fuller hair and expressive eyes
 */
function InlineMascot(): React.ReactElement {
  return (
    <Box flexDirection="column" width={12}>
      <Text color="white"> ░▒▓▓▓▒░   </Text>
      <Text>
        <Text color={ACCENT_COLOR}>▐▛ º º ▜▌</Text>
        <Text color="gray">▖ </Text>
      </Text>
      <Text color={ACCENT_COLOR}>  ─‿─     </Text>
    </Box>
  );
}

function LargeMascot(): React.ReactElement {
  // Vertical Jacques Derrida with enhanced features
  return (
    <Box flexDirection="column">
      <Text color="white"> ░▒▓▓▓▒░</Text>
      <Text>
        <Text color={ACCENT_COLOR}>▐▛ º º ▜▌</Text>
        <Text color="gray">▖</Text>
      </Text>
      <Text color={ACCENT_COLOR}> ─‿─</Text>
    </Box>
  );
}

function SmallMascot(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="white">░▒▓▒░</Text>
      <Text>
        <Text color={ACCENT_COLOR}>▛ºº▜</Text>
        <Text color="gray">▖</Text>
      </Text>
    </Box>
  );
}

export default Mascot;
