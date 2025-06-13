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

let signalConnections = [];
let bounceEnabled = false;
const GAP = 8;

function isRegularWindow(window) {
    if (!window) return false;
    return !window.is_skip_taskbar() && 
           window.allows_resize() && 
           window.allows_move() &&
           window.get_window_type() === Meta.WindowType.NORMAL &&
           !window.is_fullscreen() && 
           window.get_maximized() === 0;
}

export function bounceWindowToPosition(window, targetX, targetY, targetWidth, targetHeight) {
    if (!isRegularWindow(window)) return false;
    
    // Apply gaps directly here
    targetX += GAP;
    targetY += GAP;
    targetWidth -= 2 * GAP;
    targetHeight -= 2 * GAP;
    
    window.unmaximize(Meta.MaximizeFlags.BOTH);
    
    // Ensure the target position is valid by getting the current monitor boundaries
    const monitor = window.get_monitor();
    const workArea = window.get_work_area_for_monitor(monitor);
    
    // Apply constraints to ensure the window stays within screen boundaries
    const safeTargetX = Math.max(workArea.x, Math.min(targetX, workArea.x + workArea.width - targetWidth));
    const safeTargetY = Math.max(workArea.y, Math.min(targetY, workArea.y + workArea.height - targetHeight));
    
    // Use the constrained values from now on
    targetX = safeTargetX;
    targetY = safeTargetY;
    
    const actor = window.get_compositor_private();
    if (!actor) {
        window.move_resize_frame(true, targetX, targetY, targetWidth, targetHeight);
        return false;
    }
    
    // Stop any ongoing animations
    actor.remove_all_transitions();
    
    const frameRect = window.get_frame_rect();
    const actorRect = {x: actor.x, y: actor.y, width: actor.width, height: actor.height};
    const offset = {x: frameRect.x - actorRect.x, y: frameRect.y - actorRect.y};
    
    // First resize the window but keep the position
    window.move_resize_frame(false, frameRect.x, frameRect.y, targetWidth, targetHeight);
    
    // Track whether animation is still active to avoid race conditions
    let isAnimating = true;
    
    // Create a reliable sync function that properly tracks position
    let timeoutId = null;
    const syncFrame = () => {
        if (!window.get_compositor_private() || !isAnimating) {
            if (timeoutId) {
                GLib.source_remove(timeoutId);
                timeoutId = null;
            }
            return GLib.SOURCE_REMOVE;
        }
        
        // Calculate exact actor position 
        const newFrameX = Math.round(actor.x + offset.x);
        const newFrameY = Math.round(actor.y + offset.y);
        
        // Move the window frame to match actor position
        window.move_frame(false, newFrameX, newFrameY);
        
        return GLib.SOURCE_CONTINUE;
    };
    
    // Set up sync on a relatively fast timer for smoother animation
    timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, syncFrame);
    
    // Begin the animation with the elastic bounce effect
    actor.ease({
        x: targetX - offset.x,
        y: targetY - offset.y,
        duration: 800,
        mode: Clutter.AnimationMode.EASE_OUT_ELASTIC,
        onComplete: () => {
            // Animation is done
            isAnimating = false;
            
            // Clean up the timeout
            if (timeoutId) {
                GLib.source_remove(timeoutId);
                timeoutId = null;
            }
            
            // Final positioning - this ensures the window ends up exactly at the target
            actor.set_position(targetX - offset.x, targetY - offset.y);
            window.move_resize_frame(true, targetX, targetY, targetWidth, targetHeight);
            
            // Double check position after a short delay
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                if (!window.get_compositor_private()) return GLib.SOURCE_REMOVE;
                
                const finalRect = window.get_frame_rect();
                if (finalRect.x !== targetX || finalRect.y !== targetY) {
                    // Force position correction if needed
                    window.move_resize_frame(true, targetX, targetY, targetWidth, targetHeight);
                }
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    
    return true;
}

export function centerWindow(window, animate = true) {
    if (!window || !isRegularWindow(window)) return false;
    
    const monitor = window.get_monitor();
    const workArea = window.get_work_area_for_monitor(monitor);
    
    const width = Math.floor(workArea.width * 0.5);
    const height = Math.floor(workArea.height * 0.5);
    
    const x = Math.floor(workArea.x + (workArea.width - width) / 2);
    const y = Math.floor(workArea.y + (workArea.height - height) / 2);
    
    if (animate) {
        return bounceWindowToPosition(window, x, y, width, height);
    } else {
        window.unmaximize(Meta.MaximizeFlags.BOTH);
        window.move_resize_frame(true, x, y, width, height);
        return true;
    }
}

export function centerAllWindows() {
    const workspace = global.workspace_manager.get_active_workspace();
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace);
    
    let count = 0;
    windows.forEach(window => {
        if (centerWindow(window)) count++;
    });
    
    return count;
}

export function enableForceCentering() {
    if (bounceEnabled) return;
    
    bounceEnabled = true;
    centerAllWindows();
    
    const grabEndSignal = global.display.connect('grab-op-end', (display, window, op) => {
        const isMoveResize = 
            (op === Meta.GrabOp.MOVING || 
             op === Meta.GrabOp.KEYBOARD_MOVING || 
             op === Meta.GrabOp.MOVING_UNCONSTRAINED ||
             (op >= Meta.GrabOp.RESIZING_N && op <= Meta.GrabOp.KEYBOARD_RESIZING_SW));
        
        if (bounceEnabled && window && isRegularWindow(window) && isMoveResize) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                centerWindow(window);
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    
    signalConnections.push({
        object: global.display,
        signalId: grabEndSignal
    });
    
    const windowCreatedSignal = global.display.connect('window-created', (display, window) => {
        if (bounceEnabled && isRegularWindow(window)) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                centerWindow(window);
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    
    signalConnections.push({
        object: global.display,
        signalId: windowCreatedSignal
    });
}

export function disableForceCentering() {
    if (!bounceEnabled) return;
    
    bounceEnabled = false;
    
    signalConnections.forEach(conn => {
        if (conn.object && conn.object.disconnect) {
            conn.object.disconnect(conn.signalId);
        }
    });
    
    signalConnections = [];
}

export function isForceCenteringEnabled() {
    return bounceEnabled;
}
