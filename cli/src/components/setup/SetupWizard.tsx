/**
 * SetupWizard — top-level orchestrator for the setup wizard TUI.
 *
 * Uses HorizontalLayout/VerticalLayout (same as main dashboard)
 * with mascot on the left and wizard steps on the right.
 */

import React, { useState, useEffect } from "react";
import { Text, useInput, useStdout } from "ink";
import { useSetupWizard } from "../../hooks/useSetupWizard.js";
import {
  HorizontalLayout,
  VerticalLayout,
  ACCENT_COLOR,
  MUTED_TEXT,
  HORIZONTAL_LAYOUT_MIN_WIDTH,
} from "../layout/index.js";
import { buildBottomControls } from "../../utils/bottom-controls.js";
import type { ControlItem } from "../../utils/bottom-controls.js";
import { buildWelcomeContent } from "./WelcomeStep.js";
import { buildPrerequisitesContent } from "./PrerequisitesStep.js";
import { buildOptionsContent } from "./OptionsStep.js";
import { buildInstallingContent } from "./InstallingStep.js";
import { buildVerificationContent } from "./VerificationStep.js";
import { buildSyncContent } from "./SyncStep.js";
import { buildDoneContent } from "./DoneStep.js";

const STEP_NAMES = [
  "Welcome",
  "Prerequisites",
  "Configuration",
  "Installing",
  "Verification",
  "Sync",
  "Complete",
];

function getControls(
  step: string,
  extra: {
    prereqChecking: boolean;
    prereqFailed: boolean;
    installDone: boolean;
    verifyChecking: boolean;
    syncPhase: string;
  },
): ControlItem[] {
  switch (step) {
    case "welcome":
      return [
        { key: "Enter", label: " start" },
        { key: "Q", label: "uit" },
      ];
    case "prerequisites":
      if (extra.prereqChecking) return [{ key: "Q", label: "uit" }];
      if (extra.prereqFailed)
        return [
          { key: "Esc", label: " back" },
          { key: "Q", label: "uit" },
        ];
      return [
        { key: "Enter", label: " continue" },
        { key: "Esc", label: " back" },
        { key: "Q", label: "uit" },
      ];
    case "options":
      return [
        { key: "↑↓", label: " navigate" },
        { key: "Space", label: " toggle" },
        { key: "Enter", label: " continue" },
        { key: "Esc", label: " back" },
      ];
    case "installing":
      if (!extra.installDone) return [];
      return [{ key: "Enter", label: " continue" }];
    case "verification":
      if (extra.verifyChecking) return [];
      return [{ key: "Enter", label: " continue" }];
    case "sync":
      if (extra.syncPhase === "ask")
        return [
          { key: "←→", label: " select" },
          { key: "Enter", label: " confirm" },
        ];
      if (extra.syncPhase === "done" || extra.syncPhase === "error")
        return [{ key: "Enter", label: " continue" }];
      return [];
    case "done":
      return [{ key: "Enter", label: " exit" }];
    default:
      return [];
  }
}

export function SetupWizard(): React.ReactElement {
  const wizard = useSetupWizard();
  const { stdout } = useStdout();
  const [terminalWidth, setTerminalWidth] = useState(stdout?.columns || 80);

  useEffect(() => {
    const handleResize = () => {
      if (stdout && "write" in stdout && typeof stdout.write === "function") {
        stdout.write("\x1Bc");
      }
      if (stdout?.columns) setTerminalWidth(stdout.columns);
    };
    if (stdout && "on" in stdout && typeof stdout.on === "function") {
      stdout.on("resize", handleResize);
      return () => {
        if ("off" in stdout && typeof stdout.off === "function") {
          stdout.off("resize", handleResize);
        }
      };
    }
  }, [stdout]);

  useInput((input, key) => {
    wizard.handleInput(input, key);
  });

  const prereqFailed = wizard.prereqResults.some((r) => r.status === "fail");
  const controls = getControls(wizard.currentStep, {
    prereqChecking: wizard.prereqChecking,
    prereqFailed,
    installDone: wizard.installDone,
    verifyChecking: wizard.verifyChecking,
    syncPhase: wizard.syncPhase,
  });

  const { element: bottomControls, width: controlsWidth } =
    buildBottomControls(controls);

  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  // Build content lines: step indicator + step content
  const stepName = STEP_NAMES[wizard.stepNumber - 1] || "";
  const contentLines: React.ReactNode[] = [];

  // Step indicator (line 1 of 10)
  contentLines.push(
    <Text key="step-indicator">
      <Text color={ACCENT_COLOR}>Step {wizard.stepNumber}/7</Text>
      <Text color={MUTED_TEXT}> · {stepName}</Text>
    </Text>,
  );

  // Step-specific content (lines 2-10)
  let stepContent: React.ReactNode[];
  switch (wizard.currentStep) {
    case "welcome":
      stepContent = buildWelcomeContent();
      break;
    case "prerequisites":
      stepContent = buildPrerequisitesContent(
        wizard.prereqResults,
        wizard.prereqChecking,
        wizard.prereqCurrentCheck,
      );
      break;
    case "options":
      stepContent = buildOptionsContent(wizard.options, wizard.optionsIndex);
      break;
    case "installing":
      stepContent = buildInstallingContent(
        wizard.installSubsteps,
        wizard.installCurrentIndex,
      );
      break;
    case "verification":
      stepContent = buildVerificationContent(
        wizard.verifyResults,
        wizard.verifyChecking,
      );
      break;
    case "sync":
      stepContent = buildSyncContent(
        wizard.syncPhase,
        wizard.syncSelectedOption,
        wizard.syncProgress,
        wizard.syncResult,
        wizard.syncErrorMessage,
      );
      break;
    case "done":
      stepContent = buildDoneContent(wizard.options, wizard.syncResult);
      break;
    default:
      stepContent = [];
  }

  contentLines.push(...stepContent);

  return useHorizontalLayout ? (
    <HorizontalLayout
      content={contentLines}
      terminalWidth={terminalWidth}
      title="Jacques Setup"
      showVersion={showVersion}
      bottomControls={bottomControls}
      bottomControlsWidth={controlsWidth}
    />
  ) : (
    <VerticalLayout
      content={contentLines}
      title="Jacques Setup"
      showVersion={showVersion}
      bottomControls={bottomControls}
    />
  );
}
