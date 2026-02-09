/**
 * Hidden Projects
 *
 * Manages the list of projects hidden from the discovered projects view.
 * Persisted in ~/.jacques/hidden-projects.json.
 */

import { promises as fs } from "fs";
import * as path from "path";
import { HIDDEN_PROJECTS_FILE } from "./types.js";
import { isNotFoundError, getErrorMessage } from "../logging/error-utils.js";
import { createLogger, type Logger } from "../logging/logger.js";

const logger: Logger = createLogger({ prefix: "[Hidden]" });

/**
 * Get the set of hidden project names.
 */
export async function getHiddenProjects(): Promise<Set<string>> {
  try {
    const content = await fs.readFile(HIDDEN_PROJECTS_FILE, "utf-8");
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      return new Set(data);
    }
  } catch (err) {
    if (!isNotFoundError(err)) {
      logger.warn("Failed to read hidden projects:", getErrorMessage(err));
    }
  }
  return new Set();
}

/**
 * Hide a project from the discovered list.
 */
export async function hideProject(name: string): Promise<void> {
  const hidden = await getHiddenProjects();
  hidden.add(name);
  await fs.mkdir(path.dirname(HIDDEN_PROJECTS_FILE), { recursive: true });
  await fs.writeFile(HIDDEN_PROJECTS_FILE, JSON.stringify([...hidden], null, 2));
}

/**
 * Unhide a project (restore it to the discovered list).
 */
export async function unhideProject(name: string): Promise<void> {
  const hidden = await getHiddenProjects();
  hidden.delete(name);
  await fs.writeFile(HIDDEN_PROJECTS_FILE, JSON.stringify([...hidden], null, 2));
}
