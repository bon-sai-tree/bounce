import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {QuickToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as DynamicUtils from './dynamic.js';
import {BounceKeybindings} from './keybindings.js';

const DynamicTilingToggle = GObject.registerClass(
class DynamicTilingToggle extends QuickToggle {
    constructor() {
        super({
            title: _('Dynamic Tiling'),
            iconName: 'view-grid-symbolic',
            toggleMode: true,
        });

        this.connect('notify::checked', () => {
            if (this.checked) {
                console.log('[Bounce] Dynamic tiling activated');
                DynamicUtils.enableDynamicTiling();
            } else {
                console.log('[Bounce] Dynamic tiling deactivated');
                DynamicUtils.disableDynamicTiling();
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

        // Add the dynamic tiling toggle
        this._dynamicTilingToggle = new DynamicTilingToggle();
        this._dynamicTilingToggle.bind_property('checked',
            this._indicator, 'visible',
            GObject.BindingFlags.SYNC_CREATE);
        this.quickSettingsItems.push(this._dynamicTilingToggle);
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
        // Make sure dynamic tiling is disabled
        DynamicUtils.disableDynamicTiling();
        
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
