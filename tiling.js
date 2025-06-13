/* tiling.js */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as WindowUtils from './window.js';

const windowOrder = [];
export const TilingMode = { FIBONACCI: 0 };
let currentMode = TilingMode.FIBONACCI;
const WINDOW_PADDING = 8;
let signalConnections = [];
let tilingEnabled = false;
let lastWindowPositions = new Map();
const PHI = (1 + Math.sqrt(5)) / 2;

function isRegularWindow(window) {
    if (!window) return false;
    return !window.is_skip_taskbar() && 
           window.allows_resize() && 
           window.allows_move() &&
           window.get_window_type() === Meta.WindowType.NORMAL &&
           !window.is_fullscreen() && 
           window.get_maximized() === 0;
}

export function tileWindows() {
    lastWindowPositions.clear();
    
    const workspace = global.workspace_manager.get_active_workspace();
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
                    .filter(isRegularWindow);
    
    if (windows.length === 0) return 0;
    
    fibonacciTiling(windows);
    
    windows.forEach(window => {
        const rect = window.get_frame_rect();
        lastWindowPositions.set(window, {
            x: rect.x, y: rect.y, width: rect.width, height: rect.height
        });
    });
    
    return windows.length;
}

function calculateFibonacciRects(workArea, windowCount) {
    const rects = [];
    if (windowCount === 0) return rects;
    
    const safeWorkArea = {
        x: Math.round(workArea.x + WINDOW_PADDING),
        y: Math.round(workArea.y + WINDOW_PADDING),
        width: Math.round(workArea.width - WINDOW_PADDING * 2),
        height: Math.round(workArea.height - WINDOW_PADDING * 2)
    };
    
    if (windowCount === 1) {
        rects.push({
            x: safeWorkArea.x,
            y: safeWorkArea.y,
            width: safeWorkArea.width,
            height: safeWorkArea.height
        });
        return rects;
    }
    
    let remainingArea = {
        x: safeWorkArea.x,
        y: safeWorkArea.y,
        width: safeWorkArea.width,
        height: safeWorkArea.height
    };
    
    let isVerticalSplit = true;
    
    for (let i = 0; i < windowCount; i++) {
        let windowRect;
        
        if (i === windowCount - 1) {
            windowRect = {
                x: Math.round(remainingArea.x),
                y: Math.round(remainingArea.y),
                width: Math.round(remainingArea.width),
                height: Math.round(remainingArea.height)
            };
        } else {
            if (isVerticalSplit) {
                const firstWidth = Math.round(remainingArea.width / PHI);
                
                windowRect = {
                    x: Math.round(remainingArea.x),
                    y: Math.round(remainingArea.y),
                    width: Math.round(firstWidth - WINDOW_PADDING),
                    height: Math.round(remainingArea.height)
                };
                
                remainingArea = {
                    x: Math.round(remainingArea.x + firstWidth + WINDOW_PADDING),
                    y: Math.round(remainingArea.y),
                    width: Math.round(remainingArea.width - firstWidth - WINDOW_PADDING),
                    height: Math.round(remainingArea.height)
                };
            } else {
                const firstHeight = Math.round(remainingArea.height / PHI);
                
                windowRect = {
                    x: Math.round(remainingArea.x),
                    y: Math.round(remainingArea.y),
                    width: Math.round(remainingArea.width),
                    height: Math.round(firstHeight - WINDOW_PADDING)
                };
                
                remainingArea = {
                    x: Math.round(remainingArea.x),
                    y: Math.round(remainingArea.y + firstHeight + WINDOW_PADDING),
                    width: Math.round(remainingArea.width),
                    height: Math.round(remainingArea.height - firstHeight - WINDOW_PADDING)
                };
            }
            
            isVerticalSplit = !isVerticalSplit;
        }
        
        windowRect.width = Math.max(windowRect.width, 100);
        windowRect.height = Math.max(windowRect.height, 100);
        
        windowRect.x = Math.max(safeWorkArea.x, Math.min(windowRect.x, 
                      safeWorkArea.x + safeWorkArea.width - windowRect.width));
        windowRect.y = Math.max(safeWorkArea.y, Math.min(windowRect.y, 
                      safeWorkArea.y + safeWorkArea.height - windowRect.height));
        
        rects.push({
            x: Math.round(windowRect.x),
            y: Math.round(windowRect.y),
            width: Math.round(windowRect.width),
            height: Math.round(windowRect.height)
        });
    }
    
    return rects;
}

function fibonacciTiling(windows) {
    if (windows.length === 0) return;
    
    const primaryMonitor = global.display.get_primary_monitor();
    const workArea = global.display.get_workspace_manager()
                    .get_active_workspace()
                    .get_work_area_for_monitor(primaryMonitor);
    
    const windowRects = calculateFibonacciRects(workArea, windows.length);
    
    for (let i = windowOrder.length - 1; i >= 0; i--) {
        if (!windows.includes(windowOrder[i])) {
            windowOrder.splice(i, 1);
        }
    }
    
    windows.forEach(window => {
        if (!windowOrder.includes(window)) {
            windowOrder.push(window);
        }
    });
    
    const orderedWindows = [...windowOrder].filter(window => windows.includes(window));
    
    if (orderedWindows.length !== windows.length) {
        windowOrder.length = 0;
        windowOrder.push(...windows);
    }
    
    orderedWindows.forEach((window, i) => {
        const rect = windowRects[i];
        WindowUtils.bounceWindowToPosition(
            window,
            rect.x,
            rect.y,
            rect.width,
            rect.height
        );
    });
}



