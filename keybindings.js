/* keybindings.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Gener    // Removed cycle tiling mode function as we only have Fibonacci mode nowse as published by
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

import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as WindowUtils from './window.js';
import * as TilingUtils from './tiling.js';

/**
 * Keybindings class to handle keyboard shortcuts for the Bounce extension
 */
export const BounceKeybindings = GObject.registerClass(
class BounceKeybindings extends GObject.Object {
    constructor(extension) {
        super();
        this._extension = extension;
        
        // Define our keyboard shortcuts
        this._buildBindingDefinitions();
    }

    /**
     * Enable all keybindings
     */
    enable() {
        // Add the "b" keybinding to toggle bounce with Super+b
        Main.wm.addKeybinding(
            'toggle-bounce',
            this._extension.getSettings(),
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            this._toggleBounce.bind(this)
        );
        
        // Add the "t" keybinding to toggle tiling with Super+t
        Main.wm.addKeybinding(
            'toggle-tiling',
            this._extension.getSettings(),
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            this._toggleTiling.bind(this)
        );
        
        // Removed tiling mode cycling keybinding as we only have Fibonacci mode

        console.log('[Bounce] Keybindings enabled');
    }

    /**
     * Disable all keybindings
     */
    disable() {
        // Remove the keybindings
        Main.wm.removeKeybinding('toggle-bounce');
        Main.wm.removeKeybinding('toggle-tiling');
        // Removed cycle-tiling-mode keybinding as we only have Fibonacci mode
        
        console.log('[Bounce] Keybindings disabled');
    }

    /**
     * Handler for toggling bounce with Super+b
     */
    _toggleBounce() {
        console.log('[Bounce] Toggle triggered via keyboard shortcut');
        
        // Get the bounce toggle from the indicator
        if (this._extension._indicator) {
            const toggle = this._extension._indicator._bounceToggle;
            
            // Toggle the checked state
            toggle.checked = !toggle.checked;
            
            // The toggle's notify::checked signal will handle calling centerAllWindows
            // when checked becomes true, so we don't need to call it directly here
            console.log(`[Bounce] Toggle state changed to: ${toggle.checked ? 'on' : 'off'}`);
        } else {
            // If the indicator isn't available for some reason, just center the windows directly
            WindowUtils.centerAllWindows();
        }
    }
    
    /**
     * Handler for toggling tiling with Super+t
     */
    _toggleTiling() {
        console.log('[Bounce] Tiling toggle triggered via keyboard shortcut');
        
        // Get the tiling toggle from the indicator
        if (this._extension._indicator) {
            const toggle = this._extension._indicator._tilingToggle;
            
            // Toggle the checked state
            toggle.checked = !toggle.checked;
            
            console.log(`[Bounce] Tiling state changed to: ${toggle.checked ? 'on' : 'off'}`);
        } else {
            // If the indicator isn't available for some reason, just toggle tiling directly
            if (TilingUtils.isTilingEnabled()) {
                TilingUtils.disableTiling();
            } else {
                TilingUtils.enableTiling();
            }
        }
    }
    
    /**
     * Handler for cycling tiling modes with Super+m
     */
    _cycleTilingMode() {
        console.log('[Bounce] Cycling tiling mode via keyboard shortcut');
        
        const newMode = TilingUtils.cycleTilingMode();
        
        // Update the mode menu item if available
        if (this._extension._indicator && 
            this._extension._indicator._tilingToggle &&
            this._extension._indicator._tilingToggle._modeMenuItem) {
            this._extension._indicator._tilingToggle._modeMenuItem.label.text = _(`Tiling Mode: ${newMode}`);
        }
        
        console.log(`[Bounce] Tiling mode changed to: ${newMode}`);
    }

    /**
     * Build our binding definitions
     */
    _buildBindingDefinitions() {
        // We could add more keybindings here in the future
    }
});
