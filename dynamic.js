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
const GOLDEN_RATIO = 1.618; // Golden ratio for Fibonacci tiling
const windowList = []; // Array to store windows and their properties

// Window sector constants
const SECTOR = {
    TOP: 'top',
    RIGHT: 'right',
    BOTTOM: 'bottom',
    LEFT: 'left',
    CENTER: 'center'
};

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
    
    if (windows.length === 0) {
        windowList.length = 0;
        return 0;
    }
    
    // Sync our windowList with current windows
    syncWindowList(windows);
    
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
            
            // Add to window list
            const rect = window.get_frame_rect();
            windowList.push({
                window: window,
                key: windowKey,
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
            });
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

function syncWindowList(currentWindows) {
    // Remove windows from our list that no longer exist
    const currentWindowKeys = currentWindows.map(getWindowKey);
    windowList.forEach((item, index) => {
        if (!currentWindowKeys.includes(item.key)) {
            windowList.splice(index, 1);
        }
    });
    
    // Update positions of windows in our list
    currentWindows.forEach(window => {
        const windowKey = getWindowKey(window);
        const existingEntry = windowList.find(item => item.key === windowKey);
        
        if (existingEntry) {
            // Update position
            const rect = window.get_frame_rect();
            existingEntry.x = rect.x;
            existingEntry.y = rect.y;
            existingEntry.width = rect.width;
            existingEntry.height = rect.height;
        }
    });
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
                    // Position new window based on cursor position
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
    const workspace = global.workspace_manager.get_active_workspace();
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
                    .filter(isRegularWindow);
    
    // Clear previous positions and window list
    windowPositions.clear();
    windowList.length = 0;
    
    if (windows.length === 0) return;
    
    // Get workspace dimensions
    const workArea = workspace.get_work_area_for_monitor(global.display.get_primary_monitor());
    const availWidth = workArea.width - WINDOW_PADDING * 2;
    const availHeight = workArea.height - WINDOW_PADDING * 2;
    const startX = workArea.x + WINDOW_PADDING;
    const startY = workArea.y + WINDOW_PADDING;
    
    // Apply Fibonacci tiling algorithm
    applyFibonacciTiling(windows, startX, startY, availWidth, availHeight);
    
    // Save all window positions to our tracking
    windows.forEach(window => {
        saveWindowPosition(window);
        const rect = window.get_frame_rect();
        windowList.push({
            window: window,
            key: getWindowKey(window),
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
        });
    });
}

function applyFibonacciTiling(windows, x, y, width, height) {
    if (windows.length === 0) return;
    
    if (windows.length === 1) {
        // Just one window, use the entire space
        WindowUtils.bounceWindowToPosition(windows[0], x, y, width, height);
        return;
    }
    
    // Get the first window
    const firstWindow = windows[0];
    const remainingWindows = windows.slice(1);
    
    if (width > height) {
        // Split horizontally
        const firstWidth = Math.floor(width / GOLDEN_RATIO);
        const remainingWidth = width - firstWidth;
        
        // Position the first window
        WindowUtils.bounceWindowToPosition(
            firstWindow,
            x, y,
            firstWidth, height
        );
        
        // Recursively position the remaining windows
        applyFibonacciTiling(
            remainingWindows,
            x + firstWidth, y,
            remainingWidth, height
        );
    } else {
        // Split vertically
        const firstHeight = Math.floor(height / GOLDEN_RATIO);
        const remainingHeight = height - firstHeight;
        
        // Position the first window
        WindowUtils.bounceWindowToPosition(
            firstWindow,
            x, y,
            width, firstHeight
        );
        
        // Recursively position the remaining windows
        applyFibonacciTiling(
            remainingWindows,
            x, y + firstHeight,
            width, remainingHeight
        );
    }
}

function initializeSingleWindowPosition(newWindow) {
    // Position new window based on cursor position and window underneath
    const [x, y] = global.get_pointer();
    const windowUnderCursor = findWindowUnderCursor(x, y);
    
    if (!windowUnderCursor) {
        // No window under cursor, use default Fibonacci tiling for all windows
        initializeWithFibonacciTiling();
        return;
    }
    
    // Get the sector of the window where the cursor is
    const sector = getWindowSector(windowUnderCursor, x, y);
    
    // Split the window under cursor using golden ratio
    splitWindowBySector(windowUnderCursor, newWindow, sector);
    
    // Save new window position
    saveWindowPosition(newWindow);
    
    // Add to window list
    const rect = newWindow.get_frame_rect();
    windowList.push({
        window: newWindow,
        key: getWindowKey(newWindow),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
    });
}

