/* tiling.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

// Import our window utilities
import * as WindowUtils from './window.js';

// Tiling mode constants
export const TilingMode = {
    FIBONACCI: 0,
    HORIZONTAL: 1,
    GRID: 2
};

// Current tiling mode
let currentMode = TilingMode.FIBONACCI;

// Padding between windows
const WINDOW_PADDING = 8;

// Track signals so we can disconnect them
let signalConnections = [];

// Flag to track if tiling is enabled
let tilingEnabled = false;

// Track the last calculated positions for each window
let lastWindowPositions = new Map();

// Golden ratio constant (~1.618) for Fibonacci layout
const PHI = (1 + Math.sqrt(5)) / 2;

function isRegularWindow(window) {
    if (!window) return false;
    return !window.is_skip_taskbar() && 
           window.allows_resize() && 
           window.allows_move() &&
           window.get_window_type() === Meta.WindowType.NORMAL &&
           !window.is_fullscreen() && 
           window.get_maximized() === 0;
}

export function tileWindows() {
    // Clear previous window position tracking
    lastWindowPositions.clear();
    
    const workspace = global.workspace_manager.get_active_workspace();
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
                    .filter(isRegularWindow);
    
    if (windows.length === 0) return 0;
    
    // Choose tiling function based on current mode
    switch (currentMode) {
        case TilingMode.FIBONACCI:
            fibonacciTiling(windows);
            break;
        case TilingMode.HORIZONTAL:
            horizontalTiling(windows);
            break;
        case TilingMode.GRID:
            gridTiling(windows);
            break;
    }
    
    // Store the current positions of windows for later drift detection
    windows.forEach(window => {
        const rect = window.get_frame_rect();
        lastWindowPositions.set(window, {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
        });
    });
    
    return windows.length;
}

function calculateFibonacciRects(workArea, windowCount) {
    const rects = [];
    
    if (windowCount === 0) return rects;
    
    // Add small amount of padding to keep windows away from screen edges
    const safeWorkArea = {
        x: Math.round(workArea.x + WINDOW_PADDING),
        y: Math.round(workArea.y + WINDOW_PADDING),
        width: Math.round(workArea.width - WINDOW_PADDING * 2),
        height: Math.round(workArea.height - WINDOW_PADDING * 2)
    };
    
    if (windowCount === 1) {
        // Single window gets full space
        rects.push({
            x: safeWorkArea.x,
            y: safeWorkArea.y,
            width: safeWorkArea.width,
            height: safeWorkArea.height
        });
        return rects;
    }
    
    // Start with full area
    let remainingArea = {
        x: safeWorkArea.x,
        y: safeWorkArea.y,
        width: safeWorkArea.width,
        height: safeWorkArea.height
    };
    
    // First window gets the larger section
    let isVerticalSplit = true;
    
    for (let i = 0; i < windowCount; i++) {
        let windowRect;
        
        if (i === windowCount - 1) {
            // Last window gets all remaining space
            windowRect = {
                x: Math.round(remainingArea.x),
                y: Math.round(remainingArea.y),
                width: Math.round(remainingArea.width),
                height: Math.round(remainingArea.height)
            };
        } else {
            if (isVerticalSplit) {
                // Split vertically (side by side)
                const firstWidth = Math.round(remainingArea.width / PHI);
                
                // First window rect with exact integers
                windowRect = {
                    x: Math.round(remainingArea.x),
                    y: Math.round(remainingArea.y),
                    width: Math.round(firstWidth - WINDOW_PADDING),
                    height: Math.round(remainingArea.height)
                };
                
                // Update remaining area with exact integers
                remainingArea = {
                    x: Math.round(remainingArea.x + firstWidth + WINDOW_PADDING),
                    y: Math.round(remainingArea.y),
                    width: Math.round(remainingArea.width - firstWidth - WINDOW_PADDING),
                    height: Math.round(remainingArea.height)
                };
            } else {
                // Split horizontally (stacked)
                const firstHeight = Math.round(remainingArea.height / PHI);
                
                // First window rect with exact integers
                windowRect = {
                    x: Math.round(remainingArea.x),
                    y: Math.round(remainingArea.y),
                    width: Math.round(remainingArea.width),
                    height: Math.round(firstHeight - WINDOW_PADDING)
                };
                
                // Update remaining area with exact integers
                remainingArea = {
                    x: Math.round(remainingArea.x),
                    y: Math.round(remainingArea.y + firstHeight + WINDOW_PADDING),
                    width: Math.round(remainingArea.width),
                    height: Math.round(remainingArea.height - firstHeight - WINDOW_PADDING)
                };
            }
            
            // Alternate between vertical and horizontal splits
            isVerticalSplit = !isVerticalSplit;
        }
        
        // Ensure minimum dimensions
        windowRect.width = Math.max(windowRect.width, 100);
        windowRect.height = Math.max(windowRect.height, 100);
        
        // Ensure window is within the work area bounds
        windowRect.x = Math.max(safeWorkArea.x, Math.min(windowRect.x, 
                      safeWorkArea.x + safeWorkArea.width - windowRect.width));
        windowRect.y = Math.max(safeWorkArea.y, Math.min(windowRect.y, 
                      safeWorkArea.y + safeWorkArea.height - windowRect.height));
        
        // Store exact integer values to prevent rounding errors
        rects.push({
            x: Math.round(windowRect.x),
            y: Math.round(windowRect.y),
            width: Math.round(windowRect.width),
            height: Math.round(windowRect.height)
        });
    }
    
    return rects;
}

function fibonacciTiling(windows) {
    if (windows.length === 0) return;
    
    // Get workspace area
    const primaryMonitor = global.display.get_primary_monitor();
    const workArea = global.display.get_workspace_manager()
                     .get_active_workspace()
                     .get_work_area_for_monitor(primaryMonitor);
    
    // Calculate window positions based on Fibonacci sequence
    const windowRects = calculateFibonacciRects(workArea, windows.length);
    
    // Apply the calculated positions to windows
    windows.forEach((window, i) => {
        const rect = windowRects[i];
        WindowUtils.bounceWindowToPosition(
            window,
            rect.x,
            rect.y,
            rect.width,
            rect.height
        );
    });
}

function horizontalTiling(windows) {
    if (windows.length === 0) return;
    
    // Get workspace area
    const primaryMonitor = global.display.get_primary_monitor();
    const workArea = global.display.get_workspace_manager()
                     .get_active_workspace()
                     .get_work_area_for_monitor(primaryMonitor);
    
    // Create a safer work area with padding
    const safeWorkArea = {
        x: Math.round(workArea.x + WINDOW_PADDING),
        y: Math.round(workArea.y + WINDOW_PADDING),
        width: Math.round(workArea.width - WINDOW_PADDING * 2),
        height: Math.round(workArea.height - WINDOW_PADDING * 2)
    };
    
    const windowHeight = Math.floor((safeWorkArea.height - (windows.length - 1) * WINDOW_PADDING) / windows.length);
    
    // Apply horizontal tiling with exact integer positions
    windows.forEach((window, i) => {
        const posX = Math.round(safeWorkArea.x);
        const posY = Math.round(safeWorkArea.y + (windowHeight + WINDOW_PADDING) * i);
        const width = Math.round(safeWorkArea.width);
        const height = Math.round(windowHeight);
        
        WindowUtils.bounceWindowToPosition(window, posX, posY, width, height);
    });
}

function gridTiling(windows) {
    if (windows.length === 0) return;
    
    // Get workspace area
    const primaryMonitor = global.display.get_primary_monitor();
    const workArea = global.display.get_workspace_manager()
                     .get_active_workspace()
                     .get_work_area_for_monitor(primaryMonitor);
    
    // Create a safer work area with padding
    const safeWorkArea = {
        x: Math.round(workArea.x + WINDOW_PADDING),
        y: Math.round(workArea.y + WINDOW_PADDING),
        width: Math.round(workArea.width - WINDOW_PADDING * 2),
        height: Math.round(workArea.height - WINDOW_PADDING * 2)
    };
    
    // Calculate grid dimensions
    const rows = Math.floor(Math.sqrt(windows.length));
    const cols = Math.ceil(windows.length / rows);
    
    const cellWidth = Math.floor((safeWorkArea.width - (cols - 1) * WINDOW_PADDING) / cols);
    const cellHeight = Math.floor((safeWorkArea.height - (rows - 1) * WINDOW_PADDING) / rows);
    
    // Apply grid tiling with exact integer positions
    windows.forEach((window, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        
        const posX = Math.round(safeWorkArea.x + (cellWidth + WINDOW_PADDING) * col);
        const posY = Math.round(safeWorkArea.y + (cellHeight + WINDOW_PADDING) * row);
        const width = Math.round(cellWidth);
        const height = Math.round(cellHeight);
        
        WindowUtils.bounceWindowToPosition(window, posX, posY, width, height);
    });
}

export function cycleTilingMode() {
    currentMode = (currentMode + 1) % 3; // Cycle through modes
    tileWindows();
    return getModeString();
}

export function getModeString() {
    switch (currentMode) {
        case TilingMode.FIBONACCI: return 'Fibonacci';
        case TilingMode.HORIZONTAL: return 'Horizontal';
        case TilingMode.GRID: return 'Grid';
    }
    return 'Unknown';
}

export function enableTiling() {
    if (tilingEnabled) return;
    
    tilingEnabled = true;
    tileWindows();
    
    // Monitor window grab operations to update tiling when windows are moved
    const grabEndSignal = global.display.connect('grab-op-end', (display, window, op) => {
        const isMoveResize = 
            (op === Meta.GrabOp.MOVING || 
             op === Meta.GrabOp.KEYBOARD_MOVING || 
             op === Meta.GrabOp.MOVING_UNCONSTRAINED ||
             (op >= Meta.GrabOp.RESIZING_N && op <= Meta.GrabOp.KEYBOARD_RESIZING_SW));
        
        if (tilingEnabled && window && isRegularWindow(window) && isMoveResize) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                tileWindows();
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    
    signalConnections.push({
        object: global.display,
        signalId: grabEndSignal
    });
    
    // Handle new windows and retile
    const windowCreatedSignal = global.display.connect('window-created', (display, window) => {
        if (tilingEnabled && isRegularWindow(window)) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                tileWindows();
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    
    signalConnections.push({
        object: global.display,
        signalId: windowCreatedSignal
    });
    
    // Handle window destruction and retile
    const windowDestroyedSignal = global.window_manager.connect('destroy', (wm, actor) => {
        if (tilingEnabled && actor.meta_window && isRegularWindow(actor.meta_window)) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                tileWindows();
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    
    signalConnections.push({
        object: global.window_manager,
        signalId: windowDestroyedSignal
    });
    
    // Add a periodic check to detect and fix drifting windows
    // This will run every 3 seconds when tiling is enabled
    const driftCheckId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
        if (!tilingEnabled) {
            return GLib.SOURCE_REMOVE;
        }
        
        // Check if any windows have drifted from their correct positions
        const workspace = global.workspace_manager.get_active_workspace();
        const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
                        .filter(isRegularWindow);
        
        let hasDrift = false;
        
        // Only check for drift when no grab operations are in progress
        if (global.display.get_grab_op() === Meta.GrabOp.NONE && windows.length > 0) {
            // Check each window for position drift
            for (const window of windows) {
                const lastPosition = lastWindowPositions.get(window);
                if (!lastPosition) {
                    hasDrift = true;
                    break;
                }
                
                const currentRect = window.get_frame_rect();
                
                // Check if position has changed by more than 2 pixels in any direction
                // (small threshold to avoid unnecessary retiling)
                if (Math.abs(currentRect.x - lastPosition.x) > 2 ||
                    Math.abs(currentRect.y - lastPosition.y) > 2 ||
                    Math.abs(currentRect.width - lastPosition.width) > 2 ||
                    Math.abs(currentRect.height - lastPosition.height) > 2) {
                    hasDrift = true;
                    break;
                }
            }
            
            // If any drift was detected, retile all windows
            if (hasDrift) {
                console.log('[Bounce] Drift detected, retiling windows');
                tileWindows();
            }
        }
        
        return GLib.SOURCE_CONTINUE;
    });
    
    signalConnections.push({
        object: GLib,
        signalId: driftCheckId
    });
}

export function disableTiling() {
    if (!tilingEnabled) return;
    
    tilingEnabled = false;
    
    // Clear window position tracking
    lastWindowPositions.clear();
    
    // Disconnect all signals
    signalConnections.forEach(conn => {
        if (conn.object && conn.object.disconnect) {
            conn.object.disconnect(conn.signalId);
        }
    });
    
    signalConnections = [];
}

export function isTilingEnabled() {
    return tilingEnabled;
}
