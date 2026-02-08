/**
 * Obsidian Integration
 *
 * Detects Obsidian vaults and lists markdown files from a vault.
 */

import { promises as fs } from "fs";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join, basename, relative } from "path";
import type {
  ObsidianVault,
  ObsidianFile,
  FileTreeNode,
  FlatTreeItem,
} from "./types.js";

// macOS Obsidian config location
const OBSIDIAN_CONFIG_PATH = join(
  homedir(),
  "Library",
  "Application Support",
  "obsidian",
  "obsidian.json"
);

interface ObsidianConfigJson {
  vaults?: {
    [id: string]: {
      path: string;
      open?: boolean;
    };
  };
}

/**
 * Detect installed Obsidian vaults from system configuration.
 * Returns empty array if Obsidian is not installed or no vaults found.
 */
export async function detectObsidianVaults(): Promise<ObsidianVault[]> {
  try {
    if (!existsSync(OBSIDIAN_CONFIG_PATH)) {
      return [];
    }

    const content = readFileSync(OBSIDIAN_CONFIG_PATH, "utf-8");
    const config = JSON.parse(content) as ObsidianConfigJson;

    if (!config.vaults || typeof config.vaults !== "object") {
      return [];
    }

    const vaults: ObsidianVault[] = [];

    for (const [id, vault] of Object.entries(config.vaults)) {
      if (vault && typeof vault.path === "string") {
        vaults.push({
          id,
          path: vault.path,
          name: basename(vault.path),
          isOpen: vault.open === true,
        });
      }
    }

    // Sort by open status (open vaults first), then by name
    return vaults.sort((a, b) => {
      if (a.isOpen && !b.isOpen) return -1;
      if (!a.isOpen && b.isOpen) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

/**
 * Validate that a path is a valid Obsidian vault.
 * A vault must have a .obsidian directory.
 */
export function validateVaultPath(vaultPath: string): boolean {
  try {
    const obsidianDir = join(vaultPath, ".obsidian");
    return existsSync(vaultPath) && existsSync(obsidianDir);
  } catch {
    return false;
  }
}

/**
 * List all markdown files in an Obsidian vault.
 * Skips hidden directories (starting with .) and the .obsidian folder.
 */
export async function listVaultFiles(
  vaultPath: string
): Promise<ObsidianFile[]> {
  const files: ObsidianFile[] = [];

  async function walkDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        // Skip hidden directories and .obsidian
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".")) {
            continue;
          }
          await walkDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          try {
            const stats = await fs.stat(fullPath);
            files.push({
              path: fullPath,
              relativePath: relative(vaultPath, fullPath),
              name: entry.name.replace(/\.md$/, ""),
              sizeBytes: stats.size,
              modifiedAt: stats.mtime,
            });
          } catch {
            // Skip files we can't stat
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  await walkDirectory(vaultPath);

  // Sort by modification time (most recent first)
  return files.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
}

/**
 * Get vault name from path
 */
export function getVaultName(vaultPath: string): string {
  return basename(vaultPath);
}

/**
 * Build a tree structure from flat file list
 */
export function buildFileTree(files: ObsidianFile[]): FileTreeNode[] {
  // Use a nested map structure to build the tree
  interface TreeBuilder {
    node?: FileTreeNode;
    children: Map<string, TreeBuilder>;
  }

  const root: TreeBuilder = { children: new Map() };

  for (const file of files) {
    const parts = file.relativePath.split("/");
    let current = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      if (!current.children.has(part)) {
        const node: FileTreeNode = {
          id: currentPath,
          name: isFile ? file.name : part,
          type: isFile ? "file" : "folder",
          depth: i,
          path: isFile ? file.path : currentPath,
          relativePath: currentPath,
          ...(isFile
            ? { sizeBytes: file.sizeBytes, modifiedAt: file.modifiedAt }
            : { children: [], fileCount: 0 }),
        };
        current.children.set(part, { node, children: new Map() });
      }

      current = current.children.get(part)!;
    }
  }

  // Convert builder to array structure
  function builderToArray(builder: TreeBuilder): FileTreeNode[] {
    const result: FileTreeNode[] = [];
    for (const child of builder.children.values()) {
      if (child.node) {
        if (child.node.type === "folder") {
          child.node.children = builderToArray(child);
        }
        result.push(child.node);
      }
    }
    return result;
  }

  const result = builderToArray(root);
  countFilesRecursive(result);
  sortTree(result);
  return result;
}

/**
 * Count files in each folder recursively
 */
function countFilesRecursive(nodes: FileTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === "file") {
      count++;
    } else if (node.children) {
      node.fileCount = countFilesRecursive(node.children);
      count += node.fileCount;
    }
  }
  return count;
}

/**
 * Sort tree: folders first, then alphabetically
 */
function sortTree(nodes: FileTreeNode[]): void {
  nodes.sort((a, b) => {
    // Folders before files
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    // Alphabetically within same type
    return a.name.localeCompare(b.name);
  });

  // Recursively sort children
  for (const node of nodes) {
    if (node.children) {
      sortTree(node.children);
    }
  }
}

/**
 * Flatten tree into list for rendering, respecting expanded state
 */
export function flattenTree(
  nodes: FileTreeNode[],
  expandedFolders: Set<string>,
  depth = 0
): FlatTreeItem[] {
  const result: FlatTreeItem[] = [];

  for (const node of nodes) {
    const isExpanded = expandedFolders.has(node.id);

    result.push({
      id: node.id,
      name: node.name,
      type: node.type,
      depth: depth,
      path: node.path,
      relativePath: node.relativePath,
      sizeBytes: node.sizeBytes,
      modifiedAt: node.modifiedAt,
      isExpanded: node.type === "folder" ? isExpanded : undefined,
      fileCount: node.fileCount,
    });

    // Add children if folder is expanded
    if (node.type === "folder" && isExpanded && node.children) {
      result.push(...flattenTree(node.children, expandedFolders, depth + 1));
    }
  }

  return result;
}

/**
 * Get file tree from vault - builds tree structure from files
 */
export async function getVaultFileTree(
  vaultPath: string
): Promise<FileTreeNode[]> {
  const files = await listVaultFiles(vaultPath);
  return buildFileTree(files);
}
