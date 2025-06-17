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

export function moveWindowToPositionImmediately(window, targetX, targetY, targetWidth, targetHeight) {
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
    
    // Move window immediately without animation
    window.move_resize_frame(true, safeTargetX, safeTargetY, targetWidth, targetHeight);
    
    console.log(`[Bounce] Moved window immediately to (${safeTargetX}, ${safeTargetY}) ${targetWidth}x${targetHeight}`);
    return true;
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
    
    // Stop any ongoing animations to prevent conflicts
    actor.remove_all_transitions();
    
    const frameRect = window.get_frame_rect();
    const actorRect = {x: actor.x, y: actor.y, width: actor.width, height: actor.height};
    const offset = {x: frameRect.x - actorRect.x, y: frameRect.y - actorRect.y};
    
    // Calculate target actor position
    const targetActorX = targetX - offset.x;
    const targetActorY = targetY - offset.y;
    
    // Store initial dimensions for resize animation
    const initialWidth = frameRect.width;
    const initialHeight = frameRect.height;
    
    // Calculate scale factors for the resize animation
    const scaleX = targetWidth / initialWidth;
    const scaleY = targetHeight / initialHeight;
    
    console.log(`[Bounce] Animating resize from ${initialWidth}x${initialHeight} to ${targetWidth}x${targetHeight} (scale: ${scaleX}, ${scaleY})`);
    
    // Immediately set the target window size (this is instant, no animation support in Meta.Window)
    window.move_resize_frame(false, frameRect.x, frameRect.y, targetWidth, targetHeight);
    
    // Create visual resize effect by scaling the actor temporarily
    // This creates the illusion of smooth resizing while the window content adjusts
    const originalScaleX = actor.scale_x;
    const originalScaleY = actor.scale_y;
    
    // Start with the actor scaled to represent the old size
    actor.set_scale(originalScaleX / scaleX, originalScaleY / scaleY);
    
    // Animate both position and scale to create smooth movement and resize effect
    actor.ease({
        x: targetActorX,
        y: targetActorY,
        scale_x: originalScaleX,
        scale_y: originalScaleY,
        duration: 400,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        onComplete: () => {
            // Ensure final state is correct
            actor.set_position(targetActorX, targetActorY);
            actor.set_scale(originalScaleX, originalScaleY);
            window.move_resize_frame(true, targetX, targetY, targetWidth, targetHeight);
            
            console.log(`[Bounce] Animation completed: (${targetX}, ${targetY}) ${targetWidth}x${targetHeight}`);
        }
    });
    
    return true;
}

