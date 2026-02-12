/**
 * useObsidianConfig Hook
 *
 * Manages Obsidian vault detection, selection, and manual path entry.
 */

import { useState, useCallback } from "react";
import type { Key } from "ink";
import type { DashboardView } from "../components/Dashboard.js";
import {
  detectObsidianVaults,
  validateVaultPath,
  configureObsidian,
  getVaultName,
} from "@jacques-ai/core";
import type { ObsidianVault } from "@jacques-ai/core";

export interface UseObsidianConfigParams {
  setCurrentView: (view: DashboardView) => void;
  updateSourceItems: (obsidianConnected: boolean) => void;
  onVaultSelected: (vaultName: string, vaultPath: string) => Promise<void>;
}

export interface UseObsidianConfigState {
  vaults: ObsidianVault[];
  configIndex: number;
  manualPath: string;
  manualMode: boolean;
  configError: string | null;
}

export interface UseObsidianConfigReturn {
  state: UseObsidianConfigState;
  openConfig: () => Promise<void>;
  handleInput: (input: string, key: Key) => void;
  reset: () => void;
}

export function useObsidianConfig({
  setCurrentView,
  updateSourceItems,
  onVaultSelected,
}: UseObsidianConfigParams): UseObsidianConfigReturn {
  const [vaults, setVaults] = useState<ObsidianVault[]>([]);
  const [configIndex, setConfigIndex] = useState<number>(0);
  const [manualPath, setManualPath] = useState<string>("");
  const [manualMode, setManualMode] = useState<boolean>(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const handleVaultSelect = useCallback(async (index: number) => {
    const manualEntryIndex = vaults.length;

    if (index === manualEntryIndex) {
      if (!manualMode) {
        setManualMode(true);
        setManualPath("");
        setConfigError(null);
      } else if (manualPath.trim()) {
        const path = manualPath.trim();
        if (!validateVaultPath(path)) {
          setConfigError("Invalid vault path (missing .obsidian folder)");
          return;
        }
        if (configureObsidian(path)) {
          updateSourceItems(true);
          await onVaultSelected(getVaultName(path), path);
        } else {
          setConfigError("Failed to save configuration");
        }
      }
    } else {
      const vault = vaults[index];
      if (!vault) return;
      if (!validateVaultPath(vault.path)) {
        setConfigError("Invalid vault path (missing .obsidian folder)");
        return;
      }
      if (configureObsidian(vault.path)) {
        updateSourceItems(true);
        await onVaultSelected(vault.name, vault.path);
      } else {
        setConfigError("Failed to save configuration");
      }
    }
  }, [vaults, manualMode, manualPath, updateSourceItems, onVaultSelected]);

  const openConfig = useCallback(async () => {
    setConfigError(null);
    setManualPath("");
    setManualMode(false);
    setCurrentView("obsidian-config");

    const detected = await detectObsidianVaults();
    setVaults(detected);
    setConfigIndex(0);
  }, [setCurrentView]);

  const handleInput = useCallback((input: string, key: Key) => {
    if (key.escape) {
      if (manualMode) {
        setManualMode(false);
        setManualPath("");
        setConfigError(null);
      } else {
        setCurrentView("load-sources");
      }
      return;
    }

    if (manualMode) {
      if (key.return) {
        handleVaultSelect(vaults.length);
        return;
      }
      if (key.backspace || key.delete) {
        setManualPath((prev) => prev.slice(0, -1));
        return;
      }
      if (input && input.length === 1) {
        setManualPath((prev) => prev + input);
        return;
      }
    } else {
      const maxIndex = vaults.length;
      if (key.upArrow) {
        setConfigIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setConfigIndex((prev) => Math.min(maxIndex, prev + 1));
        return;
      }
      if (key.return) {
        handleVaultSelect(configIndex);
        return;
      }
    }
  }, [manualMode, vaults, configIndex, handleVaultSelect, setCurrentView]);

  const reset = useCallback(() => {
    setVaults([]);
    setConfigIndex(0);
    setManualPath("");
    setManualMode(false);
    setConfigError(null);
  }, []);

  return {
    state: { vaults, configIndex, manualPath, manualMode, configError },
    openConfig,
    handleInput,
    reset,
  };
}
