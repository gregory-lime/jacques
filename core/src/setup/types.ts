/**
 * Types for the setup module.
 *
 * Shared between the TUI setup wizard and the legacy configure scripts.
 */

export interface PrerequisiteResult {
  name: string;
  status: "pass" | "fail" | "warn";
  version?: string;
  message?: string;
}

export interface SetupOptions {
  installStatusLine: boolean;
  installSkills: boolean;
}

export interface SetupStepResult {
  step: string;
  success: boolean;
  message: string;
  detail?: string;
}

export interface VerificationResult {
  check: string;
  status: "pass" | "fail" | "warn";
  message: string;
}

export interface SyncProgress {
  phase: "extracting" | "indexing";
  current: number;
  total: number;
  currentItem?: string;
}

export interface SyncResult {
  totalSessions: number;
  extracted: number;
  indexed: number;
  errors: number;
}
