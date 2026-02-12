/**
 * Worktree Handler
 *
 * Handles WebSocket requests for git worktree operations:
 * - create_worktree
 * - list_worktrees
 * - remove_worktree
 */

import { WebSocket } from 'ws';
import { sendWsResponse } from './ws-utils.js';
import type { SessionRegistry } from '../session-registry.js';
import type { Logger } from '../logging/logger-factory.js';
import { createWorktree, listWorktreesWithStatus, removeWorktree } from '../connection/index.js';
import { launchTerminalSession } from '../terminal-launcher.js';
import type { TileStateManager } from '../window-manager/tile-state.js';
import { validateTileStateWithBounds, validateTileStateBySessions } from '../window-manager/tile-state.js';
import { planSmartTileTransition, findFreeSpace } from '../window-manager/smart-layouts.js';
import type { ExistingSlot } from '../window-manager/smart-layouts.js';
import type {
  CreateWorktreeRequest,
  CreateWorktreeResultMessage,
  ListWorktreesRequest,
  ListWorktreesResultMessage,
  RemoveWorktreeRequest,
  RemoveWorktreeResultMessage,
} from '../types.js';

export interface WorktreeHandlerDeps {
  registry: SessionRegistry;
  tileStateManager: TileStateManager;
  logger: Logger;
}

export class WorktreeHandler {
  private registry: SessionRegistry;
  private tileStateManager: TileStateManager;
  private logger: Logger;

  constructor(deps: WorktreeHandlerDeps) {
    this.registry = deps.registry;
    this.tileStateManager = deps.tileStateManager;
    this.logger = deps.logger;
  }

