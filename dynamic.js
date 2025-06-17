import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import * as WindowUtils from './window.js';

let enabled = false;
let signals = [];
let windows = [];
const GOLDEN_RATIO = 1.618;

// Store original window placement signal
let placementOverrideSignal = null;

function overrideWindowPlacement() {
    if (!placementOverrideSignal) {
        console.log('[Bounce] Setting up window placement override');
        
        // Hook into the window manager's map signal for immediate placement
        placementOverrideSignal = global.window_manager.connect('map', (wm, actor) => {
            if (!enabled) return;
            
            const window = actor.meta_window;
            if (!isValidWindow(window)) return;
            
            console.log(`[Bounce] Intercepting window map: ${window.get_title()}`);
            
            // Check if this window is already in our tracking (avoid double processing)
            if (windows.some(w => w.window === window)) {
                console.log(`[Bounce] Window already tracked, skipping map processing`);
                return;
            }
            
            // Handle first window case
            if (windows.length === 0) {
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

function restoreWindowPlacement() {
    if (placementOverrideSignal) {
        global.window_manager.disconnect(placementOverrideSignal);
        placementOverrideSignal = null;
        console.log('[Bounce] Restored original window placement');
    }
}

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

function addWindow(window, x, y, width, height) {
    windows.push({
        window: window,
        x: x,
        y: y,
        width: width,
        height: height
    });
}

function removeWindow(window) {
    windows = windows.filter(w => w.window !== window);
}

function closeWindow(window) {
    const removedWindow = windows.find(w => w.window === window);
    if (!removedWindow) return;
    
    console.log(`[Bounce] Closing window at (${removedWindow.x}, ${removedWindow.y}) ${removedWindow.width}x${removedWindow.height}`);
    
    // Remove from list first
    removeWindow(window);
    
    // Try to fill the empty space by extending adjacent windows
    fillEmptySpace(removedWindow);
}

function fillEmptySpace(removedWindow) {
    const { x, y, width, height } = removedWindow;
    
    // Check left border - find windows that share the complete left border
    if (tryExtendFromBorder('left', x, y, width, height)) return;
    
    // Check top border - find windows that share the complete top border  
    if (tryExtendFromBorder('top', x, y, width, height)) return;
    
    // Check right border - find windows that share the complete right border
    if (tryExtendFromBorder('right', x, y, width, height)) return;
    
    // Check bottom border - find windows that share the complete bottom border
    if (tryExtendFromBorder('bottom', x, y, width, height)) return;
    
    console.log(`[Bounce] No adjacent windows found to fill empty space`);
}

function tryExtendFromBorder(border, x, y, width, height) {
    let adjacentWindows = [];
    
    switch (border) {
        case 'left':
            // Find windows whose right edge touches the left edge of removed window
            adjacentWindows = windows.filter(w => 
                w.x + w.width === x && 
                w.y <= y && 
                w.y + w.height >= y + height
            );
            break;
        case 'top':
            // Find windows whose bottom edge touches the top edge of removed window
            adjacentWindows = windows.filter(w => 
                w.y + w.height === y && 
                w.x <= x && 
                w.x + w.width >= x + width
            );
            break;
        case 'right':
            // Find windows whose left edge touches the right edge of removed window
            adjacentWindows = windows.filter(w => 
                w.x === x + width && 
                w.y <= y && 
                w.y + w.height >= y + height
            );
            break;
        case 'bottom':
            // Find windows whose top edge touches the bottom edge of removed window
            adjacentWindows = windows.filter(w => 
                w.y === y + height && 
                w.x <= x && 
                w.x + w.width >= x + width
            );
            break;
    }
    
    if (adjacentWindows.length === 0) return false;
    
    // Check if the adjacent windows can completely cover the border
    if (canCoverCompleteBorder(adjacentWindows, border, x, y, width, height)) {
        extendWindows(adjacentWindows, border, x, y, width, height);
        return true;
    }
    
    return false;
}

function canCoverCompleteBorder(adjacentWindows, border, x, y, width, height) {
    // Check that adjacent windows don't extend beyond the borders of the removed window
    
    switch (border) {
        case 'left':
        case 'right':
            // Check that all adjacent windows are within the vertical bounds of the removed window
            for (const window of adjacentWindows) {
                if (window.y < y || window.y + window.height > y + height) {
                    return false; // Window extends beyond the removed window's vertical bounds
                }
            }
            return true;
            
        case 'top':
        case 'bottom':
            // Check that all adjacent windows are within the horizontal bounds of the removed window
            for (const window of adjacentWindows) {
                if (window.x < x || window.x + window.width > x + width) {
                    return false; // Window extends beyond the removed window's horizontal bounds
                }
            }
            return true;
    }
    
    return false;
}

function extendWindows(adjacentWindows, border, x, y, width, height) {
    console.log(`[Bounce] Extending ${adjacentWindows.length} windows from ${border} border`);
    
    for (const window of adjacentWindows) {
        let newX = window.x;
        let newY = window.y;
        let newWidth = window.width;
        let newHeight = window.height;
        
        switch (border) {
            case 'left':
                // Extend window to the right
                newWidth += width;
                break;
            case 'top':
                // Extend window downward
                newHeight += height;
                break;
            case 'right':
                // Extend window to the left
                newX -= width;
                newWidth += width;
                break;
            case 'bottom':
                // Extend window upward
                newY -= height;
                newHeight += height;
                break;
        }
        
        console.log(`[Bounce] Extending window from (${window.x}, ${window.y}) ${window.width}x${window.height} to (${newX}, ${newY}) ${newWidth}x${newHeight}`);
        WindowUtils.bounceWindowToPosition(window.window, newX, newY, newWidth, newHeight);
        updateWindow(window.window, newX, newY, newWidth, newHeight);
    }
}

function updateWindow(window, newX, newY, newWidth, newHeight) {
    // Remove the window from tracking
    removeWindow(window);
    // Add it back with the new coordinates
    windows.push({
        window: window,
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight
    });
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

function applySplit(existingItem, newWindow, newX, newY, newWidth, newHeight, existingX, existingY, existingWidth, existingHeight) {
    console.log(`[Bounce] Placing new window at (${newX}, ${newY}) ${newWidth}x${newHeight}`);
    // Place new window immediately without animation but with gaps
    WindowUtils.moveWindowToPositionImmediately(newWindow, newX, newY, newWidth, newHeight);
    // Animate existing window to new position
    WindowUtils.bounceWindowToPosition(existingItem.window, existingX, existingY, existingWidth, existingHeight);
    console.log(`[Bounce] AFTER split - existing window moved to: (${existingX}, ${existingY}) ${existingWidth}x${existingHeight}`);
    updateWindow(existingItem.window, existingX, existingY, existingWidth, existingHeight);
    addWindow(newWindow, newX, newY, newWidth, newHeight);
}

function splitWindow(existingItem, newWindow, sector) {
    const { x, y, width, height } = existingItem;
    console.log(`[Bounce] BEFORE split - existing window: (${x}, ${y}) ${width}x${height}`);
    console.log(`[Bounce] Splitting window in ${sector} sector`);
    
    switch (sector) {
        case 'left':
            const leftWidth = Math.floor(width / GOLDEN_RATIO);
            applySplit(existingItem, newWindow, 
                x, y, leftWidth, height,
                x + leftWidth, y, width - leftWidth, height);
            break;
        case 'right':
            const rightWidth = Math.floor(width / GOLDEN_RATIO);
            applySplit(existingItem, newWindow,
                x + width - rightWidth, y, rightWidth, height,
                x, y, width - rightWidth, height);
            break;
        case 'top':
            const topHeight = Math.floor(height / GOLDEN_RATIO);
            applySplit(existingItem, newWindow,
                x, y, width, topHeight,
                x, y + topHeight, width, height - topHeight);
            break;
        case 'bottom':
            const bottomHeight = Math.floor(height / GOLDEN_RATIO);
            applySplit(existingItem, newWindow,
                x, y + height - bottomHeight, width, bottomHeight,
                x, y, width, height - bottomHeight);
            break;
    }
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
        addWindow(activeWindows[0], workArea.x, workArea.y, workArea.width, workArea.height);
        return;
    }
    
    fibonacciTile(activeWindows, workArea.x, workArea.y, workArea.width, workArea.height);
    // After fibonacci tiling, we need to reconstruct the positions without querying windows
    // For simplicity, let's re-calculate and add them
    const positions = calculateFibonacciPositions(activeWindows, workArea.x, workArea.y, workArea.width, workArea.height);
    for (let i = 0; i < activeWindows.length; i++) {
        const pos = positions[i];
        addWindow(activeWindows[i], pos.x, pos.y, pos.width, pos.height);
    }
}

function calculateFibonacciPositions(windowList, x, y, width, height) {
    const positions = [];
    calculateFibonacciPositionsRecursive(windowList, x, y, width, height, positions);
    return positions;
}

function calculateFibonacciPositionsRecursive(windowList, x, y, width, height, positions) {
    if (windowList.length === 0) return;
    
    if (windowList.length === 1) {
        positions.push({ x, y, width, height });
        return;
    }
    
    const rest = windowList.slice(1);
    
    if (width > height) {
        const firstWidth = Math.floor(width / GOLDEN_RATIO);
        positions.push({ x, y, width: firstWidth, height });
        calculateFibonacciPositionsRecursive(rest, x + firstWidth, y, width - firstWidth, height, positions);
    } else {
        const firstHeight = Math.floor(height / GOLDEN_RATIO);
        positions.push({ x, y, width, height: firstHeight });
        calculateFibonacciPositionsRecursive(rest, x, y + firstHeight, width, height - firstHeight, positions);
    }
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
    
    // Override window placement for immediate positioning
    overrideWindowPlacement();
    
    tileAll();
    
    const grabEnd = global.display.connect('grab-op-end', (display, window, op) => {
        if (enabled && isValidWindow(window) && (op === Meta.GrabOp.MOVING || op >= Meta.GrabOp.RESIZING_N)) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                // For user-initiated moves/resizes, we simply remove and re-add based on our current tracking
                // The user's manual positioning breaks our tiling logic anyway
                removeWindow(window);
                return GLib.SOURCE_REMOVE;
            });
        }
    });

    const windowDestroyed = global.window_manager.connect('destroy', (wm, actor) => {
        if (enabled && actor.meta_window && isValidWindow(actor.meta_window)) {
            closeWindow(actor.meta_window);
        }
    });
    
    signals.push(
        { object: global.display, id: grabEnd },
        { object: global.window_manager, id: windowDestroyed }
    );
}

export function disableDynamicTiling() {
    if (!enabled) return;
    console.log('[Bounce] Disabling dynamic tiling');
    enabled = false;
    
    // Restore original window placement
    restoreWindowPlacement();
    
    signals.forEach(s => s.object.disconnect(s.id));
    signals = [];
    windows = [];
}

export function isDynamicTilingEnabled() {
    return enabled;
}
