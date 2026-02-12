/**
 * useSetupWizard — state machine hook for the setup wizard.
 *
 * Manages step transitions, options, async operations, and keyboard input.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useApp } from "ink";
import type { Key } from "ink";
import { dirname, join } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import {
  checkPrerequisites,
  createJacquesDir,
  setupHooksSymlink,
  createSettingsBackup,
  loadClaudeSettings,
  mergeHooksIntoSettings,
  writeClaudeSettings,
  installSkills,
  verifyInstallation,
} from "@jacques-ai/core/setup";
import type {
  PrerequisiteResult,
  SetupOptions,
  SetupStepResult,
  VerificationResult,
  SyncResult,
} from "@jacques-ai/core/setup";
import { OPTIONS_COUNT, OPTION_KEYS } from "../components/setup/OptionsStep.js";
import type { InstallSubstep } from "../components/setup/InstallingStep.js";

export type SetupStep =
  | "welcome"
  | "prerequisites"
  | "options"
  | "installing"
  | "verification"
  | "sync"
  | "done";

const STEP_ORDER: SetupStep[] = [
  "welcome",
  "prerequisites",
  "options",
  "installing",
  "verification",
  "sync",
  "done",
];

export interface UseSetupWizardReturn {
  currentStep: SetupStep;
  stepNumber: number;

  // Prerequisites
  prereqResults: PrerequisiteResult[];
  prereqChecking: boolean;
  prereqCurrentCheck: number;

  // Options
  options: SetupOptions;
  optionsIndex: number;

  // Installing
  installSubsteps: InstallSubstep[];
  installCurrentIndex: number;
  installDone: boolean;

  // Verification
  verifyResults: VerificationResult[];
  verifyChecking: boolean;

  // Sync
  syncPhase: "ask" | "starting" | "running" | "done" | "error";
  syncSelectedOption: number;
  syncProgress: { current: number; total: number; phase: string } | null;
  syncResult: SyncResult | null;
  syncErrorMessage?: string;

  // Input
  handleInput: (input: string, key: Key) => void;
}

/**
 * Resolve the project root (where hooks/ and skills/ live).
 * In development: traverses up from CLI dist. In production (npm): from package root.
 */
