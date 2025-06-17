/* tiling.js
 *
 * Main tiling coordination and public API
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import * as WindowPlacement from './window-placement.js';
import * as WindowTracking from './window-tracking.js';
import * as TilingAlgorithms from './tiling-algorithms.js';

let enabled = false;
let signals = [];

function getWorkArea() {
    const workspace = global.workspace_manager.get_active_workspace();
    return workspace.get_work_area_for_monitor(global.display.get_primary_monitor());
}

function tileAll() {
    const workArea = getWorkArea();
    const activeWindows = global.display.get_tab_list(Meta.TabList.NORMAL, global.workspace_manager.get_active_workspace())
                          .filter(TilingAlgorithms.isValidWindow);
    
    console.log(`[Bounce] Tiling ${activeWindows.length} windows`);
    WindowTracking.clearWindows();
    
    if (activeWindows.length === 0) return;
    
    if (activeWindows.length === 1) {
        import('./window.js').then(WindowUtils => {
            WindowUtils.bounceWindowToPosition(activeWindows[0], workArea.x, workArea.y, workArea.width, workArea.height);
        });
        WindowTracking.addWindow(activeWindows[0], workArea.x, workArea.y, workArea.width, workArea.height);
        return;
    }
    
    TilingAlgorithms.fibonacciTile(activeWindows, workArea.x, workArea.y, workArea.width, workArea.height);
    // After fibonacci tiling, we need to reconstruct the positions without querying windows
    // For simplicity, let's re-calculate and add them
    const positions = TilingAlgorithms.calculateFibonacciPositions(activeWindows, workArea.x, workArea.y, workArea.width, workArea.height);
    for (let i = 0; i < activeWindows.length; i++) {
        const pos = positions[i];
        WindowTracking.addWindow(activeWindows[i], pos.x, pos.y, pos.width, pos.height);
    }
}

// Wrapper functions to pass dependencies to other modules
function splitWindow(existingItem, newWindow, sector) {
    TilingAlgorithms.splitWindow(existingItem, newWindow, sector, WindowTracking.updateWindow, WindowTracking.addWindow);
}

export function enableDynamicTiling() {
    if (enabled) return;
    console.log('[Bounce] Enabling dynamic tiling');
    enabled = true;
    
    // Override window placement for immediate positioning
    WindowPlacement.overrideWindowPlacement(
        () => enabled,
        WindowTracking.getWindows,
        WindowTracking.addWindow,
        getWorkArea,
        WindowTracking.findWindowAt,
        TilingAlgorithms.getSector,
        splitWindow,
        tileAll,
        TilingAlgorithms.isValidWindow
    );
    
    tileAll();
    
    const grabEnd = global.display.connect('grab-op-end', (display, window, op) => {
        if (enabled && TilingAlgorithms.isValidWindow(window) && (op === Meta.GrabOp.MOVING || op >= Meta.GrabOp.RESIZING_N)) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                // For user-initiated moves/resizes, we simply remove and re-add based on our current tracking
                // The user's manual positioning breaks our tiling logic anyway
                WindowTracking.removeWindow(window);
                return GLib.SOURCE_REMOVE;
            });
        }
    });

    const windowDestroyed = global.window_manager.connect('destroy', (wm, actor) => {
        if (enabled && actor.meta_window && TilingAlgorithms.isValidWindow(actor.meta_window)) {
            WindowTracking.closeWindow(actor.meta_window);
        }
    });
    
    signals.push(
        { object: global.display, id: grabEnd },
        { object: global.window_manager, id: windowDestroyed }
    );
}

export function disableDynamicTiling() {
    if (!enabled) return;
    console.log('[Bounce] Disabling dynamic tiling');
    enabled = false;
    
    // Restore original window placement
    WindowPlacement.restoreWindowPlacement();
    
    signals.forEach(s => s.object.disconnect(s.id));
    signals = [];
    WindowTracking.clearWindows();
}

export function isDynamicTilingEnabled() {
    return enabled;
}
