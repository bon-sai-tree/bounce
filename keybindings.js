/* keybindings.js
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

import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as WindowUtils from './window.js';

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

        console.log('[Bounce] Keybindings enabled');
    }

    /**
     * Disable all keybindings
     */
    disable() {
        // Remove the keybinding
        Main.wm.removeKeybinding('toggle-bounce');
        
        console.log('[Bounce] Keybindings disabled');
    }

    /**
     * Handler for toggling bounce with Super+b
     */
    _toggleBounce() {
        console.log('[Bounce] Toggle triggered via keyboard shortcut');
        
        // Center all windows
        WindowUtils.centerAllWindows();
        
        // If you have a toggle state to update in the UI, do that here
        if (this._extension._indicator) {
            const toggle = this._extension._indicator.quickSettingsItems[0];
            toggle.checked = !toggle.checked;
        }
    }

    /**
     * Build our binding definitions
     */
    _buildBindingDefinitions() {
        // We could add more keybindings here in the future
    }
});
