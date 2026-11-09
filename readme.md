# Pin Sidebar

- **Find pin**: Search bar (magnifier icon, placeholder "Search...") above the essentials. Filters pins/bookmarks, expands matching folders, x clears the search.
- **Dock dot**: Open (loaded) pins get a dot on the left, open essentials get a dot centered below the tile.
- **No X on unloaded pins**: The close (X) button of unloaded pins is hidden, so pins are removed via the context menu only.
- **Load All Tabs**: Context menu entry of a pinned folder, right above "Unload All Tabs". Loads all tabs in the folder that are not loaded yet (including subfolders).
- **Set Color…**: Context menu entry of a pinned folder. Draws a rounded color area behind the folder row and everything inside it (subfolders layer on top of their parent). 8 pastel swatches, a custom color picker with live preview, "No Color" and "Cancel". Colors are stored per folder id in the pref `pinsidebar.folder.colors`; in dark themes the opacity is reduced to 22%.

- **Space bar**: The tab area ends above the space bar at the bottom, tabs no longer scroll underneath it.

Note: Locally installed Sine mods with JS need `sine.allow-unsafe-js = true` (about:config).
