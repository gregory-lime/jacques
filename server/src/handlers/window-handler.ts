/**
 * Window Handler
 *
 * Handles WebSocket requests for window management:
 * - tile_windows
 * - maximize_window
 * - position_browser_layout
 * - smart_tile_add
 */

import { WebSocket } from 'ws';
import { sendWsResponse } from './ws-utils.js';
import type { SessionRegistry } from '../session-registry.js';
import type { Logger } from '../logging/logger-factory.js';
import type { TileStateManager } from '../window-manager/tile-state.js';
import { validateTileStateWithBounds, validateTileStateBySessions } from '../window-manager/tile-state.js';
import { planSmartTileTransition, findFreeSpace } from '../window-manager/smart-layouts.js';
import type { ExistingSlot } from '../window-manager/smart-layouts.js';
import { launchTerminalSession } from '../terminal-launcher.js';
import type {
  TileWindowsRequest,
  TileWindowsResultMessage,
  MaximizeWindowRequest,
  MaximizeWindowResultMessage,
  PositionBrowserLayoutRequest,
  PositionBrowserLayoutResultMessage,
  SmartTileAddRequest,
  SmartTileAddResultMessage,
} from '../types.js';

export interface WindowHandlerDeps {
  registry: SessionRegistry;
  tileStateManager: TileStateManager;
  logger: Logger;
}

export class WindowHandler {
  private registry: SessionRegistry;
  private tileStateManager: TileStateManager;
  private logger: Logger;

  constructor(deps: WindowHandlerDeps) {
    this.registry = deps.registry;
    this.tileStateManager = deps.tileStateManager;
    this.logger = deps.logger;
  }

