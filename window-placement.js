/* window-placement.js
 *
 * Handles window placement override and immediate positioning logic
 */

import * as WindowUtils from './window.js';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

let placementOverrideSignal = null;

export function overrideWindowPlacement(enabled, windows, addWindow, getWorkArea, findWindowAt, getSector, splitWindow, tileAll, isValidWindow) {
    if (!placementOverrideSignal) {
        console.log('[Bounce] Setting up window placement override');
        
        // Hook into the window manager's map signal for immediate placement
        placementOverrideSignal = global.window_manager.connect('map', (wm, actor) => {
            if (!enabled()) return;
            
            const window = actor.meta_window;
            if (!isValidWindow(window)) return;
            
            console.log(`[Bounce] Intercepting window map: ${window.get_title()}`);
            
            // Check if this window is already in our tracking (avoid double processing)
            if (windows().some(w => w.window === window)) {
                console.log(`[Bounce] Window already tracked, skipping map processing`);
                return;
            }
            
            // Handle first window case
            if (windows().length === 0) {
                console.log(`[Bounce] First window - placing immediately in full work area`);
                const workArea = getWorkArea();
                WindowUtils.moveWindowToPositionImmediately(window, workArea.x, workArea.y, workArea.width, workArea.height);
                addWindow(window, workArea.x, workArea.y, workArea.width, workArea.height);
                return;
            }
            
            // Find target window for splitting
            const [mouseX, mouseY] = global.get_pointer();
            const targetWindow = findWindowAt(mouseX, mouseY);
            
            if (targetWindow) {
                const sector = getSector(targetWindow, mouseX, mouseY);
                splitWindow(targetWindow, window, sector);
            } else {
                // No target window, use default tiling
                tileAll();
            }
        });
    }
}

export function restoreWindowPlacement() {
    if (placementOverrideSignal) {
        global.window_manager.disconnect(placementOverrideSignal);
        placementOverrideSignal = null;
        console.log('[Bounce] Restored original window placement');
    }
}
