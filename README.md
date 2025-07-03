# 🌀 Bounce - Fibonacci Window Tiler

A work in progress GNOME Shell extension that automatically tiles your windows in a Fibonacci spiral pattern with smooth bounce animations.

## ✨ Features

- **Fibonacci Spiral Tiling**: Automatically arranges windows using the golden ratio
- **Smooth Animations**: Bounce animations when windows move and resize
- **Dynamic Tiling**: Automatically tiles windows as they open and close based on mouse position
- **Quick Toggle**: Easy on/off toggle in GNOME Shell's Quick Settings panel

## 🚧 Open Tasks

- **Moving Windows Around**: Be able to manually move a window around and have it tile
- **Multiple Virtual Desktops**: Support for more than one virtual desktop
- **Resizing Windows**: Be able to manually resize windows

## 🚀 Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/bon-sai-tree/bounce.git
   cd bounce
   ```

2. Copy to your GNOME extensions directory:
   ```bash
   cp -r . ~/.local/share/gnome-shell/extensions/bounce@bon-sai-tree.github.io/
   ```

3. Restart GNOME Shell:
   - **X11**: Press `Alt + F2`, type `r`, and press Enter
   - **Wayland**: Log out and log back in

4. Enable the extension:
   ```bash
   gnome-extensions enable bounce@bon-sai-tree.github.io
   ```

## 🎮 Usage

- Click the system tray area in the top-right corner
- Look for the "Dynamic Tiling" toggle with the grid icon
- Toggle it on to activate automatic window tiling (or use Super+r)

## 📝 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