export function getModeString() { return 'Fibonacci'; }

export function enableTiling() {
    if (tilingEnabled) return;
    
    tilingEnabled = true;
    tileWindows();
    
    const grabEndSignal = global.display.connect('grab-op-end', (display, window, op) => {
        const isMoveResize = 
            (op === Meta.GrabOp.MOVING || 
             op === Meta.GrabOp.KEYBOARD_MOVING || 
             op === Meta.GrabOp.MOVING_UNCONSTRAINED ||
             (op >= Meta.GrabOp.RESIZING_N && op <= Meta.GrabOp.KEYBOARD_RESIZING_SW));
        
        if (tilingEnabled && window && isRegularWindow(window) && isMoveResize) {
            const isMove = (op === Meta.GrabOp.MOVING || 
                          op === Meta.GrabOp.KEYBOARD_MOVING || 
                          op === Meta.GrabOp.MOVING_UNCONSTRAINED);
            
            if (isMove) {
                const movedWindow = window;
                const [mouseX, mouseY] = global.get_pointer();
                
                const workspace = global.workspace_manager.get_active_workspace();
                const allWindows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
                                 .filter(isRegularWindow);
                
                let targetWindow = null;
                let maxOverlap = 0;
                
                allWindows.forEach(w => {
                    if (w === movedWindow) return;
                    
                    const rect = w.get_frame_rect();
                    
                    if (mouseX >= rect.x && mouseX <= rect.x + rect.width &&
                        mouseY >= rect.y && mouseY <= rect.y + rect.height) {
                        
                        const area = rect.width * rect.height;
                        if (area > maxOverlap) {
                            maxOverlap = area;
                            targetWindow = w;
                        }
                    }
                });
                
                if (targetWindow) {
                    const movedIndex = windowOrder.indexOf(movedWindow);
                    const targetIndex = windowOrder.indexOf(targetWindow);
                    
                    if (movedIndex >= 0 && targetIndex >= 0) {
                        windowOrder.splice(movedIndex, 1);
                        windowOrder.splice(targetIndex, 0, movedWindow);
                    }
                }
            }
            
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                tileWindows();
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    
    signalConnections.push({
        object: global.display,
        signalId: grabEndSignal
    });
    
    const windowCreatedSignal = global.display.connect('window-created', (display, window) => {
        if (tilingEnabled && isRegularWindow(window)) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                if (!windowOrder.includes(window)) {
                    windowOrder.push(window);
                }
                tileWindows();
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    
    signalConnections.push({
        object: global.display,
        signalId: windowCreatedSignal
    });
    
    const windowDestroyedSignal = global.window_manager.connect('destroy', (wm, actor) => {
        if (tilingEnabled && actor.meta_window && isRegularWindow(actor.meta_window)) {
            const destroyedWindow = actor.meta_window;
            const index = windowOrder.indexOf(destroyedWindow);
            if (index >= 0) {
                windowOrder.splice(index, 1);
            }
            
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                tileWindows();
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    
    signalConnections.push({
        object: global.window_manager,
        signalId: windowDestroyedSignal
    });
    
    const driftCheckId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
        if (!tilingEnabled) {
            return GLib.SOURCE_REMOVE;
        }
        
        const workspace = global.workspace_manager.get_active_workspace();
        const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
                        .filter(isRegularWindow);
        
        let hasDrift = false;
        
        if (global.display.get_grab_op() === Meta.GrabOp.NONE && windows.length > 0) {
            for (const window of windows) {
                const lastPosition = lastWindowPositions.get(window);
                if (!lastPosition) {
                    hasDrift = true;
                    break;
                }
                
                const currentRect = window.get_frame_rect();
                
                if (Math.abs(currentRect.x - lastPosition.x) > 2 ||
                    Math.abs(currentRect.y - lastPosition.y) > 2 ||
                    Math.abs(currentRect.width - lastPosition.width) > 2 ||
                    Math.abs(currentRect.height - lastPosition.height) > 2) {
                    hasDrift = true;
                    break;
                }
            }
            
            if (hasDrift) {
                tileWindows();
            }
        }
        
        return GLib.SOURCE_CONTINUE;
    });
    
    signalConnections.push({
        object: GLib,
        signalId: driftCheckId
    });
}

export function disableTiling() {
    if (!tilingEnabled) return;
    
    tilingEnabled = false;
    lastWindowPositions.clear();
    windowOrder.length = 0;
    
    signalConnections.forEach(conn => {
        if (conn.object && conn.object.disconnect) {
            conn.object.disconnect(conn.signalId);
        }
    });
    
    signalConnections = [];
}

export function isTilingEnabled() {
    return tilingEnabled;
}