function getProjectRoot(): string {
  // When running from the monorepo, import.meta.url points to cli/dist/hooks/
  // We need to go up to the repo root. Use a simpler heuristic:
  // Find the directory containing 'hooks/' and 'skills/' by walking up.
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "hooks")) && existsSync(join(dir, "skills"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: assume 3 levels up from cli/dist/hooks/
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

export function useSetupWizard(): UseSetupWizardReturn {
  const { exit } = useApp();

  const [currentStep, setCurrentStep] = useState<SetupStep>("welcome");
  const stepNumber = STEP_ORDER.indexOf(currentStep) + 1;

  // Prerequisites state
  const [prereqResults, setPrereqResults] = useState<PrerequisiteResult[]>([]);
  const [prereqChecking, setPrereqChecking] = useState(false);
  const [prereqCurrentCheck, setPrereqCurrentCheck] = useState(0);
  const prereqRan = useRef(false);

  // Options state
  const [options, setOptions] = useState<SetupOptions>({
    installStatusLine: true,
    installSkills: true,
  });
  const [optionsIndex, setOptionsIndex] = useState(0);

  // Installing state
  const [installSubsteps, setInstallSubsteps] = useState<InstallSubstep[]>([]);
  const [installCurrentIndex, setInstallCurrentIndex] = useState(-1);
  const [installDone, setInstallDone] = useState(false);
  const installRan = useRef(false);

  // Verification state
  const [verifyResults, setVerifyResults] = useState<VerificationResult[]>([]);
  const [verifyChecking, setVerifyChecking] = useState(false);
  const verifyRan = useRef(false);

  // Sync state
  const [syncPhase, setSyncPhase] = useState<"ask" | "starting" | "running" | "done" | "error">("ask");
  const [syncSelectedOption, setSyncSelectedOption] = useState(0);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; phase: string } | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | undefined>();
  const syncServerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  // Run prerequisite checks when entering that step
  useEffect(() => {
    if (currentStep !== "prerequisites" || prereqRan.current) return;
    prereqRan.current = true;

    setPrereqChecking(true);
    setPrereqCurrentCheck(0);

    const run = async () => {
      const results = await checkPrerequisites();
      // Reveal results one at a time for visual effect
      for (let i = 0; i < results.length; i++) {
        await new Promise((r) => setTimeout(r, 400));
        setPrereqResults((prev) => [...prev, results[i]]);
        setPrereqCurrentCheck(i + 1);
      }
      await new Promise((r) => setTimeout(r, 300));
      setPrereqChecking(false);
    };

    run().catch(() => setPrereqChecking(false));
  }, [currentStep]);

  // Run installation when entering that step
  useEffect(() => {
    if (currentStep !== "installing" || installRan.current) return;
    installRan.current = true;

    const projectRoot = getProjectRoot();
    const hooksSource = join(projectRoot, "hooks");
    const skillsSource = join(projectRoot, "skills");

    // Build substep list based on options
    const steps: { label: string; fn: () => SetupStepResult }[] = [
      {
        label: "Create ~/.jacques/ directory",
        fn: () => createJacquesDir(),
      },
      {
        label: "Set up hooks symlink",
        fn: () => setupHooksSymlink(hooksSource),
      },
      {
        label: "Back up existing settings.json",
        fn: () => {
          const backup = createSettingsBackup();
          return {
            step: "Back up settings.json",
            success: true,
            message: backup ? `Backup: ${backup}` : "No existing settings to back up",
          };
        },
      },
      {
        label: "Write hooks to settings.json",
        fn: () => {
          try {
            const existing = loadClaudeSettings() || {};
            const merged = mergeHooksIntoSettings(existing, options);
            writeClaudeSettings(merged);
            return { step: "Write hooks", success: true, message: "Hooks written" };
          } catch (err) {
            return {
              step: "Write hooks",
              success: false,
              message: (err as Error).message,
            };
          }
        },
      },
    ];

    if (options.installSkills) {
      steps.push({
        label: "Install skills",
        fn: () => installSkills(skillsSource),
      });
    }

    // Initialize substeps as pending
    const initial: InstallSubstep[] = steps.map((s) => ({
      label: s.label,
      status: "pending",
    }));
    setInstallSubsteps(initial);

    // Run each substep sequentially with visual stagger
    const run = async () => {
      for (let i = 0; i < steps.length; i++) {
        setInstallCurrentIndex(i);
        setInstallSubsteps((prev) =>
          prev.map((s, j) => (j === i ? { ...s, status: "running" } : s)),
        );

        await new Promise((r) => setTimeout(r, 400));

        const result = steps[i].fn();

        setInstallSubsteps((prev) =>
          prev.map((s, j) =>
            j === i
              ? {
                  ...s,
                  status: result.success ? "done" : "failed",
                  message: result.success ? undefined : result.message,
                }
              : s,
          ),
        );
      }

      await new Promise((r) => setTimeout(r, 500));
      setInstallDone(true);
    };

    run().catch(() => setInstallDone(true));
  }, [currentStep, options]);

  // Run verification when entering that step
  useEffect(() => {
    if (currentStep !== "verification" || verifyRan.current) return;
    verifyRan.current = true;

    setVerifyChecking(true);

    const run = async () => {
      await new Promise((r) => setTimeout(r, 300));
      const results = verifyInstallation(options);

      // Reveal one at a time
      for (let i = 0; i < results.length; i++) {
        await new Promise((r) => setTimeout(r, 300));
        setVerifyResults((prev) => [...prev, results[i]]);
      }

      await new Promise((r) => setTimeout(r, 200));
      setVerifyChecking(false);
    };

    run().catch(() => setVerifyChecking(false));
  }, [currentStep, options]);

  // Clean up sync server on unmount
  useEffect(() => {
    return () => {
      if (syncServerRef.current) {
        syncServerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  /**
   * Stream an SSE sync response, updating progress in real-time.
   * Returns the final SyncResult.
   */
  const streamSyncResponse = useCallback(async (response: Response): Promise<SyncResult> => {
    let result: SyncResult = { totalSessions: 0, extracted: 0, indexed: 0, errors: 0 };

    const reader = response.body?.getReader();
    if (!reader) {
      // Fallback: read entire body at once (no streaming)
      const text = await response.text();
      const lines = text.split("\n").filter((l) => l.startsWith("data: "));
      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.totalSessions !== undefined) {
            result = {
              totalSessions: data.totalSessions || 0,
              extracted: data.extracted || 0,
              indexed: data.indexed || 0,
              errors: data.errors || 0,
            };
          }
        } catch { /* skip */ }
      }
      return result;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse complete SSE events (separated by double newline)
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;

        try {
          const data = JSON.parse(dataLine.slice(6));
          if (data.phase === "extracting" || data.phase === "indexing") {
            setSyncProgress({
              current: data.completed || data.current || 0,
              total: data.total || 0,
              phase: data.phase,
            });
          }
          if (data.totalSessions !== undefined) {
            result = {
              totalSessions: data.totalSessions || 0,
              extracted: data.extracted || 0,
              indexed: data.indexed || 0,
              errors: data.errors || 0,
            };
          }
        } catch { /* skip unparseable */ }
      }
    }

    return result;
  }, []);

  const runSync = useCallback(async () => {
    setSyncPhase("starting");

    try {
      // Dynamically import to avoid pulling server deps at module load
      const { startEmbeddedServer } = await import("@jacques-ai/server");
      const server = await startEmbeddedServer({ silent: true });
      syncServerRef.current = server;

      setSyncPhase("running");
      setSyncProgress({ current: 0, total: 0, phase: "extracting" });

      const response = await fetch("http://localhost:4243/api/sync?force=true", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Sync returned ${response.status}`);
      }

      const result = await streamSyncResponse(response);
      setSyncResult(result);
      setSyncPhase("done");

      // Stop server after sync
      await server.stop();
      syncServerRef.current = null;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("EADDRINUSE") || msg.includes("already")) {
        // Server already running — try sync directly
        try {
          setSyncPhase("running");
          setSyncProgress({ current: 0, total: 0, phase: "extracting" });
          const response = await fetch("http://localhost:4243/api/sync?force=true", {
            method: "POST",
          });
          const result = await streamSyncResponse(response);
          setSyncResult(result);
          setSyncPhase("done");
        } catch {
          setSyncErrorMessage("Server already running. Sync from the dashboard later.");
          setSyncPhase("error");
        }
      } else {
        setSyncErrorMessage(msg);
        setSyncPhase("error");
      }
    }
  }, [streamSyncResponse]);

  const goToStep = useCallback((step: SetupStep) => {
    setCurrentStep(step);
  }, []);

  const handleInput = useCallback(
    (input: string, key: Key) => {
      // Global quit
      if (input === "q" || input === "Q") {
        if (syncServerRef.current) {
          syncServerRef.current.stop().catch(() => {});
        }
        exit();
        return;
      }

      switch (currentStep) {
        case "welcome":
          if (key.return) {
            goToStep("prerequisites");
          }
          break;

        case "prerequisites":
          if (key.return && !prereqChecking) {
            const hasFailed = prereqResults.some((r) => r.status === "fail");
            if (!hasFailed) {
              goToStep("options");
            }
          }
          if (key.escape) {
            goToStep("welcome");
          }
          break;

        case "options":
          if (key.upArrow) {
            setOptionsIndex((prev) => Math.max(0, prev - 1));
          }
          if (key.downArrow) {
            setOptionsIndex((prev) => Math.min(OPTIONS_COUNT - 1, prev + 1));
          }
          if (input === " ") {
            // Toggle selected option
            const optionKey = OPTION_KEYS[optionsIndex];
            setOptions((prev) => ({
              ...prev,
              [optionKey]: !prev[optionKey],
            }));
          }
          if (key.return) {
            goToStep("installing");
          }
          if (key.escape) {
            goToStep("prerequisites");
          }
          break;

        case "installing":
          if (key.return && installDone) {
            goToStep("verification");
          }
          break;

        case "verification":
          if (key.return && !verifyChecking) {
            goToStep("sync");
          }
          break;

        case "sync":
          if (syncPhase === "ask") {
            if (key.leftArrow || key.rightArrow) {
              setSyncSelectedOption((prev) => (prev === 0 ? 1 : 0));
            }
            if (key.return) {
              if (syncSelectedOption === 0) {
                // Yes — run sync
                runSync();
              } else {
                // No — skip to done
                goToStep("done");
              }
            }
          }
          if (syncPhase === "done" || syncPhase === "error") {
            if (key.return) {
              goToStep("done");
            }
          }
          break;

        case "done":
          if (key.return) {
            if (syncServerRef.current) {
              syncServerRef.current.stop().catch(() => {});
            }
            exit();
          }
          break;
      }
    },
    [
      currentStep,
      prereqChecking,
      prereqResults,
      optionsIndex,
      installDone,
      verifyChecking,
      syncPhase,
      syncSelectedOption,
      goToStep,
      runSync,
      exit,
    ],
  );

  return {
    currentStep,
    stepNumber,
    prereqResults,
    prereqChecking,
    prereqCurrentCheck,
    options,
    optionsIndex,
    installSubsteps,
    installCurrentIndex: installCurrentIndex,
    installDone,
    verifyResults,
    verifyChecking,
    syncPhase,
    syncSelectedOption,
    syncProgress,
    syncResult,
    syncErrorMessage,
    handleInput,
  };
}
