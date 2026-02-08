/**
 * Migration Module
 *
 * Handles migrations for the archive system, including adding projectId
 * to existing manifests that only have projectSlug.
 */

import * as path from "path";
import {
  listManifests,
  readManifest,
  saveManifest,
  readGlobalIndex,
  writeGlobalIndex,
  getGlobalArchivePath,
} from "./archive-store.js";
import { addToIndex } from "./search-indexer.js";
import { getDefaultSearchIndex } from "./types.js";
import type { ConversationManifest, SearchIndex } from "./types.js";
import { decodeProjectPath } from "../session/detector.js";

/**
 * Result of a migration operation
 */
export interface MigrationResult {
  /** Number of manifests updated */
  updated: number;
  /** Number of manifests skipped (already have projectId) */
  skipped: number;
  /** Errors encountered during migration */
  errors: string[];
}

/**
 * Migrate existing manifests to include projectId.
 *
 * For manifests that have projectPath but no projectId, generates
 * projectId from the full path using dash-encoding pattern.
 *
 * Also rebuilds the search index to use projectId as keys.
 */
export async function migrateToProjectId(): Promise<MigrationResult> {
  const result: MigrationResult = {
    updated: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // 1. Get all manifest IDs
    const manifestIds = await listManifests();

    // 2. Migrate each manifest
    const migratedManifests: ConversationManifest[] = [];

    for (const id of manifestIds) {
      try {
        const manifest = await readManifest(id);
        if (!manifest) {
          result.errors.push(`Could not read manifest: ${id}`);
          continue;
        }

        // Check if migration is needed
        if (manifest.projectId) {
          result.skipped++;
          migratedManifests.push(manifest);
          continue;
        }

        // Generate projectId from projectPath
        if (manifest.projectPath) {
          manifest.projectId = manifest.projectPath.replace(/\//g, "-");
          await saveManifest(manifest);
          result.updated++;
          migratedManifests.push(manifest);
        } else {
          // Fallback: use projectSlug if no projectPath (shouldn't happen)
          manifest.projectId = manifest.projectSlug;
          await saveManifest(manifest);
          result.updated++;
          migratedManifests.push(manifest);
          result.errors.push(`Manifest ${id} has no projectPath, used projectSlug as fallback`);
        }
      } catch (err) {
        result.errors.push(`Failed to migrate manifest ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 3. Rebuild the search index with new projectId keys
    const newIndex = getDefaultSearchIndex();
    for (const manifest of migratedManifests) {
      addToIndex(newIndex, manifest);
    }
    await writeGlobalIndex(newIndex);

  } catch (err) {
    result.errors.push(`Migration failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/**
 * Check if migration is needed.
 * Returns true if any manifests are missing projectId.
 */
export async function isMigrationNeeded(): Promise<boolean> {
  try {
    const manifestIds = await listManifests();

    // Check a sample of manifests (first 10)
    const sampleIds = manifestIds.slice(0, 10);

    for (const id of sampleIds) {
      const manifest = await readManifest(id);
      if (manifest && !manifest.projectId) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get migration status (how many manifests need migration).
 */
export async function getMigrationStatus(): Promise<{
  total: number;
  needsMigration: number;
  alreadyMigrated: number;
}> {
  const manifestIds = await listManifests();
  let needsMigration = 0;
  let alreadyMigrated = 0;

  for (const id of manifestIds) {
    const manifest = await readManifest(id);
    if (manifest) {
      if (manifest.projectId) {
        alreadyMigrated++;
      } else {
        needsMigration++;
      }
    }
  }

  return {
    total: manifestIds.length,
    needsMigration,
    alreadyMigrated,
  };
}

/**
 * Result of project path migration
 */
export interface PathMigrationResult {
  /** Number of manifests whose projectPath/projectSlug were updated */
  updated: number;
  /** Number of manifests that were already correct */
  skipped: number;
  /** Errors encountered */
  errors: string[];
}

/**
 * Migrate manifest project paths using the fixed decodeProjectPath().
 *
 * Re-decodes each manifest's projectId (which is the encoded dir name)
 * to get the correct projectPath and projectSlug using sessions-index.json.
 * Updates manifests where the decoded values differ from what's stored.
 */
export async function migrateProjectPaths(): Promise<PathMigrationResult> {
  const result: PathMigrationResult = {
    updated: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const manifestIds = await listManifests();

    for (const id of manifestIds) {
      try {
        const manifest = await readManifest(id);
        if (!manifest) {
          result.errors.push(`Could not read manifest: ${id}`);
          continue;
        }

        // Use projectId (encoded path) to re-decode
        const encodedDir = manifest.projectId || manifest.projectPath?.replace(/\//g, "-");
        if (!encodedDir) {
          result.errors.push(`Manifest ${id} has no projectId or projectPath`);
          continue;
        }

        const correctPath = await decodeProjectPath(encodedDir);
        const correctSlug = path.basename(correctPath);

        // Check if update is needed
        if (manifest.projectPath === correctPath && manifest.projectSlug === correctSlug) {
          result.skipped++;
          continue;
        }

        // Update the manifest
        manifest.projectPath = correctPath;
        manifest.projectSlug = correctSlug;
        await saveManifest(manifest);
        result.updated++;
      } catch (err) {
        result.errors.push(
          `Failed to migrate manifest ${id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } catch (err) {
    result.errors.push(
      `Migration failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return result;
}
