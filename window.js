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

function isRegularWindow(window) {
    if (!window) return false;
    return !window.is_skip_taskbar() && 
           window.allows_resize() && 
           window.allows_move() &&
           window.get_window_type() === Meta.WindowType.NORMAL &&
           !window.is_fullscreen() && 
           window.get_maximized() === 0;
}

function bounceWindowToPosition(window, targetX, targetY, targetWidth, targetHeight) {
    if (!isRegularWindow(window)) return false;
    
    window.unmaximize(Meta.MaximizeFlags.BOTH);
    
    const actor = window.get_compositor_private();
    if (!actor) {
        window.move_resize_frame(true, targetX, targetY, targetWidth, targetHeight);
        return false;
    }
    
    actor.remove_all_transitions();
    
    const frameRect = window.get_frame_rect();
    const actorRect = {x: actor.x, y: actor.y, width: actor.width, height: actor.height};
    const offset = {x: frameRect.x - actorRect.x, y: frameRect.y - actorRect.y};
    
    window.move_resize_frame(false, frameRect.x, frameRect.y, targetWidth, targetHeight);
    
    let timeoutId = null;
    const syncFrame = () => {
        if (!window.get_compositor_private()) {
            if (timeoutId) GLib.source_remove(timeoutId);
            return false;
        }
        window.move_frame(false, actor.x + offset.x, actor.y + offset.y);
        return true;
    };
    
    timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, syncFrame);
    
    actor.ease({
        x: targetX - offset.x,
        y: targetY - offset.y,
        duration: 800,
        mode: Clutter.AnimationMode.EASE_OUT_ELASTIC,
        onComplete: () => {
            if (timeoutId) GLib.source_remove(timeoutId);
            window.move_resize_frame(true, targetX, targetY, targetWidth, targetHeight);
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
