/* dynamic.js */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as WindowUtils from './window.js';
import * as TilingUtils from './tiling.js';

let dynamicEnabled = false;
let signalConnections = [];
const windowPositions = new Map();
const WINDOW_PADDING = 8;

function isRegularWindow(window) {
    if (!window) return false;
    return !window.is_skip_taskbar() && 
           window.allows_resize() && 
           window.allows_move() &&
           window.get_window_type() === Meta.WindowType.NORMAL &&
           !window.is_fullscreen() && 
           window.get_maximized() === 0;
}

function getWindowKey(window) {
    // Create a unique identifier for the window
    return window.get_id ? window.get_id() : window.get_stable_sequence();
}

function saveWindowPosition(window) {
    const rect = window.get_frame_rect();
    windowPositions.set(getWindowKey(window), {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
    });
}

function applyDynamicTiling() {
    const workspace = global.workspace_manager.get_active_workspace();
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
                    .filter(isRegularWindow);
    
    if (windows.length === 0) return 0;
    
    // For each window, check if we have saved position
    windows.forEach(window => {
        const windowKey = getWindowKey(window);
        const savedPosition = windowPositions.get(windowKey);
        
        if (savedPosition) {
            // Apply saved position
            WindowUtils.bounceWindowToPosition(
                window,
                savedPosition.x,
                savedPosition.y,
                savedPosition.width,
                savedPosition.height
            );
        } else {
            // This is a new window we haven't seen before
            // Add it to our tracking and initially position it based on Fibonacci tiling
            saveWindowPosition(window);
        }
    });
    
    // Clean up positions for windows that no longer exist
    const currentWindowKeys = windows.map(getWindowKey);
    
    for (const key of windowPositions.keys()) {
        if (!currentWindowKeys.includes(key)) {
            windowPositions.delete(key);
        }
    }
    
    return windows.length;
}

export function enableDynamicTiling() {
    if (dynamicEnabled) return;
    
    // Make sure we disable fixed tiling if it's active
    if (TilingUtils.isTilingEnabled()) {
        TilingUtils.disableTiling();
    }
    
    dynamicEnabled = true;
    
    // First, set initial positions using Fibonacci layout
    initializeWithFibonacciTiling();
    
    // Then connect signals to track window changes
    
    // Track window movement and resizing
    const grabEndSignal = global.display.connect('grab-op-end', (display, window, op) => {
        const isMoveResize = 
            (op === Meta.GrabOp.MOVING || 
             op === Meta.GrabOp.KEYBOARD_MOVING || 
             op === Meta.GrabOp.MOVING_UNCONSTRAINED ||
             (op >= Meta.GrabOp.RESIZING_N && op <= Meta.GrabOp.KEYBOARD_RESIZING_SW));
        
        if (dynamicEnabled && window && isRegularWindow(window) && isMoveResize) {
            // Save the new position after the user moved/resized the window
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                saveWindowPosition(window);
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    
    signalConnections.push({
        object: global.display,
        signalId: grabEndSignal
    });
    
    // Handle new windows
    const windowCreatedSignal = global.display.connect('window-created', (display, window) => {
        if (dynamicEnabled && isRegularWindow(window)) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                // For new windows, we'll need to position them initially
                const windowKey = getWindowKey(window);
                
                if (!windowPositions.has(windowKey)) {
                    // Position new window using a Fibonacci layout
                    // For simplicity, we'll re-apply Fibonacci tiling to all windows
                    initializeSingleWindowPosition(window);
                }
                
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    
    signalConnections.push({
        object: global.display,
        signalId: windowCreatedSignal
    });
    
    // Handle window destruction
    const windowDestroyedSignal = global.window_manager.connect('destroy', (wm, actor) => {
        if (dynamicEnabled && actor.meta_window && isRegularWindow(actor.meta_window)) {
            const destroyedWindow = actor.meta_window;
            const windowKey = getWindowKey(destroyedWindow);
            
            // Remove from our tracked positions
            if (windowPositions.has(windowKey)) {
                windowPositions.delete(windowKey);
            }
        }
    });
    
    signalConnections.push({
        object: global.window_manager,
        signalId: windowDestroyedSignal
    });
}

function initializeWithFibonacciTiling() {
    // Use fixed tiling to set up initial positions
    const workspace = global.workspace_manager.get_active_workspace();
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
                    .filter(isRegularWindow);
    
    // Clear previous positions
    windowPositions.clear();
    
    // Temporarily enable fixed tiling to position all windows
    TilingUtils.enableTiling();
    TilingUtils.tileWindows();
    
    // Save all the positions
    windows.forEach(saveWindowPosition);
    
    // Disable fixed tiling again
    TilingUtils.disableTiling();
}

function initializeSingleWindowPosition(newWindow) {
    const workspace = global.workspace_manager.get_active_workspace();
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
                    .filter(isRegularWindow);
    
    // Temporarily enable fixed tiling to position all windows
    const wasTilingEnabled = TilingUtils.isTilingEnabled();
    if (!wasTilingEnabled) {
        TilingUtils.enableTiling();
    }
    
    TilingUtils.tileWindows();
    
    // Save only the new window position
    saveWindowPosition(newWindow);
    
    // Restore all other windows to their saved positions
    const newWindowKey = getWindowKey(newWindow);
    windows.forEach(window => {
        const windowKey = getWindowKey(window);
        if (windowKey !== newWindowKey && windowPositions.has(windowKey)) {
            const pos = windowPositions.get(windowKey);
            WindowUtils.bounceWindowToPosition(
                window,
                pos.x,
                pos.y,
                pos.width,
                pos.height
            );
        }
    });
    
    // Disable fixed tiling if it wasn't enabled before
    if (!wasTilingEnabled) {
        TilingUtils.disableTiling();
    }
}

export function disableDynamicTiling() {
    if (!dynamicEnabled) return;
    
    dynamicEnabled = false;
    
    // Disconnect all signals
    signalConnections.forEach(conn => {
        if (conn.object && conn.object.disconnect) {
            conn.object.disconnect(conn.signalId);
        }
    });
    
    signalConnections = [];
}

export function isDynamicTilingEnabled() {
    return dynamicEnabled;
}
