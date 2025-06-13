import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import * as WindowUtils from './window.js';

let enabled = false;
let signals = [];
let windows = [];
const GOLDEN_RATIO = 1.618;

function isValidWindow(window) {
    return window && 
           !window.is_skip_taskbar() && 
           window.allows_resize() && 
           window.get_window_type() === Meta.WindowType.NORMAL &&
           !window.is_fullscreen() && 
           window.get_maximized() === 0;
}

function getWorkArea() {
    const workspace = global.workspace_manager.get_active_workspace();
    return workspace.get_work_area_for_monitor(global.display.get_primary_monitor());
}

function addWindow(window) {
    const rect = window.get_frame_rect();
    windows.push({
        window: window,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
    });
}

function removeWindow(window) {
    windows = windows.filter(w => w.window !== window);
}

function updateWindow(window) {
    const item = windows.find(w => w.window === window);
    if (item) {
        const rect = window.get_frame_rect();
        item.x = rect.x;
        item.y = rect.y;
        item.width = rect.width;
        item.height = rect.height;
    }
}

function findWindowAt(x, y) {
    return windows.find(w => 
        x >= w.x && x < w.x + w.width &&
        y >= w.y && y < w.y + w.height
    );
}

function getSector(windowItem, x, y) {
    const centerX = windowItem.x + windowItem.width / 2;
    const centerY = windowItem.y + windowItem.height / 2;
    
    const dx = Math.abs(x - centerX) / (windowItem.width / 2);
    const dy = Math.abs(y - centerY) / (windowItem.height / 2);
    
    if (dx > dy) {
        return x < centerX ? 'left' : 'right';
    } else {
        return y < centerY ? 'top' : 'bottom';
    }
}

function splitWindow(existingItem, newWindow, sector) {
    const { x, y, width, height } = existingItem;
    console.log(`[Bounce] BEFORE split - existing window: (${x}, ${y}) ${width}x${height}`);
    console.log(`[Bounce] Splitting window in ${sector} sector`);
    
    switch (sector) {
        case 'left':
            const leftWidth = Math.floor(width / GOLDEN_RATIO);
            console.log(`[Bounce] Placing new window at (${x}, ${y}) ${leftWidth}x${height}`);
            WindowUtils.bounceWindowToPosition(newWindow, x, y, leftWidth, height);
            WindowUtils.bounceWindowToPosition(existingItem.window, x + leftWidth, y, width - leftWidth, height);
            console.log(`[Bounce] AFTER split - existing window moved to: (${x + leftWidth}, ${y}) ${width - leftWidth}x${height}`);
            break;
        case 'right':
            const rightWidth = Math.floor(width / GOLDEN_RATIO);
            console.log(`[Bounce] Placing new window at (${x + width - rightWidth}, ${y}) ${rightWidth}x${height}`);
            WindowUtils.bounceWindowToPosition(newWindow, x + width - rightWidth, y, rightWidth, height);
            WindowUtils.bounceWindowToPosition(existingItem.window, x, y, width - rightWidth, height);
            console.log(`[Bounce] AFTER split - existing window resized to: (${x}, ${y}) ${width - rightWidth}x${height}`);
            break;
        case 'top':
            const topHeight = Math.floor(height / GOLDEN_RATIO);
            console.log(`[Bounce] Placing new window at (${x}, ${y}) ${width}x${topHeight}`);
            WindowUtils.bounceWindowToPosition(newWindow, x, y, width, topHeight);
            WindowUtils.bounceWindowToPosition(existingItem.window, x, y + topHeight, width, height - topHeight);
            console.log(`[Bounce] AFTER split - existing window moved to: (${x}, ${y + topHeight}) ${width}x${height - topHeight}`);
            break;
        case 'bottom':
            const bottomHeight = Math.floor(height / GOLDEN_RATIO);
            console.log(`[Bounce] Placing new window at (${x}, ${y + height - bottomHeight}) ${width}x${bottomHeight}`);
            WindowUtils.bounceWindowToPosition(newWindow, x, y + height - bottomHeight, width, bottomHeight);
            WindowUtils.bounceWindowToPosition(existingItem.window, x, y, width, height - bottomHeight);
            console.log(`[Bounce] AFTER split - existing window resized to: (${x}, ${y}) ${width}x${height - bottomHeight}`);
            break;
    }
    
    updateWindow(existingItem.window);
}

function tileAll() {
    const workArea = getWorkArea();
    const activeWindows = global.display.get_tab_list(Meta.TabList.NORMAL, global.workspace_manager.get_active_workspace())
                          .filter(isValidWindow);
    
    console.log(`[Bounce] Tiling ${activeWindows.length} windows`);
    windows = [];
    
    if (activeWindows.length === 0) return;
    
    if (activeWindows.length === 1) {
        WindowUtils.bounceWindowToPosition(activeWindows[0], workArea.x, workArea.y, workArea.width, workArea.height);
        addWindow(activeWindows[0]);
        return;
    }
    
    fibonacciTile(activeWindows, workArea.x, workArea.y, workArea.width, workArea.height);
    activeWindows.forEach(addWindow);
}

function fibonacciTile(windowList, x, y, width, height) {
    if (windowList.length === 0) return;
    
    if (windowList.length === 1) {
        WindowUtils.bounceWindowToPosition(windowList[0], x, y, width, height);
        return;
    }
    
    const first = windowList[0];
    const rest = windowList.slice(1);
    
    if (width > height) {
        const firstWidth = Math.floor(width / GOLDEN_RATIO);
        WindowUtils.bounceWindowToPosition(first, x, y, firstWidth, height);
        fibonacciTile(rest, x + firstWidth, y, width - firstWidth, height);
    } else {
        const firstHeight = Math.floor(height / GOLDEN_RATIO);
        WindowUtils.bounceWindowToPosition(first, x, y, width, firstHeight);
        fibonacciTile(rest, x, y + firstHeight, width, height - firstHeight);
    }
}

export function enableDynamicTiling() {
    if (enabled) return;
    console.log('[Bounce] Enabling dynamic tiling');
    enabled = true;
    
    tileAll();
    
    const grabEnd = global.display.connect('grab-op-end', (display, window, op) => {
        if (enabled && isValidWindow(window) && (op === Meta.GrabOp.MOVING || op >= Meta.GrabOp.RESIZING_N)) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                updateWindow(window);
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    
    const windowCreated = global.display.connect('window-created', (display, window) => {
        if (!enabled || !isValidWindow(window)) return;
        
        console.log(`[Bounce] New window created: ${window.get_title()}`);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            const [x, y] = global.get_pointer();
            const targetWindow = findWindowAt(x, y);
            
            if (targetWindow) {
                const sector = getSector(targetWindow, x, y);
                splitWindow(targetWindow, window, sector);
                addWindow(window);
            } else {
                tileAll();
            }
            return GLib.SOURCE_REMOVE;
        });
    });
    
    const windowDestroyed = global.window_manager.connect('destroy', (wm, actor) => {
        if (enabled && actor.meta_window && isValidWindow(actor.meta_window)) {
            removeWindow(actor.meta_window);
        }
    });
    
    signals.push(
        { object: global.display, id: grabEnd },
        { object: global.display, id: windowCreated },
        { object: global.window_manager, id: windowDestroyed }
    );
}

export function disableDynamicTiling() {
    if (!enabled) return;
    console.log('[Bounce] Disabling dynamic tiling');
    enabled = false;
    
    signals.forEach(s => s.object.disconnect(s.id));
    signals = [];
    windows = [];
}

export function isDynamicTilingEnabled() {
    return enabled;
}
