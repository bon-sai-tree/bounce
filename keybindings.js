import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as DynamicUtils from './dynamic.js';

/**
 * Keybindings class to handle keyboard shortcuts for the Bounce extension
 */
export const BounceKeybindings = GObject.registerClass(
class BounceKeybindings extends GObject.Object {
    constructor(extension) {
        super();
        this._extension = extension;
    }

    /**
     * Enable all keybindings
     */
    enable() {
        // Add the "t" keybinding to toggle dynamic tiling with Ctrl+t
        Main.wm.addKeybinding(
            'toggle-dynamic-tiling',
            this._extension.getSettings(),
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            this._toggleDynamicTiling.bind(this)
        );

        console.log('[Bounce] Keybindings enabled');
    }

    /**
     * Disable all keybindings
     */
    disable() {
        // Remove the keybinding
        Main.wm.removeKeybinding('toggle-dynamic-tiling');
        
        console.log('[Bounce] Keybindings disabled');
    }
    
    /**
     * Handler for toggling dynamic tiling with Super+t
     */
    _toggleDynamicTiling() {
        console.log('[Bounce] Dynamic tiling toggle triggered via keyboard shortcut');
        
        // Get the dynamic tiling toggle from the indicator and toggle it
        if (this._extension._indicator) {
            const toggle = this._extension._indicator._dynamicTilingToggle;
            
            // Toggle the checked state - this will trigger the notify::checked signal
            // which will handle enabling/disabling dynamic tiling
            toggle.checked = !toggle.checked;
            
            console.log(`[Bounce] Dynamic tiling state changed to: ${toggle.checked ? 'on' : 'off'}`);
        } else {
            // Fallback: if the indicator isn't available, toggle directly
            if (DynamicUtils.isDynamicTilingEnabled()) {
                DynamicUtils.disableDynamicTiling();
                console.log('[Bounce] Dynamic tiling disabled');
            } else {
                DynamicUtils.enableDynamicTiling();
                console.log('[Bounce] Dynamic tiling enabled');
            }
        }
    }
});