  async handleTileWindows(ws: WebSocket, request: TileWindowsRequest): Promise<void> {
    const { session_ids, layout: requestedLayout, display_id } = request;

    if (!session_ids || session_ids.length === 0) {
      sendWsResponse<TileWindowsResultMessage>(ws, {
        type: 'tile_windows_result',
        success: false,
        positioned: 0,
        total: 0,
        layout: 'side-by-side',
        errors: ['No session IDs provided'],
      });
      return;
    }

    // Get terminal keys for the requested sessions
    const terminalKeys: string[] = [];
    const errors: string[] = [];

    for (const sessionId of session_ids) {
      const session = this.registry.getSession(sessionId);
      if (!session) {
        errors.push(`Session not found: ${sessionId}`);
        continue;
      }
      if (!session.terminal_key) {
        errors.push(`Session has no terminal key: ${sessionId}`);
        continue;
      }
      terminalKeys.push(session.terminal_key);
    }

    if (terminalKeys.length === 0) {
      sendWsResponse<TileWindowsResultMessage>(ws, {
        type: 'tile_windows_result',
        success: false,
        positioned: 0,
        total: session_ids.length,
        layout: requestedLayout || 'side-by-side',
        errors,
      });
      return;
    }

    try {
      const { createWindowManager, isWindowManagementSupported, suggestLayout } = await import('../window-manager/index.js');

      if (!isWindowManagementSupported()) {
        sendWsResponse<TileWindowsResultMessage>(ws, {
          type: 'tile_windows_result',
          success: false,
          positioned: 0,
          total: terminalKeys.length,
          layout: requestedLayout || 'side-by-side',
          errors: ['Window management not supported on this platform'],
        });
        return;
      }

      const manager = createWindowManager();
      const layout = requestedLayout || suggestLayout(terminalKeys.length);

      let targetDisplay;
      if (display_id) {
        const displays = await manager.getDisplays();
        targetDisplay = displays.find(d => d.id === display_id);
      }

      this.logger.log(`Tiling ${terminalKeys.length} windows with layout: ${layout}`);
      const result = await manager.tileWindows(terminalKeys, layout, targetDisplay);

      sendWsResponse<TileWindowsResultMessage>(ws, {
        type: 'tile_windows_result',
        success: result.success,
        positioned: result.positioned,
        total: result.total,
        layout,
        errors: [...errors, ...(result.errors || [])].length > 0 ? [...errors, ...(result.errors || [])] : undefined,
      });

      if (result.success) {
        this.logger.log(`Tiled ${result.positioned}/${result.total} windows`);

        // Update tile state for smart tiling
        const tileDisplay = targetDisplay || (await manager.getDisplays()).find(d => d.isPrimary) || (await manager.getDisplays())[0];
        if (tileDisplay) {
          const sessions = session_ids
            .map(id => {
              const s = this.registry.getSession(id);
              return s && s.terminal_key ? { terminalKey: s.terminal_key, sessionId: id } : null;
            })
            .filter((s): s is { terminalKey: string; sessionId: string } => s !== null);
          this.tileStateManager.buildFromManualTile(tileDisplay.id, tileDisplay.workArea, sessions);
        }
      } else {
        this.logger.log(`Partial tile: ${result.positioned}/${result.total} windows positioned`);
      }
    } catch (err) {
      this.logger.error(`Failed to tile windows: ${err}`);
      sendWsResponse<TileWindowsResultMessage>(ws, {
        type: 'tile_windows_result',
        success: false,
        positioned: 0,
        total: terminalKeys.length,
        layout: requestedLayout || 'side-by-side',
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  async handleMaximizeWindow(ws: WebSocket, request: MaximizeWindowRequest): Promise<void> {
    const session = this.registry.getSession(request.session_id);

    if (!session || !session.terminal_key) {
      sendWsResponse<MaximizeWindowResultMessage>(ws, {
        type: 'maximize_window_result',
        session_id: request.session_id,
        success: false,
        error: !session ? `Session not found: ${request.session_id}` : 'Session has no terminal key',
      });
      return;
    }

    try {
      const { createWindowManager, isWindowManagementSupported } = await import('../window-manager/index.js');

      if (!isWindowManagementSupported()) {
        sendWsResponse<MaximizeWindowResultMessage>(ws, {
          type: 'maximize_window_result',
          session_id: request.session_id,
          success: false,
          error: 'Window management not supported on this platform',
        });
        return;
      }

      const manager = createWindowManager();
      const displays = await manager.getDisplays();
      const primary = displays.find(d => d.isPrimary) || displays[0];

      if (!primary) {
        sendWsResponse<MaximizeWindowResultMessage>(ws, {
          type: 'maximize_window_result',
          session_id: request.session_id,
          success: false,
          error: 'No display available',
        });
        return;
      }

      this.logger.log(`Maximizing window for session ${request.session_id} (key: ${session.terminal_key})`);
      const result = await manager.positionWindow(session.terminal_key, primary.workArea);

      sendWsResponse<MaximizeWindowResultMessage>(ws, {
        type: 'maximize_window_result',
        session_id: request.session_id,
        success: result.success,
        error: result.error,
      });
    } catch (err) {
      this.logger.error(`Failed to maximize window: ${err}`);
      sendWsResponse<MaximizeWindowResultMessage>(ws, {
        type: 'maximize_window_result',
        session_id: request.session_id,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async handlePositionBrowserLayout(ws: WebSocket, request: PositionBrowserLayoutRequest): Promise<void> {
    const { session_ids, layout } = request;

    if (!session_ids || session_ids.length === 0) {
      sendWsResponse<PositionBrowserLayoutResultMessage>(ws, {
        type: 'position_browser_layout_result',
        success: false,
        layout,
        error: 'No session IDs provided',
      });
      return;
    }

    const terminalKeys: string[] = [];
    const errors: string[] = [];

    for (const sessionId of session_ids) {
      const session = this.registry.getSession(sessionId);
      if (!session) {
        errors.push(`Session not found: ${sessionId}`);
        continue;
      }
      if (!session.terminal_key) {
        errors.push(`Session has no terminal key: ${sessionId}`);
        continue;
      }
      terminalKeys.push(session.terminal_key);
    }

    if (terminalKeys.length === 0) {
      sendWsResponse<PositionBrowserLayoutResultMessage>(ws, {
        type: 'position_browser_layout_result',
        success: false,
        layout,
        error: errors.join('; '),
      });
      return;
    }

    try {
      const { createWindowManager, isWindowManagementSupported } = await import('../window-manager/index.js');
      const { calculateBrowserLayout } = await import('../window-manager/layouts.js');

      if (!isWindowManagementSupported()) {
        sendWsResponse<PositionBrowserLayoutResultMessage>(ws, {
          type: 'position_browser_layout_result',
          success: false,
          layout,
          error: 'Window management not supported on this platform',
        });
        return;
      }

      const manager = createWindowManager();
      const displays = await manager.getDisplays();
      const primary = displays.find(d => d.isPrimary) || displays[0];

      if (!primary) {
        sendWsResponse<PositionBrowserLayoutResultMessage>(ws, {
          type: 'position_browser_layout_result',
          success: false,
          layout,
          error: 'No display available',
        });
        return;
      }

      const validLayout = layout === 'browser-two-terminals' ? 'browser-two-terminals' : 'browser-terminal';
      const geometries = calculateBrowserLayout(primary.workArea, validLayout);

      this.logger.log(`Positioning browser layout: ${validLayout} with ${terminalKeys.length} terminal(s)`);

      // Position browser window (macOS only for now)
      const macManager = manager as import('../window-manager/macos-manager.js').MacOSWindowManager;
      let browserSuccess = false;
      if (typeof macManager.positionBrowserWindow === 'function') {
        const browserResult = await macManager.positionBrowserWindow(geometries.browser);
        browserSuccess = browserResult.success;
        if (!browserResult.success && browserResult.error) {
          errors.push(`Browser: ${browserResult.error}`);
        }
      } else {
        errors.push('Browser positioning not supported on this platform');
      }

      // Position terminal(s)
      let terminalsPositioned = 0;
      for (let i = 0; i < terminalKeys.length && i < geometries.terminals.length; i++) {
        const result = await manager.positionWindow(terminalKeys[i], geometries.terminals[i]);
        if (result.success) {
          terminalsPositioned++;
        } else if (result.error) {
          errors.push(`Terminal ${i}: ${result.error}`);
        }
        if (i < terminalKeys.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      sendWsResponse<PositionBrowserLayoutResultMessage>(ws, {
        type: 'position_browser_layout_result',
        success: browserSuccess && terminalsPositioned === Math.min(terminalKeys.length, geometries.terminals.length),
        layout: validLayout,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      });
    } catch (err) {
      this.logger.error(`Failed to position browser layout: ${err}`);
      sendWsResponse<PositionBrowserLayoutResultMessage>(ws, {
        type: 'position_browser_layout_result',
        success: false,
        layout,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async handleSmartTileAdd(ws: WebSocket, request: SmartTileAddRequest): Promise<void> {
    const { launch_cwd, new_session_id, display_id, dangerously_skip_permissions } = request;

    if (!launch_cwd && !new_session_id) {
      sendWsResponse<SmartTileAddResultMessage>(ws, {
        type: 'smart_tile_add_result',
        success: false,
        repositioned: 0,
        total_tiled: 0,
        used_free_space: false,
        error: 'Missing launch_cwd or new_session_id',
      });
      return;
    }

    try {
      const { createWindowManager, isWindowManagementSupported } = await import('../window-manager/index.js');

      if (!isWindowManagementSupported()) {
        if (launch_cwd) {
          const launchResult = await launchTerminalSession({ cwd: launch_cwd, dangerouslySkipPermissions: dangerously_skip_permissions });
          sendWsResponse<SmartTileAddResultMessage>(ws, {
            type: 'smart_tile_add_result',
            success: launchResult.success,
            repositioned: 0,
            total_tiled: 0,
            used_free_space: true,
            launch_method: launchResult.method,
            error: launchResult.error,
          });
        }
        return;
      }

      const manager = createWindowManager();
      const displays = await manager.getDisplays();

      // Determine target display
      let targetDisplay = display_id
        ? displays.find(d => d.id === display_id)
        : null;

      if (!targetDisplay) {
        const anyState = this.tileStateManager.getAnyTileState();
        if (anyState) {
          targetDisplay = displays.find(d => d.id === anyState.displayId);
        }
      }

      if (!targetDisplay && displays.length > 1) {
        const terminalKeys = this.registry.getAllSessions().map(s => s.terminal_key).filter(Boolean);
        if (terminalKeys.length > 0 && typeof (manager as any).getTargetDisplayForTerminals === 'function') {
          targetDisplay = await (manager as any).getTargetDisplayForTerminals(terminalKeys);
        }
      }

      if (!targetDisplay) {
        targetDisplay = displays.find(d => d.isPrimary) || displays[0];
      }

      if (!targetDisplay) {
        sendWsResponse<SmartTileAddResultMessage>(ws, {
          type: 'smart_tile_add_result',
          success: false,
          repositioned: 0,
          total_tiled: 0,
          used_free_space: false,
          error: 'No display available',
        });
        return;
      }

      const workArea = targetDisplay.workArea;
      let tileState = this.tileStateManager.getTileState(targetDisplay.id);

      // Validate tile state
      let tileStateValid = false;
      if (tileState && tileState.slots.length > 0) {
        if (process.platform === 'darwin' && typeof (manager as any).getWindowBounds === 'function') {
          const macManager = manager as any;
          tileStateValid = await validateTileStateWithBounds(
            tileState,
            (key: string) => macManager.getWindowBounds(key),
          );
        } else {
          tileStateValid = validateTileStateBySessions(
            tileState,
            (sessionId: string) => this.registry.getSession(sessionId) !== undefined,
          );
        }
      }

      let targetBounds: { x: number; y: number; width: number; height: number };
      let repositioned = 0;
      let totalTiled = 0;
      let usedFreeSpace = false;

      if (tileStateValid && tileState && tileState.slots.length < 8) {
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
            const result = await manager.positionWindow(repo.terminalKey, repo.newGeometry);
            if (result.success) {
              repositioned++;
            } else {
              this.logger.warn(`Failed to reposition ${repo.terminalKey}: ${result.error}`);
            }
            if (transition.repositions.indexOf(repo) < transition.repositions.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }

          targetBounds = transition.newWindowGeometry;
          totalTiled = tileState.slots.length + 1;

          const newSlots = [...tileState.slots.map((s) => {
            const repo = transition.repositions.find(r => r.sessionId === s.sessionId);
            if (repo) {
              return { ...s, geometry: repo.newGeometry, column: repo.newColumn, row: repo.newRow };
            }
            return s;
          })];

          newSlots.push({
            terminalKey: new_session_id ? (this.registry.getSession(new_session_id)?.terminal_key || 'PENDING') : 'PENDING',
            sessionId: new_session_id || 'PENDING',
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
          const existingBounds = tileState.slots.map(s => s.geometry);
          targetBounds = findFreeSpace(workArea, existingBounds);
          totalTiled = tileState.slots.length;
          usedFreeSpace = true;
        }
      } else {
        const existingBounds: { x: number; y: number; width: number; height: number }[] = [];

        if (process.platform === 'darwin' && typeof (manager as any).getWindowBounds === 'function') {
          const macManager = manager as any;
          const allSessions = this.registry.getAllSessions();
          for (const session of allSessions) {
            if (session.terminal_key) {
              const bounds = await macManager.getWindowBounds(session.terminal_key);
              if (bounds) existingBounds.push(bounds);
            }
          }
        } else if (tileState) {
          existingBounds.push(...tileState.slots.map(s => s.geometry));
        }

        targetBounds = findFreeSpace(workArea, existingBounds);
        usedFreeSpace = true;
      }

      // Launch or position the terminal
      let launchMethod: string | undefined;

      if (launch_cwd) {
        const launchResult = await launchTerminalSession({
          cwd: launch_cwd,
          targetBounds,
          dangerouslySkipPermissions: dangerously_skip_permissions,
        });
        launchMethod = launchResult.method;

        if (launchResult.success) {
          this.logger.log(`Smart tile: launched terminal (${launchResult.method}) in ${launch_cwd}`);
        } else {
          this.logger.warn(`Smart tile: failed to launch terminal: ${launchResult.error}`);
          sendWsResponse<SmartTileAddResultMessage>(ws, {
            type: 'smart_tile_add_result',
            success: false,
            repositioned,
            total_tiled: totalTiled,
            used_free_space: usedFreeSpace,
            launch_method: launchResult.method,
            error: launchResult.error,
          });
          return;
        }
      } else if (new_session_id) {
        const session = this.registry.getSession(new_session_id);
        if (session?.terminal_key) {
          await manager.positionWindow(session.terminal_key, targetBounds);
        }
      }

      sendWsResponse<SmartTileAddResultMessage>(ws, {
        type: 'smart_tile_add_result',
        success: true,
        repositioned,
        total_tiled: totalTiled,
        used_free_space: usedFreeSpace,
        launch_method: launchMethod,
      });

      this.logger.log(`Smart tile: ${usedFreeSpace ? 'free-space' : 'grid'} placement, ${repositioned} repositioned, ${totalTiled} total`);
    } catch (err) {
      this.logger.error(`Smart tile failed: ${err}`);
      sendWsResponse<SmartTileAddResultMessage>(ws, {
        type: 'smart_tile_add_result',
        success: false,
        repositioned: 0,
        total_tiled: 0,
        used_free_space: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
