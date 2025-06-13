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
    const workspace = global.workspace_manager.get_active_workspace();
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
                    .filter(isRegularWindow);
    
    if (windows.length === 0) return 0;
    
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
    
    return windows.length;
}

function calculateFibonacciRects(workArea, windowCount) {
    const rects = [];
    
    if (windowCount === 0) return rects;
    
    if (windowCount === 1) {
        // Single window gets full space
        rects.push({
            x: workArea.x,
            y: workArea.y,
            width: workArea.width,
            height: workArea.height
        });
        return rects;
    }
    
    // Start with full area
    let remainingArea = {
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height
    };
    
    // First window gets the larger section
    let isVerticalSplit = true;
    
    for (let i = 0; i < windowCount; i++) {
        let windowRect;
        
        if (i === windowCount - 1) {
            // Last window gets all remaining space
            windowRect = remainingArea;
        } else {
            if (isVerticalSplit) {
                // Split vertically (side by side)
                const firstWidth = Math.floor(remainingArea.width / PHI);
                
                // First window rect
                windowRect = {
                    x: remainingArea.x,
                    y: remainingArea.y,
                    width: firstWidth - WINDOW_PADDING,
                    height: remainingArea.height
                };
                
                // Update remaining area
                remainingArea = {
                    x: remainingArea.x + firstWidth + WINDOW_PADDING,
                    y: remainingArea.y,
                    width: remainingArea.width - firstWidth - WINDOW_PADDING,
                    height: remainingArea.height
                };
            } else {
                // Split horizontally (stacked)
                const firstHeight = Math.floor(remainingArea.height / PHI);
                
                // First window rect
                windowRect = {
                    x: remainingArea.x,
                    y: remainingArea.y,
                    width: remainingArea.width,
                    height: firstHeight - WINDOW_PADDING
                };
                
                // Update remaining area
                remainingArea = {
                    x: remainingArea.x,
                    y: remainingArea.y + firstHeight + WINDOW_PADDING,
                    width: remainingArea.width,
                    height: remainingArea.height - firstHeight - WINDOW_PADDING
                };
            }
            
            // Alternate between vertical and horizontal splits
            isVerticalSplit = !isVerticalSplit;
        }
        
        // Add padding to prevent overlaps
        windowRect.x += WINDOW_PADDING;
        windowRect.y += WINDOW_PADDING;
        windowRect.width = Math.max(windowRect.width - WINDOW_PADDING * 2, 100);
        windowRect.height = Math.max(windowRect.height - WINDOW_PADDING * 2, 100);
        
        rects.push(windowRect);
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
    
    const windowHeight = Math.floor((workArea.height - (windows.length + 1) * WINDOW_PADDING) / windows.length);
    
    // Apply horizontal tiling
    windows.forEach((window, i) => {
        WindowUtils.bounceWindowToPosition(
            window,
            workArea.x + WINDOW_PADDING,
            workArea.y + WINDOW_PADDING + (windowHeight + WINDOW_PADDING) * i,
            workArea.width - 2 * WINDOW_PADDING,
            windowHeight
        );
    });
}

function gridTiling(windows) {
    if (windows.length === 0) return;
    
    // Get workspace area
    const primaryMonitor = global.display.get_primary_monitor();
    const workArea = global.display.get_workspace_manager()
                     .get_active_workspace()
                     .get_work_area_for_monitor(primaryMonitor);
    
    // Calculate grid dimensions
    const rows = Math.floor(Math.sqrt(windows.length));
    const cols = Math.ceil(windows.length / rows);
    
    const cellWidth = Math.floor((workArea.width - (cols + 1) * WINDOW_PADDING) / cols);
    const cellHeight = Math.floor((workArea.height - (rows + 1) * WINDOW_PADDING) / rows);
    
    // Apply grid tiling
    windows.forEach((window, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        
        WindowUtils.bounceWindowToPosition(
            window,
            workArea.x + WINDOW_PADDING + (cellWidth + WINDOW_PADDING) * col,
            workArea.y + WINDOW_PADDING + (cellHeight + WINDOW_PADDING) * row,
            cellWidth,
            cellHeight
        );
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
}

export function disableTiling() {
    if (!tilingEnabled) return;
    
    tilingEnabled = false;
    
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
