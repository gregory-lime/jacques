/**
 * Bulk Catalog Extractor
 *
 * Extracts catalog artifacts across all projects or for a single project.
 * Uses the global session index to discover JSONL files.
 */

import { promises as fs } from "fs";
import * as path from "path";
import { homedir } from "os";
import { listAllProjects } from "../cache/index.js";
import { extractSessionCatalog } from "./extractor.js";
import type {
  BulkExtractOptions,
  BulkExtractResult,
  CatalogProgress,
} from "./types.js";

/** Claude projects directory */
const CLAUDE_PROJECTS_PATH = path.join(homedir(), ".claude", "projects");

/**
 * Discover all JSONL files for a project directory.
 */
async function discoverSessionFiles(
  encodedPath: string,
  projectPath: string,
  projectSlug: string
): Promise<
  Array<{
    filePath: string;
    projectPath: string;
    projectSlug: string;
  }>
> {
  const files: Array<{
    filePath: string;
    projectPath: string;
    projectSlug: string;
  }> = [];

  try {
    const entries = await fs.readdir(encodedPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push({
          filePath: path.join(encodedPath, entry.name),
          projectPath,
          projectSlug,
        });
      }
    }
  } catch {
    // Skip unreadable directories
  }

  return files;
}

/**
 * Extract catalog for a single project.
 * Processes all JSONL files in the project's Claude directory.
 */
export async function extractProjectCatalog(
  projectPath: string,
  options: BulkExtractOptions = {}
): Promise<BulkExtractResult> {
  const { force, onProgress } = options;

  // Find the encoded project directory
  const encodedPath = projectPath.replace(/\//g, "-");
  const projectDir = path.join(CLAUDE_PROJECTS_PATH, encodedPath);
  const projectSlug = path.basename(projectPath);

  const jsonlFiles = await discoverSessionFiles(projectDir, projectPath, projectSlug);

  let extracted = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < jsonlFiles.length; i++) {
    const file = jsonlFiles[i];
    const sessionId = path.basename(file.filePath, ".jsonl");

    onProgress?.({
      phase: "extracting",
      total: jsonlFiles.length,
      completed: i,
      current: `${file.projectSlug}/${sessionId.substring(0, 8)}...`,
      skipped,
      errors,
    });

    const result = await extractSessionCatalog(file.filePath, file.projectPath, { force });

    if (result.error) {
      errors++;
    } else if (result.skipped) {
      skipped++;
    } else {
      extracted++;
    }
  }

  onProgress?.({
    phase: "extracting",
    total: jsonlFiles.length,
    completed: jsonlFiles.length,
    current: "Complete",
    skipped,
    errors,
  });

  return {
    totalSessions: jsonlFiles.length,
    extracted,
    skipped,
    errors,
  };
}

/**
 * Extract catalog across all projects.
 * Scans ~/.claude/projects/ for JSONL files and extracts catalog artifacts.
 */
export async function extractAllCatalogs(
  options: BulkExtractOptions = {}
): Promise<BulkExtractResult> {
  const { force, onProgress } = options;

  onProgress?.({
    phase: "scanning",
    total: 0,
    completed: 0,
    current: "Scanning projects...",
    skipped: 0,
    errors: 0,
  });

  // Discover all projects
  const projects = await listAllProjects();

  // Collect all JSONL files
  const allFiles: Array<{
    filePath: string;
    projectPath: string;
    projectSlug: string;
  }> = [];

  for (const project of projects) {
    const files = await discoverSessionFiles(
      project.encodedPath,
      project.projectPath,
      project.projectSlug
    );
    allFiles.push(...files);
  }

  let extracted = 0;
  let skipped = 0;
  let errors = 0;

  // Process each session
  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    const sessionId = path.basename(file.filePath, ".jsonl");

    onProgress?.({
      phase: "extracting",
      total: allFiles.length,
      completed: i,
      current: `${file.projectSlug}/${sessionId.substring(0, 8)}...`,
      skipped,
      errors,
    });

    const result = await extractSessionCatalog(file.filePath, file.projectPath, { force });

    if (result.error) {
      errors++;
    } else if (result.skipped) {
      skipped++;
    } else {
      extracted++;
    }
  }

  onProgress?.({
    phase: "extracting",
    total: allFiles.length,
    completed: allFiles.length,
    current: "Complete",
    skipped,
    errors,
  });

  return {
    totalSessions: allFiles.length,
    extracted,
    skipped,
    errors,
  };
}
