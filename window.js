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
 * @returns {boolean} True if the window was centered, false otherwise
 */
export function centerWindow(window) {
    if (!window) return false;
    
    // Skip special windows that shouldn't be resized
    if (window.is_skip_taskbar() || 
        !window.allows_resize() || 
        !window.allows_move() ||
        window.get_window_type() !== Meta.WindowType.NORMAL) {
        console.log(`[Bounce] Skipping special window: ${window.get_title()}`);
        return false;
    }
    
    // Skip if window is fullscreen or maximized (optional, comment out if you want to resize these too)
    if (window.is_fullscreen() || window.get_maximized() !== 0) {
        console.log(`[Bounce] Window is fullscreen or maximized, skipping: ${window.get_title()}`);
        return false;
    }
    
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