  async handleListWorktrees(ws: WebSocket, request: ListWorktreesRequest): Promise<void> {
    const { repo_root } = request;

    if (!repo_root) {
      sendWsResponse<ListWorktreesResultMessage>(ws, {
        type: 'list_worktrees_result',
        success: false,
        error: 'Missing repo_root',
      });
      return;
    }

    this.logger.log(`Listing worktrees for ${repo_root}`);

    try {
      const worktrees = await listWorktreesWithStatus(repo_root);

      sendWsResponse<ListWorktreesResultMessage>(ws, {
        type: 'list_worktrees_result',
        success: true,
        repo_root,
        worktrees: worktrees.map(w => ({
          name: w.name,
          path: w.path,
          branch: w.branch,
          isMain: w.isMain,
          status: w.status,
        })),
      });
    } catch (err) {
      this.logger.error(`Failed to list worktrees: ${err}`);
      sendWsResponse<ListWorktreesResultMessage>(ws, {
        type: 'list_worktrees_result',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async handleRemoveWorktree(ws: WebSocket, request: RemoveWorktreeRequest): Promise<void> {
    const { repo_root, worktree_path, force, delete_branch } = request;

    if (!repo_root || !worktree_path) {
      sendWsResponse<RemoveWorktreeResultMessage>(ws, {
        type: 'remove_worktree_result',
        success: false,
        error: 'Missing repo_root or worktree_path',
      });
      return;
    }

    this.logger.log(`Removing worktree at ${worktree_path}${force ? ' (force)' : ''}`);

    try {
      const result = await removeWorktree({
        repoRoot: repo_root,
        worktreePath: worktree_path,
        force,
        deleteBranch: delete_branch,
      });

      sendWsResponse<RemoveWorktreeResultMessage>(ws, {
        type: 'remove_worktree_result',
        success: result.success,
        worktree_path: result.success ? worktree_path : undefined,
        branch_deleted: result.branchDeleted,
        error: result.error,
      });

      if (result.success) {
        this.logger.log(`Worktree removed: ${worktree_path}${result.branchDeleted ? ' (branch deleted)' : ''}`);
      }
    } catch (err) {
      this.logger.error(`Failed to remove worktree: ${err}`);
      sendWsResponse<RemoveWorktreeResultMessage>(ws, {
        type: 'remove_worktree_result',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async handleCreateWorktree(ws: WebSocket, request: CreateWorktreeRequest): Promise<void> {
    const { repo_root, name, base_branch, launch_session: shouldLaunch, dangerously_skip_permissions } = request;

    if (!repo_root || !name) {
      sendWsResponse<CreateWorktreeResultMessage>(ws, {
        type: 'create_worktree_result',
        success: false,
        error: 'Missing repo_root or name',
      });
      return;
    }

    this.logger.log(`Creating worktree '${name}' in ${repo_root}`);

    try {
      const result = await createWorktree({
        repoRoot: repo_root,
        name,
        baseBranch: base_branch,
      });

      if (!result.success) {
        sendWsResponse<CreateWorktreeResultMessage>(ws, {
          type: 'create_worktree_result',
          success: false,
          error: result.error,
        });
        return;
      }

      let sessionLaunched = false;
      let launchMethod: string | undefined;

      // Launch session in the new worktree (default: true)
      if (shouldLaunch !== false && result.worktreePath) {
        try {
          // Use smart-tile-add logic to position the new terminal
          // Skip on Windows: PowerShell-based window management is too slow
          // (getDisplays loads System.Windows.Forms .NET assembly, positionWindow
          // uses Win32 API via PowerShell — each call has 10s timeout and blocks
          // the WebSocket response, making CLI appear frozen)
          let targetBounds: { x: number; y: number; width: number; height: number } | undefined;
          if (process.platform !== 'win32') {
            try {
              const { createWindowManager, isWindowManagementSupported } = await import('../window-manager/index.js');
              if (isWindowManagementSupported()) {
                const manager = createWindowManager();
                const displays = await manager.getDisplays();

                // Determine target display: tile state → majority vote → primary
                let targetDisplay = this.tileStateManager.getAnyTileState()
                  ? displays.find(d => d.id === this.tileStateManager.getAnyTileState()!.displayId)
                  : null;

                if (!targetDisplay && displays.length > 1) {
                  const terminalKeys = this.registry.getAllSessions().map(s => s.terminal_key).filter(Boolean);
                  if (terminalKeys.length > 0 && typeof (manager as any).getTargetDisplayForTerminals === 'function') {
                    targetDisplay = await (manager as any).getTargetDisplayForTerminals(terminalKeys);
                  }
                }
                if (!targetDisplay) {
                  targetDisplay = displays.find(d => d.isPrimary) || displays[0];
                }

                if (targetDisplay) {
                  const workArea = targetDisplay.workArea;
                  const tileState = this.tileStateManager.getTileState(targetDisplay.id);

                  // Validate tile state
                  let tileStateValid = false;
                  if (tileState && tileState.slots.length > 0) {
                    if (process.platform === 'darwin' && typeof (manager as any).getWindowBounds === 'function') {
                      tileStateValid = await validateTileStateWithBounds(
                        tileState,
                        (key: string) => (manager as any).getWindowBounds(key),
                      );
                    } else {
                      tileStateValid = validateTileStateBySessions(
                        tileState,
                        (sessionId: string) => this.registry.getSession(sessionId) !== undefined,
                      );
                    }
                  }

                  if (tileStateValid && tileState && tileState.slots.length < 8) {
                    // Smart tile: extend existing layout
                    const existingSlots: ExistingSlot[] = tileState.slots.map(s => ({
                      terminalKey: s.terminalKey,
                      sessionId: s.sessionId,
                      column: s.column,
                      row: s.row,
                      geometry: s.geometry,
                    }));

                    const transition = planSmartTileTransition(existingSlots, workArea);
                    if (transition) {
                      for (const repo of transition.repositions) {
                        await manager.positionWindow(repo.terminalKey, repo.newGeometry);
                        await new Promise(resolve => setTimeout(resolve, 100));
                      }
                      targetBounds = transition.newWindowGeometry;

                      const newSlots = [...tileState.slots.map(s => {
                        const repo = transition.repositions.find(r => r.sessionId === s.sessionId);
                        if (repo) {
                          return { ...s, geometry: repo.newGeometry, column: repo.newColumn, row: repo.newRow };
                        }
                        return s;
                      })];
                      newSlots.push({
                        terminalKey: 'PENDING',
                        sessionId: 'PENDING',
                        geometry: transition.newWindowGeometry,
                        column: transition.newColumn,
                        row: transition.newRow,
                      });
                      this.tileStateManager.setTileState(targetDisplay.id, {
                        displayId: targetDisplay.id,
                        workArea,
                        columnsPerRow: transition.newGrid.columnsPerRow,
                        slots: newSlots,
                        tiledAt: Date.now(),
                      });
                    } else {
                      targetBounds = findFreeSpace(workArea, tileState.slots.map(s => s.geometry));
                    }
                  } else {
                    // No valid tile state — use free space
                    const existingBounds: { x: number; y: number; width: number; height: number }[] = [];
                    if (process.platform === 'darwin' && typeof (manager as any).getWindowBounds === 'function') {
                      for (const session of this.registry.getAllSessions()) {
                        if (session.terminal_key) {
                          const bounds = await (manager as any).getWindowBounds(session.terminal_key);
                          if (bounds) existingBounds.push(bounds);
                        }
                      }
                    }
                    targetBounds = findFreeSpace(workArea, existingBounds);
                  }
                }
              }
            } catch {
              // Window management not available, launch without targeting
            }
          }

          const launchResult = await launchTerminalSession({
            cwd: result.worktreePath,
            targetBounds,
            dangerouslySkipPermissions: dangerously_skip_permissions,
          });

          sessionLaunched = launchResult.success;
          launchMethod = launchResult.method;

          if (launchResult.success) {
            this.logger.log(`Launched terminal (${launchResult.method}) in new worktree ${result.worktreePath}`);
          } else {
            this.logger.warn(`Failed to launch terminal in worktree: ${launchResult.error}`);
          }
        } catch (err) {
          this.logger.warn(`Failed to launch terminal in worktree: ${err}`);
        }
      }

      sendWsResponse<CreateWorktreeResultMessage>(ws, {
        type: 'create_worktree_result',
        success: true,
        worktree_path: result.worktreePath,
        branch: result.branch,
        session_launched: sessionLaunched,
        launch_method: launchMethod,
      });

      this.logger.log(`Worktree '${name}' created at ${result.worktreePath}`);
    } catch (err) {
      this.logger.error(`Failed to create worktree: ${err}`);
      sendWsResponse<CreateWorktreeResultMessage>(ws, {
        type: 'create_worktree_result',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