function findWindowUnderCursor(x, y) {
    for (const windowInfo of windowList) {
        if (x >= windowInfo.x && 
            x <= windowInfo.x + windowInfo.width &&
            y >= windowInfo.y && 
            y <= windowInfo.y + windowInfo.height) {
            return windowInfo.window;
        }
    }
    return null;
}

function getWindowSector(window, x, y) {
    const rect = window.get_frame_rect();
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    
    // Determine horizontal position
    let horizontalSector;
    if (x < centerX) {
        horizontalSector = SECTOR.LEFT;
    } else {
        horizontalSector = SECTOR.RIGHT;
    }
    
    // Determine vertical position
    let verticalSector;
    if (y < centerY) {
        verticalSector = SECTOR.TOP;
    } else {
        verticalSector = SECTOR.BOTTOM;
    }
    
    // Return the sector based on which distance is greater
    const horizontalDistance = Math.abs(x - centerX) / (rect.width / 2);
    const verticalDistance = Math.abs(y - centerY) / (rect.height / 2);
    
    return horizontalDistance > verticalDistance ? horizontalSector : verticalSector;
}

function splitWindowBySector(existingWindow, newWindow, sector) {
    const existingWindowKey = getWindowKey(existingWindow);
    const existingWindowInfo = windowList.find(info => info.key === existingWindowKey);
    
    if (!existingWindowInfo) return;
    
    const { x, y, width, height } = existingWindowInfo;
    
    switch (sector) {
        case SECTOR.LEFT:
            // Split horizontally, new window on left
            const leftWidth = Math.floor(width / GOLDEN_RATIO);
            const rightWidth = width - leftWidth;
            
            // Position new window on left
            WindowUtils.bounceWindowToPosition(
                newWindow, 
                x, y, 
                leftWidth, height
            );
            
            // Resize existing window on right
            WindowUtils.bounceWindowToPosition(
                existingWindow,
                x + leftWidth, y,
                rightWidth, height
            );
            
            // Update the existing window in our windowList
            existingWindowInfo.x = x + leftWidth;
            existingWindowInfo.width = rightWidth;
            break;
            
        case SECTOR.RIGHT:
            // Split horizontally, new window on right
            const rightSplitWidth = Math.floor(width / GOLDEN_RATIO);
            const leftSplitWidth = width - rightSplitWidth;
            
            // Position new window on right
            WindowUtils.bounceWindowToPosition(
                newWindow,
                x + leftSplitWidth, y,
                rightSplitWidth, height
            );
            
            // Resize existing window on left
            WindowUtils.bounceWindowToPosition(
                existingWindow,
                x, y,
                leftSplitWidth, height
            );
            
            // Update the existing window in our windowList
            existingWindowInfo.width = leftSplitWidth;
            break;
            
        case SECTOR.TOP:
            // Split vertically, new window on top
            const topHeight = Math.floor(height / GOLDEN_RATIO);
            const bottomHeight = height - topHeight;
            
            // Position new window on top
            WindowUtils.bounceWindowToPosition(
                newWindow,
                x, y,
                width, topHeight
            );
            
            // Resize existing window on bottom
            WindowUtils.bounceWindowToPosition(
                existingWindow,
                x, y + topHeight,
                width, bottomHeight
            );
            
            // Update the existing window in our windowList
            existingWindowInfo.y = y + topHeight;
            existingWindowInfo.height = bottomHeight;
            break;
            
        case SECTOR.BOTTOM:
            // Split vertically, new window on bottom
            const bottomSplitHeight = Math.floor(height / GOLDEN_RATIO);
            const topSplitHeight = height - bottomSplitHeight;
            
            // Position new window on bottom
            WindowUtils.bounceWindowToPosition(
                newWindow,
                x, y + topSplitHeight,
                width, bottomSplitHeight
            );
            
            // Resize existing window on top
            WindowUtils.bounceWindowToPosition(
                existingWindow,
                x, y,
                width, topSplitHeight
            );
            
            // Update the existing window in our windowList
            existingWindowInfo.height = topSplitHeight;
            break;
    }
    
    // Update the existing window's position in the windowPositions map
    saveWindowPosition(existingWindow);
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
    
    // Clear window list
    windowList.length = 0;
}

export function isDynamicTilingEnabled() {
    return dynamicEnabled;
}
