/**
 * WelcomeStep — first screen content for the setup wizard.
 */

import React from "react";
import { Text } from "ink";
import { ACCENT_COLOR, MUTED_TEXT } from "../layout/theme.js";

export function buildWelcomeContent(): React.ReactNode[] {
  return [
    <Text key="spacer-1"> </Text>,
    <Text key="heading" color="white" bold>Welcome to Jacques!</Text>,
    <Text key="spacer-2"> </Text>,
    <Text key="desc" color={MUTED_TEXT}>Real-time context monitor for Claude Code.</Text>,
    <Text key="spacer-3"> </Text>,
    <Text key="label" color={ACCENT_COLOR}>What will be set up:</Text>,
    <Text key="item-1" color={MUTED_TEXT}>  * Hook scripts for session tracking</Text>,
    <Text key="item-2" color={MUTED_TEXT}>  * Optional status line integration</Text>,
    <Text key="item-3" color={MUTED_TEXT}>  * Optional slash command skills</Text>,
  ];
}
