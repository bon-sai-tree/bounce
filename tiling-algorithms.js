/* tiling-algorithms.js
 *
 * Tiling algorithms, split calculations, and sector logic
 */

import * as WindowUtils from './window.js';
import Meta from 'gi://Meta';

const GOLDEN_RATIO = 1.618;

export function getSector(windowItem, x, y) {
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

export function applySplit(existingItem, newWindow, newX, newY, newWidth, newHeight, existingX, existingY, existingWidth, existingHeight, updateWindow, addWindow) {
    console.log(`[Bounce] Placing new window at (${newX}, ${newY}) ${newWidth}x${newHeight}`);
    // Place new window immediately without animation but with gaps
    WindowUtils.moveWindowToPositionImmediately(newWindow, newX, newY, newWidth, newHeight);
    // Animate existing window to new position
    WindowUtils.bounceWindowToPosition(existingItem.window, existingX, existingY, existingWidth, existingHeight);
    console.log(`[Bounce] AFTER split - existing window moved to: (${existingX}, ${existingY}) ${existingWidth}x${existingHeight}`);
    updateWindow(existingItem.window, existingX, existingY, existingWidth, existingHeight);
    addWindow(newWindow, newX, newY, newWidth, newHeight);
}

export function splitWindow(existingItem, newWindow, sector, updateWindow, addWindow) {
    const { x, y, width, height } = existingItem;
    console.log(`[Bounce] BEFORE split - existing window: (${x}, ${y}) ${width}x${height}`);
    console.log(`[Bounce] Splitting window in ${sector} sector`);
    
    switch (sector) {
        case 'left':
            const leftWidth = Math.floor(width / GOLDEN_RATIO);
            applySplit(existingItem, newWindow, 
                x, y, leftWidth, height,
                x + leftWidth, y, width - leftWidth, height,
                updateWindow, addWindow);
            break;
        case 'right':
            const rightWidth = Math.floor(width / GOLDEN_RATIO);
            applySplit(existingItem, newWindow,
                x + width - rightWidth, y, rightWidth, height,
                x, y, width - rightWidth, height,
                updateWindow, addWindow);
            break;
        case 'top':
            const topHeight = Math.floor(height / GOLDEN_RATIO);
            applySplit(existingItem, newWindow,
                x, y, width, topHeight,
                x, y + topHeight, width, height - topHeight,
                updateWindow, addWindow);
            break;
        case 'bottom':
            const bottomHeight = Math.floor(height / GOLDEN_RATIO);
            applySplit(existingItem, newWindow,
                x, y + height - bottomHeight, width, bottomHeight,
                x, y, width, height - bottomHeight,
                updateWindow, addWindow);
            break;
    }
}

export function fibonacciTile(windowList, x, y, width, height) {
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

export function calculateFibonacciPositions(windowList, x, y, width, height) {
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

export function isValidWindow(window) {
    return window && 
           !window.is_skip_taskbar() && 
           window.allows_resize() && 
           window.get_window_type() === Meta.WindowType.NORMAL &&
           !window.is_fullscreen() && 
           window.get_maximized() === 0;
}
