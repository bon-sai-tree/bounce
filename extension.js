/* extension.js
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

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {QuickToggle, SystemIndicator, QuickMenuToggle} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {PopupMenuItem} from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as WindowUtils from './window.js';
import * as TilingUtils from './tiling.js';
import {BounceKeybindings} from './keybindings.js';

const BounceToggle = GObject.registerClass(
class BounceToggle extends QuickToggle {
    constructor() {
        super({
            title: _('Bounce'),
            iconName: 'face-smile-symbolic',
            toggleMode: true,
        });

        this.connect('notify::checked', () => {
            if (this.checked) {
                console.log('[Bounce] Toggle activated');
                WindowUtils.enableForceCentering();
            } else {
                console.log('[Bounce] Toggle deactivated');
                WindowUtils.disableForceCentering();
            }
        });
    }
});

const TilingToggle = GObject.registerClass(
class TilingToggle extends QuickMenuToggle {
    constructor() {
        super({
            title: _('Tiling'),
            iconName: 'view-grid-symbolic',
            toggleMode: true,
            menuEnabled: true,
        });

        // Display the tiling mode (always Fibonacci)
        const modeLabel = new PopupMenuItem(_(`Tiling Mode: ${TilingUtils.getModeString()}`));
        modeLabel.sensitive = false;  // Make it non-clickable since there's only one mode

        // Store a reference
        this._modeMenuItem = modeLabel;
        
        // Add the menu item properly
        this.menu.addMenuItem(modeLabel);

        this.connect('notify::checked', () => {
            if (this.checked) {
                console.log('[Bounce] Tiling activated');
                TilingUtils.enableTiling();
            } else {
                console.log('[Bounce] Tiling deactivated');
                TilingUtils.disableTiling();
            }
        });
    }
});

const BounceIndicator = GObject.registerClass(
class BounceIndicator extends SystemIndicator {
    constructor() {
        super();

        this._indicator = this._addIndicator();
        this._indicator.iconName = 'view-grid-symbolic';

        // Add the bounce toggle
        this._bounceToggle = new BounceToggle();
        this.quickSettingsItems.push(this._bounceToggle);
        
        // Add the tiling toggle
        this._tilingToggle = new TilingToggle();
        this._tilingToggle.bind_property('checked',
            this._indicator, 'visible',
            GObject.BindingFlags.SYNC_CREATE);
        this.quickSettingsItems.push(this._tilingToggle);
    }
});

export default class BounceExtension extends Extension {
    enable() {
        // Initialize the indicator for the quick settings menu
        this._indicator = new BounceIndicator();
        console.log("[Bounce] Extension enabled");
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
        
        // Initialize and enable keybindings
        this._keybindings = new BounceKeybindings(this);
        this._keybindings.enable();
    }

    disable() {
        // Make sure force centering and tiling are disabled
        WindowUtils.disableForceCentering();
        TilingUtils.disableTiling();
        
        // Clean up the indicator
        this._indicator.quickSettingsItems.forEach(item => item.destroy());
        console.log("[Bounce] Extension disabled");
        this._indicator.destroy();
        
        // Disable keybindings
        if (this._keybindings) {
            this._keybindings.disable();
            this._keybindings = null;
        }
    }
}
