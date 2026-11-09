// ==UserScript==
// @name        Pin Sidebar
// @description Find pin search, dock dot, lockable pin divider, folder colors and "Load All Tabs" for Zen
// ==/UserScript==

(() => {
  if (window.__pinSidebarLoaded) {
    return;
  }
  window.__pinSidebarLoaded = true;

  const PREF_FIXED = "pinsidebar.divider.fixed";
  const PREF_HEIGHT = "pinsidebar.divider.height";
  const PREF_COLORS = "pinsidebar.folder.colors";
  const FOLDER_COLORS = [
    "#f6d2d8", "#fbe3cf", "#f7e7c6", "#dcebd5",
    "#d9eeeb", "#d6e6f2", "#e3dcf2", "#e8e0d5",
  ];
  const MIN_PIN_HEIGHT = 44;
  const MIN_REST_HEIGHT = 120;
  const DIVIDER_HEIGHT = 22;
  const PINNED_SECTION = ".zen-workspace-pinned-tabs-section";
  const SEPARATOR = ".pinned-tabs-container-separator";

  /** @type {Map<Element, boolean>} folder -> original collapsed state */
  const savedFolderState = new Map();

  // ---------------------------------------------------------------- Helpers

  /** @returns {boolean} */
  const isFixed = () => Services.prefs.getBoolPref(PREF_FIXED, false);

  /** @returns {number} */
  const getHeight = () => Services.prefs.getIntPref(PREF_HEIGHT, 0);

  /**
   * Top-level pinned items (tabs and folders) of a pinned section.
   * @param {Element} section
   * @returns {Element[]}
   */
  const topLevelItems = section =>
    Array.from(section.children).filter(
      child => child.matches("tab, zen-folder") && !child.hasAttribute("zen-empty-tab")
    );

  /** @returns {Element[]} */
  const pinnedSections = () => Array.from(document.querySelectorAll(PINNED_SECTION));

  // ---------------------------------------------------------------- 1. Find pin

  /**
   * @param {Element} tab
   * @param {string} query
   * @returns {boolean}
   */
  const tabMatches = (tab, query) => {
    let text = tab.getAttribute("label") ?? tab.label ?? "";
    try {
      text += " " + (tab.linkedBrowser?.currentURI?.spec ?? "");
    } catch (e) {
      // pending tabs without a browser: use the label only
    }
    return text.toLowerCase().includes(query);
  }

  /**
   * Filters an element recursively and sets the pinfind-hidden attribute.
   * @param {Element} element
   * @param {string} query
   * @param {boolean} forceShow parent folder matched itself: show everything inside
   * @returns {boolean} true if the element stays visible
   */
  const filterElement = (element, query, forceShow) => {
    let visible;
    if (element.localName === "zen-folder") {
      const labelHit = (element.label ?? "").toLowerCase().includes(query);
      const children = element.allItems ?? [];
      const childVisible = children.map(child =>
        filterElement(child, query, forceShow || labelHit)
      );
      visible = forceShow || labelHit || childVisible.some(Boolean);
      if (visible) {
        if (!savedFolderState.has(element)) {
          savedFolderState.set(element, element.collapsed);
        }
        element.collapsed = false;
      }
    } else {
      visible = forceShow || tabMatches(element, query);
    }
    element.toggleAttribute("pinfind-hidden", !visible);
    return visible;
  };

  const clearFilter = () => {
    for (const element of document.querySelectorAll("[pinfind-hidden]")) {
      element.removeAttribute("pinfind-hidden");
    }
    for (const [folder, wasCollapsed] of savedFolderState) {
      if (folder.isConnected && folder.collapsed !== wasCollapsed) {
        folder.collapsed = wasCollapsed;
      }
    }
    savedFolderState.clear();
  };

  /** @param {string} rawQuery */
  const applyFilter = rawQuery => {
    const query = rawQuery.trim().toLowerCase();
    if (!query) {
      clearFilter();
      return;
    }
    for (const section of pinnedSections()) {
      for (const item of topLevelItems(section)) {
        filterElement(item, query, false);
      }
    }
  };

  const createSearchBar = () => {
    if (document.getElementById("pinfind-bar")) {
      return true;
    }
    const essentials = document.getElementById("zen-essentials");
    if (!essentials?.parentNode) {
      return false;
    }

    const bar = document.createElement("div");
    bar.id = "pinfind-bar";

    const input = document.createElement("input");
    input.id = "pinfind-input";
    input.type = "text";
    input.placeholder = "Find pin";
    input.spellcheck = false;

    const clear = document.createElement("button");
    clear.id = "pinfind-clear";
    clear.type = "button";
    clear.textContent = "✕";
    clear.title = "Clear search";

    const update = () => {
      bar.toggleAttribute("has-text", input.value.length > 0);
      applyFilter(input.value);
    };
    const reset = () => {
      input.value = "";
      update();
    };

    input.addEventListener("input", update);
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        reset();
      }
    });
    clear.addEventListener("click", () => {
      reset();
      input.focus();
    });

    bar.append(input, clear);
    essentials.parentNode.insertBefore(bar, essentials);

    // Also filter new tabs/folders while a search is active
    new MutationObserver(() => {
      if (input.value.trim()) {
        applyFilter(input.value);
      }
    }).observe(document.getElementById("zen-tabs-wrapper") ?? bar, {
      childList: true,
      subtree: true,
    });

    return true;
  };

  // ---------------------------------------------------------------- 3. Divider

  /**
   * Clamps a pinned area height so the unpinned area below keeps enough room.
   * @param {Element} section
   * @param {number} height
   * @returns {number}
   */
  const clampHeight = (section, height) => {
    const top = section.getBoundingClientRect().top;
    const bottom = document.getElementById("zen-tabs-wrapper").getBoundingClientRect().bottom;
    const max = Math.max(MIN_PIN_HEIGHT, bottom - top - DIVIDER_HEIGHT - MIN_REST_HEIGHT);
    return Math.max(MIN_PIN_HEIGHT, Math.min(max, height));
  };

  /**
   * Creates the button that toggles the lock. The icon (pin / unpin) is set via CSS.
   * @param {boolean} locked whether the button sits on the locked divider (action: unlock)
   * @returns {Element}
   */
  const createPinButton = locked => {
    const button = document.createXULElement("toolbarbutton");
    button.className = "pinfind-divider-pin";
    button.setAttribute("tooltiptext", locked ? "Unlock divider" : "Lock divider");
    button.addEventListener("click", event => {
      event.stopPropagation();
      const next = !isFixed();
      Services.prefs.setBoolPref(PREF_FIXED, next);
      if (next) {
        // Adopt the current height of the pins (without the Zen separator)
        const section = button.closest(PINNED_SECTION) ?? button.closest(".pinfind-divider")?.previousElementSibling;
        const separator = section?.querySelector(SEPARATOR);
        if (section) {
          const height = section.getBoundingClientRect().height - (separator?.getBoundingClientRect().height ?? 0);
          Services.prefs.setIntPref(PREF_HEIGHT, Math.round(clampHeight(section, height)));
        }
      }
      layoutAll();
    });
    return button;
  };

  /**
   * Own divider that sits right below the (scrolling) pinned section, so it
   * belongs to the always visible unpinned area. Zen's own separator stays in the
   * pinned section (Zen relies on it there) and is hidden while locked.
   * @param {Element} section
   * @returns {Element}
   */
  const ensureDivider = section => {
    const existing = section.nextElementSibling;
    if (existing?.classList.contains("pinfind-divider")) {
      return existing;
    }
    const divider = document.createElement("div");
    divider.className = "pinfind-divider";
    const line = document.createElement("div");
    line.className = "pinfind-divider-line";
    divider.append(createPinButton(true), line);
    section.after(divider);

    divider.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.target.closest(".pinfind-divider-pin")) {
        return;
      }
      divider.setPointerCapture(event.pointerId);
      divider.classList.add("pinfind-dragging");

      const onMove = moveEvent => {
        const top = section.getBoundingClientRect().top;
        setHeight(clampHeight(section, moveEvent.clientY - top - DIVIDER_HEIGHT / 2));
      };
      const onUp = () => {
        divider.classList.remove("pinfind-dragging");
        divider.releasePointerCapture(event.pointerId);
        divider.removeEventListener("pointermove", onMove);
        divider.removeEventListener("pointerup", onUp);
        divider.removeEventListener("pointercancel", onUp);
      };
      divider.addEventListener("pointermove", onMove);
      divider.addEventListener("pointerup", onUp);
      divider.addEventListener("pointercancel", onUp);
      event.preventDefault();
      event.stopPropagation();
    });
    return divider;
  };

  /**
   * Locks the pinned area to a fixed height: pins scroll inside it, the divider
   * below stays put and the regular tabs below remain visible.
   * @param {Element} section
   */
  const layoutSection = section => {
    const separator = section.querySelector(SEPARATOR);
    if (!separator) {
      return;
    }
    const divider = ensureDivider(section);
    const locked = isFixed() && getHeight() > 0;
    divider.hidden = !locked;
    separator.classList.toggle("pinfind-fixed", locked);
    section.classList.toggle("pinfind-fixed-section", locked);
    if (locked) {
      section.style.setProperty("--pinfind-height", getHeight() + "px");
    } else {
      section.style.removeProperty("--pinfind-height");
    }
  };

  const layoutAll = () => {
    for (const section of pinnedSections()) {
      layoutSection(section);
    }
  };

  /** @param {number} height */
  const setHeight = height => {
    Services.prefs.setIntPref(PREF_HEIGHT, Math.round(height));
    layoutAll();
  };

  /**
   * Adds the pin button to Zen's separator (shown while the divider is not locked).
   * @param {Element} separator
   */
  const enhanceSeparator = separator => {
    if (separator.hasAttribute("pinfind-enhanced")) {
      return;
    }
    separator.setAttribute("pinfind-enhanced", "true");
    separator.prepend(createPinButton(false));
  };

  const enhanceAll = () => {
    for (const separator of document.querySelectorAll(SEPARATOR)) {
      enhanceSeparator(separator);
    }
    layoutAll();
  };

  // ---------------------------------------------------------------- 4. Load all tabs

  /**
   * All tabs of a folder including subfolders and split view groups.
   * @param {Element} folder
   * @returns {Element[]}
   */
  const folderTabs = folder => {
    const tabs = [];
    for (const item of folder.allItemsRecursive) {
      if (gBrowser.isTab(item)) {
        tabs.push(item);
      } else if (item.tabs && !item.isZenFolder) {
        tabs.push(...item.tabs);
      }
    }
    return tabs;
  };

  /**
   * Loads all pending tabs of a folder. SessionStore only restores a pending tab
   * when it gets selected, so each one is selected briefly and the original
   * selection is restored afterwards.
   * @param {Element} folder
   */
  const loadAllTabs = async folder => {
    folder.collapsed = false;
    const original = gBrowser.selectedTab;
    try {
      for (const tab of folderTabs(folder)) {
        if (!tab.hasAttribute("pending")) {
          continue;
        }
        gBrowser.selectedTab = tab;
        // Let the tab switch settle so the restore actually starts
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    } catch (e) {
      console.error("Pin Sidebar: failed to load tabs", e);
    } finally {
      if (original && !original.closing) {
        gBrowser.selectedTab = original;
      }
    }
  };

  // ---------------------------------------------------------------- 5. Folder color

  /** @returns {Record<string, string>} folder id -> #rrggbb */
  const readColors = () => {
    try {
      return JSON.parse(Services.prefs.getStringPref(PREF_COLORS, "{}"));
    } catch (e) {
      return {};
    }
  };

  /**
   * Persists (or removes, for an empty color) the color of a folder.
   * @param {string} id
   * @param {string} color
   */
  const saveColor = (id, color) => {
    const colors = readColors();
    if (color) {
      colors[id] = color;
    } else {
      delete colors[id];
    }
    Services.prefs.setStringPref(PREF_COLORS, JSON.stringify(colors));
  };

  /**
   * Sets the color on the folder element only (no saving), also used for the live preview.
   * @param {Element} folder
   * @param {string} color
   */
  const paintFolder = (folder, color) => {
    if (color) {
      folder.setAttribute("pinfind-color", "");
      folder.style.setProperty("--pinfind-color", color);
    } else {
      folder.removeAttribute("pinfind-color");
      folder.style.removeProperty("--pinfind-color");
    }
  };

  const applyColors = () => {
    const colors = readColors();
    for (const folder of document.querySelectorAll("zen-folder")) {
      paintFolder(folder, colors[folder.id] ?? "");
    }
  };

  /** @type {Element | null} */
  let colorPanel = null;

  /** @param {Element} folder */
  const openColorDialog = folder => {
    colorPanel?.remove();
    const original = readColors()[folder.id] ?? "";

    const panel = document.createXULElement("panel");
    panel.id = "pinfind-color-panel";
    panel.setAttribute("type", "arrow");
    panel.setAttribute("noautofocus", "true");
    colorPanel = panel;

    const box = document.createElement("div");
    box.className = "pinfind-color-box";
    const title = document.createElement("div");
    title.className = "pinfind-color-title";
    title.textContent = "Folder Color";
    const swatches = document.createElement("div");
    swatches.className = "pinfind-color-swatches";

    /** @param {string} color */
    const confirm = color => {
      saveColor(folder.id, color);
      paintFolder(folder, color);
      panel.hidePopup();
    };

    for (const color of FOLDER_COLORS) {
      const swatch = document.createElement("button");
      swatch.className = "pinfind-color-swatch";
      swatch.style.background = color;
      swatch.title = color;
      swatch.addEventListener("click", () => confirm(color));
      swatches.append(swatch);
    }

    const custom = document.createElement("input");
    custom.type = "color";
    custom.className = "pinfind-color-input";
    custom.value = original || FOLDER_COLORS[0];
    custom.addEventListener("input", () => paintFolder(folder, custom.value));
    custom.addEventListener("change", () => confirm(custom.value));

    const actions = document.createElement("div");
    actions.className = "pinfind-color-actions";
    if (original) {
      const none = document.createElement("button");
      none.textContent = "No Color";
      none.addEventListener("click", () => confirm(""));
      actions.append(none);
    }
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => panel.hidePopup());
    actions.append(cancel);

    box.append(title, swatches, custom, actions);
    panel.append(box);
    // Closing without confirming (Cancel, Escape, click outside) resets the preview
    panel.addEventListener("popuphidden", () => {
      applyColors();
      panel.remove();
      if (colorPanel === panel) {
        colorPanel = null;
      }
    });

    document.getElementById("mainPopupSet").append(panel);
    panel.openPopup(folder.labelElement ?? folder, "after_start");
  };

  // ---------------------------------------------------------------- 6. Folder menu items

  const setupFolderMenuItems = () => {
    const menu = document.getElementById("zenFolderActions");
    const unloadItem = document.getElementById("context_zenFolderUnloadAll");
    const iconItem = document.getElementById("context_zenFolderChangeIcon");
    if (!menu || !unloadItem || document.getElementById("context_pinfindFolderLoadAll")) {
      return;
    }
    /** @type {Element | null} */
    let currentFolder = null;

    /**
     * @param {string} id
     * @param {string} label
     * @param {(folder: Element) => void} action
     * @returns {Element}
     */
    const createItem = (id, label, action) => {
      const item = document.createXULElement("menuitem");
      item.id = id;
      item.setAttribute("label", label);
      item.addEventListener("command", () => {
        if (currentFolder) {
          action(currentFolder);
        }
      });
      return item;
    };

    const loadItem = createItem("context_pinfindFolderLoadAll", "Load All Tabs", loadAllTabs);
    const colorItem = createItem("context_pinfindFolderColor", "Set Color\u2026", openColorDialog);
    unloadItem.before(loadItem);
    (iconItem ?? unloadItem).after(colorItem);

    // Resolve the folder the same way Zen does when opening the menu
    menu.addEventListener("popupshowing", event => {
      const target =
        event.target === menu
          ? (menu.triggerNode ?? event.explicitOriginalTarget)
          : event.explicitOriginalTarget;
      let folder = null;
      if (gBrowser.isTabGroupLabel(target)) {
        folder = target.group;
      } else if (target?.parentElement && gBrowser.isTabGroupLabel(target.parentElement)) {
        folder = target.parentElement.group;
      } else if (
        target?.parentElement?.isZenFolder &&
        target.classList.contains("tab-group-label-container")
      ) {
        folder = target.parentElement;
      }
      currentFolder = folder?.isZenFolder ? folder : null;
      loadItem.hidden = !currentFolder;
      colorItem.hidden = !currentFolder;
    });
  };

  // ---------------------------------------------------------------- 7. Keep tabs above the space bar

  /**
   * The tab area spans the full sidebar height, so tabs scroll under the space
   * bar (#zen-sidebar-foot-buttons). Expose its height so the CSS can end the
   * tab area above it.
   */
  const keepTabsAboveFooter = () => {
    const footer = document.getElementById("zen-sidebar-foot-buttons");
    if (!footer) {
      return;
    }
    const update = () => {
      document.documentElement.style.setProperty(
        "--pinfind-footer-height",
        Math.ceil(footer.getBoundingClientRect().height) + "px"
      );
    };
    update();
    new ResizeObserver(update).observe(footer);
  };

  // ---------------------------------------------------------------- Start

  let scheduled = false;
  const scheduleEnhance = () => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      createSearchBar();
      enhanceAll();
      applyColors();
    });
  };

  const init = (attempt) => {
    const wrapper = document.getElementById("zen-tabs-wrapper");
    if (!wrapper || !createSearchBar()) {
      if (attempt < 50) {
        setTimeout(() => init(attempt + 1), 200);
      }
      return;
    }
    enhanceAll();
    setupFolderMenuItems();
    keepTabsAboveFooter();
    applyColors();
    // New workspaces / pins / folders -> re-layout the divider
    new MutationObserver(scheduleEnhance).observe(wrapper, {
      childList: true,
      subtree: true,
    });
  };

  init(0);
})();
