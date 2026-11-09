# Pin Sidebar

- **Find pin**: Search bar above the essentials. Filters pins/bookmarks, expands matching folders, x clears the search.
- **Dock dot**: Open (loaded) pins get a dot on the left.
- **Load All Tabs**: Context menu entry of a pinned folder, right above "Unload All Tabs". Loads all tabs in the folder that are not loaded yet (including subfolders).
- **Set Color…**: Context menu entry of a pinned folder. Draws a rounded color area behind the folder row and everything inside it (subfolders layer on top of their parent). 8 pastel swatches, a custom color picker with live preview, "No Color" and "Cancel". Colors are stored per folder id in the pref `pinsidebar.folder.colors`; in dark themes the opacity is reduced to 22%.
- **Divider**: Hovering the divider shows a pin icon on its left. Active = the pinned area has a fixed height and the divider stays below it; drag it to change the height. Overflowing pins/folders scroll above the divider, the regular tabs below stay visible. Inactive = default Zen behavior.

Note: Locally installed Sine mods with JS need `sine.allow-unsafe-js = true` (about:config).
