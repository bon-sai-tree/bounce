/* window.js
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
import GObject from 'gi://GObject';

// Track signals so we can disconnect them later
let signalConnections = [];

// Flag to track if bounce mode is enabled
let bounceEnabled = false;

/**
 * Centers all windows on the current workspace and resizes them to 50% of the screen
 * 
 * @returns {number} The number of windows that were centered
 */
export function centerAllWindows() {
    // Get the current active workspace
    const workspaceManager = global.workspace_manager;
    const activeWorkspace = workspaceManager.get_active_workspace();
    
    // Get all windows on the current workspace
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL, activeWorkspace);
    
    console.log(`[Bounce] Centering ${windows.length} windows on the current workspace`);
    
    let centeredCount = 0;
    
    // Center each window
    windows.forEach(window => {
        if (centerWindow(window)) {
            centeredCount++;
        }
    });
    
    console.log(`[Bounce] Successfully centered ${centeredCount} windows`);
    return centeredCount;
}

/**
 * Centers a specific window and resizes it to 50% of the screen
 * 
 * @param {Meta.Window} window - The window to center
 * @param {boolean} animate - Whether to animate the transition
 * @returns {boolean} True if the window was centered, false otherwise
 */
export function centerWindow(window, animate = true) {
    if (!window) return false;
    
    // Skip special windows that shouldn't be resized
    if (!isRegularWindow(window)) {
        console.log(`[Bounce] Skipping special window: ${window.get_title()}`);
        return false;
    }
    
    // If animation is requested, use the bounce animation
    if (animate) {
        return animateBounceToCenter(window);
    }
    
    // Otherwise use the immediate centering (for initial setup)
    // Get the monitor that contains the window
    const monitor = window.get_monitor();
    const workArea = window.get_work_area_for_monitor(monitor);
    
    // Calculate 50% of the workarea dimensions
    const newWidth = Math.floor(workArea.width * 0.5);
    const newHeight = Math.floor(workArea.height * 0.5);
    
    // Calculate the center position
    const newX = Math.floor(workArea.x + (workArea.width - newWidth) / 2);
    const newY = Math.floor(workArea.y + (workArea.height - newHeight) / 2);
    
    // First ensure window is unmaximized
    window.unmaximize(Meta.MaximizeFlags.BOTH);
    
    // Move and resize the window
    window.move_resize_frame(true, newX, newY, newWidth, newHeight);
    
    console.log(`[Bounce] Window "${window.get_title()}" centered to ${newX},${newY} with size ${newWidth}x${newHeight}`);
    return true;
}

/**
 * Enable bounce mode - windows will return to center after being moved
 */
