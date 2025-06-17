/* window-tracking.js
 *
 * Handles window tracking, adding/removing windows, and space filling logic
 */

import * as WindowUtils from './window.js';

let windows = [];

export function getWindows() {
    return windows;
}

export function addWindow(window, x, y, width, height) {
    windows.push({
        window: window,
        x: x,
        y: y,
        width: width,
        height: height
    });
}

export function removeWindow(window) {
    windows = windows.filter(w => w.window !== window);
}

export function updateWindow(window, newX, newY, newWidth, newHeight) {
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

export function findWindowAt(x, y) {
    return windows.find(w => 
        x >= w.x && x < w.x + w.width &&
        y >= w.y && y < w.y + w.height
    );
}

export function closeWindow(window) {
    const removedWindow = windows.find(w => w.window === window);
    if (!removedWindow) return;
    
    console.log(`[Bounce] Closing window at (${removedWindow.x}, ${removedWindow.y}) ${removedWindow.width}x${removedWindow.height}`);
    
    // Remove from list first
    removeWindow(window);
    
    // Try to fill the empty space by extending adjacent windows
    fillEmptySpace(removedWindow);
}

export function clearWindows() {
    windows = [];
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
            adjacentWindows = windows.filter(w => w.x + w.width === x);
            break;
        case 'top':
            // Find windows whose bottom edge touches the top edge of removed window
            adjacentWindows = windows.filter(w => w.y + w.height === y);
            break;
        case 'right':
            // Find windows whose left edge touches the right edge of removed window
            adjacentWindows = windows.filter(w => w.x === x + width);
            break;
        case 'bottom':
            // Find windows whose top edge touches the bottom edge of removed window
            adjacentWindows = windows.filter(w => w.y === y + height);
            break;
    }
    
    if (adjacentWindows.length === 0) return false;
    
    // Check if the adjacent windows collectively cover the entire border
    if (doBorderPixelsMatch(adjacentWindows, border, x, y, width, height)) {
        extendWindows(adjacentWindows, border, x, y, width, height);
        return true;
    }
    
    return false;
}

function doBorderPixelsMatch(adjacentWindows, border, x, y, width, height) {
    // Create set of pixels that the removed window's border occupies
    const removedBorderPixels = new Set();
    
    // Create set of pixels that adjacent windows collectively cover
    const coveredPixels = new Set();
    
    switch (border) {
        case 'left':
        case 'right':
            // Border is vertical - check y pixels
            for (let py = y; py < y + height; py++) {
                removedBorderPixels.add(py);
            }
            
            for (const window of adjacentWindows) {
                for (let py = window.y; py < window.y + window.height; py++) {
                    coveredPixels.add(py);
                }
            }
            break;
            
        case 'top':
        case 'bottom':
            // Border is horizontal - check x pixels
            for (let px = x; px < x + width; px++) {
                removedBorderPixels.add(px);
            }
            
            for (const window of adjacentWindows) {
                for (let px = window.x; px < window.x + window.width; px++) {
                    coveredPixels.add(px);
                }
            }
            break;
    }
    
    // Check if the sets are exactly the same
    if (removedBorderPixels.size !== coveredPixels.size) return false;
    
    for (const pixel of removedBorderPixels) {
        if (!coveredPixels.has(pixel)) return false;
    }
    
    return true;
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