export function enableForceCentering() {
    if (bounceEnabled) return;
    
    console.log('[Bounce] Enabling bounce mode');
    bounceEnabled = true;
    
    // Center all windows first (without animation for the initial setup)
    // We'll implement a special version for initial centering
    centerAllWindowsInitial();
    
    // Connect to the grab operation end signal to detect when window moves finish
    const grabEndSignal = global.display.connect('grab-op-end', (display, metaWindow, grabOp) => {
        // Only re-center after move or resize operations
        const isMove = grabOp === Meta.GrabOp.MOVING ||
            grabOp === Meta.GrabOp.KEYBOARD_MOVING ||
            grabOp === Meta.GrabOp.MOVING_UNCONSTRAINED ||
            grabOp === Meta.GrabOp.WINDOW_BASE;
                      
        // For debugging, log the grab operation if it's not in our existing conditions
        if (!isMove && 
            grabOp !== Meta.GrabOp.NONE && 
            metaWindow && 
            grabOp !== Meta.GrabOp.COMPOSITOR && 
            grabOp !== Meta.GrabOp.WAYLAND_POPUP) {
            console.log(`[Bounce] Debug: Unhandled grab operation: ${grabOp} on window ${metaWindow.get_title()}`);
        }
                        
        // Let's be more inclusive and handle any resizing operation
        const isResize = 
            // Standard resizing operations
            grabOp === Meta.GrabOp.RESIZING_N ||
            grabOp === Meta.GrabOp.RESIZING_S || 
            grabOp === Meta.GrabOp.RESIZING_E ||
            grabOp === Meta.GrabOp.RESIZING_W ||
            grabOp === Meta.GrabOp.RESIZING_NE ||
            grabOp === Meta.GrabOp.RESIZING_NW ||
            grabOp === Meta.GrabOp.RESIZING_SE ||
            grabOp === Meta.GrabOp.RESIZING_SW ||
            
            // Keyboard resizing operations
            grabOp === Meta.GrabOp.KEYBOARD_RESIZING_N ||
            grabOp === Meta.GrabOp.KEYBOARD_RESIZING_S ||
            grabOp === Meta.GrabOp.KEYBOARD_RESIZING_E ||
            grabOp === Meta.GrabOp.KEYBOARD_RESIZING_W ||
            grabOp === Meta.GrabOp.KEYBOARD_RESIZING_NE ||
            grabOp === Meta.GrabOp.KEYBOARD_RESIZING_NW ||
            grabOp === Meta.GrabOp.KEYBOARD_RESIZING_SE ||
            grabOp === Meta.GrabOp.KEYBOARD_RESIZING_SW ||
            
            // Other resize operations
            grabOp === Meta.GrabOp.RESIZING_UNKNOWN ||
            
            // Super+middle button can behave as a resize in some configurations
            grabOp === Meta.GrabOp.WINDOW_BASE || 
            
            // Catch-all: any operation that changes frame size should be considered a resize
            (metaWindow && 
             bounceEnabled && 
             metaWindow.get_frame_type() !== Meta.FrameType.TILED &&
             grabOp !== Meta.GrabOp.NONE &&
             grabOp !== Meta.GrabOp.COMPOSITOR);
        
        if (bounceEnabled && metaWindow && isRegularWindow(metaWindow) && (isMove || isResize)) {
            console.log(`[Bounce] Window "${metaWindow.get_title()}" ${isMove ? 'moved' : 'resized'} with grab operation: ${grabOp}, returning to center with bounce`);
            
            // Add a tiny delay to ensure the grab is fully completed
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                centerWindow(metaWindow, true); // true = animate
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    
    signalConnections.push({
        object: global.display,
        signalId: grabEndSignal
    });
    
    // Also connect to the 'window-created' signal to center new windows
    const windowCreatedSignal = global.display.connect('window-created', (display, metaWindow) => {
        if (bounceEnabled && isRegularWindow(metaWindow)) {
            // Wait a moment for the window to settle
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                console.log(`[Bounce] New window created: ${metaWindow.get_title()}`);
                centerWindow(metaWindow, true); // true = animate
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    
    signalConnections.push({
        object: global.display,
        signalId: windowCreatedSignal
    });
    
    // Also track window size changes independently as a fallback
    // This helps catch Super+middle button resizes that might not be categorized properly
    const windowSizeSignal = global.window_manager.connect('size-change', (wm, actor) => {
        if (!bounceEnabled) return;
        
        // Get the metaWindow from the actor
        const metaWindow = actor.get_meta_window();
        if (!metaWindow || !isRegularWindow(metaWindow)) return;
        
        // Skip if we're in the middle of a grab operation
        // This avoids duplicate re-centering
        if (global.display.get_grab_op() !== Meta.GrabOp.NONE) return;
        
        console.log(`[Bounce] Window "${metaWindow.get_title()}" size changed (detected by size-change signal)`);
        
        // Add a small delay to ensure all size operations are complete
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            if (bounceEnabled && isRegularWindow(metaWindow)) {
                centerWindow(metaWindow, true); // true = animate with bounce
            }
            return GLib.SOURCE_REMOVE;
        });
    });
    
    signalConnections.push({
        object: global.window_manager,
        signalId: windowSizeSignal
    });
}

/**
 * Disable bounce mode
 */
export function disableForceCentering() {
    if (!bounceEnabled) return;
    
    console.log('[Bounce] Disabling bounce mode');
    bounceEnabled = false;
    
    // Disconnect all signals
    signalConnections.forEach(connection => {
        if (connection.object && connection.object.disconnect) {
            connection.object.disconnect(connection.signalId);
        }
    });
    
    signalConnections = [];
}

/**
 * Check if the window is a regular application window that should be managed
 */
function isRegularWindow(window) {
    if (!window) return false;
    
    return !window.is_skip_taskbar() && 
           window.allows_resize() && 
           window.allows_move() &&
           window.get_window_type() === Meta.WindowType.NORMAL &&
           !window.is_fullscreen() && 
           window.get_maximized() === 0;
}

/**
 * Check if bounce mode is currently enabled
 * 
 * @returns {boolean} True if bounce mode is enabled
 */
export function isForceCenteringEnabled() {
    return bounceEnabled;
}

/**
 * Animation constants
 */
const BOUNCE_DURATION = 1000; // milliseconds (slower animation)
const EASE_IN_OUT_BOUNCE = Clutter.AnimationMode.EASE_IN_OUT_BOUNCE;
const EASE_OUT_ELASTIC = Clutter.AnimationMode.EASE_OUT_ELASTIC; // More natural bounce

/**
 * Animates a window to the center of the screen with a bounce effect
 * 
 * @param {Meta.Window} window - The window to animate
 * @returns {boolean} True if the animation was started, false otherwise
 */
function animateBounceToCenter(window) {
    if (!window) return false;
    
    // Skip special windows that shouldn't be animated
    if (!isRegularWindow(window)) {
        console.log(`[Bounce] Skipping special window for animation: ${window.get_title()}`);
        return false;
    }
    
    // Get the monitor that contains the window
    const monitor = window.get_monitor();
    const workArea = window.get_work_area_for_monitor(monitor);
    
    // Calculate 50% of the workarea dimensions
    const targetWidth = Math.floor(workArea.width * 0.5);
    const targetHeight = Math.floor(workArea.height * 0.5);
    
    // Calculate the center position
    const targetX = Math.floor(workArea.x + (workArea.width - targetWidth) / 2);
    const targetY = Math.floor(workArea.y + (workArea.height - targetHeight) / 2);
    
    // First ensure window is unmaximized
    window.unmaximize(Meta.MaximizeFlags.BOTH);
    
    // Get current position and size
    const frameRect = window.get_frame_rect();
    
    // Get the window actor for animation
    const windowActor = window.get_compositor_private();
    if (!windowActor) {
        console.log(`[Bounce] Cannot find window actor for: ${window.get_title()}`);
        // Fall back to immediate positioning
        window.move_resize_frame(true, targetX, targetY, targetWidth, targetHeight);
        return false;
    }
    
    // Remove any ongoing animations to avoid conflicts
    windowActor.remove_all_transitions();
    
    // Calculate how far off center the window currently is
    const centerOffsetX = frameRect.x - targetX;
    const centerOffsetY = frameRect.y - targetY;
    
    // Start with the target size
    window.move_resize_frame(false, frameRect.x, frameRect.y, targetWidth, targetHeight);
    
    // Calculate bounce parameters - we want to start from the current position
    // and bounce toward the center, not in the opposite direction
    
    // For debugging
    console.log(`[Bounce] Current position: ${frameRect.x},${frameRect.y} Target: ${targetX},${targetY}`);
    
    // Start the animation from the current position
    // No need to move the window as it's already at the starting position
    
    console.log(`[Bounce] Animating from ${frameRect.x},${frameRect.y} to center at ${targetX},${targetY}`);
    
    // First resize the window immediately to target size
    window.move_resize_frame(false, frameRect.x, frameRect.y, targetWidth, targetHeight);
    
    // Use the built-in Clutter animation system with elastic bounce effect
    windowActor.ease({
        x: targetX,
        y: targetY, 
        duration: BOUNCE_DURATION,
        mode: EASE_OUT_ELASTIC,
        onComplete: () => {
            // Ensure the window is exactly at the target position and size
            window.move_resize_frame(true, targetX, targetY, targetWidth, targetHeight);
            console.log(`[Bounce] Completed animation for: ${window.get_title()}`);
        }
    });
    
    console.log(`[Bounce] Started bounce animation for window: ${window.get_title()}`);
    
    console.log(`[Bounce] Started bounce animation for: ${window.get_title()}`);
    return true;
}

/**
 * Centers all windows on the current workspace without animation (for initial setup)
 */
function centerAllWindowsInitial() {
    // Get the current active workspace
    const workspaceManager = global.workspace_manager;
    const activeWorkspace = workspaceManager.get_active_workspace();
    
    // Get all windows on the current workspace
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL, activeWorkspace);
    
    console.log(`[Bounce] Initially centering ${windows.length} windows without animation`);
    
    let centeredCount = 0;
    
    // Center each window without animation
    windows.forEach(window => {
        if (centerWindow(window, false)) { // false = no animation
            centeredCount++;
        }
    });
    
    console.log(`[Bounce] Successfully centered ${centeredCount} windows`);
    return centeredCount;
}
