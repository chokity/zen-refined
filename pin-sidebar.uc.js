// ==UserScript==
// @name        Pin Sidebar
// @description Find-pin-Suche, Dock-Dot und fixierbarer Pin-Trenner fuer Zen
// ==/UserScript==

(() => {
  if (window.__pinSidebarLoaded) {
    return;
  }
  window.__pinSidebarLoaded = true;

  const PREF_FIXED = "pinsidebar.divider.fixed";
  const PREF_INDEX = "pinsidebar.divider.index";
  const PINNED_SECTION = ".zen-workspace-pinned-tabs-section";
  const SEPARATOR = ".pinned-tabs-container-separator";

  /** @type {Map<Element, boolean>} Folder -> urspruenglicher collapsed-Zustand */
  const savedFolderState = new Map();

  // ---------------------------------------------------------------- Helfer

  /** @returns {boolean} */
  const isFixed = () => Services.prefs.getBoolPref(PREF_FIXED, false);

  /** @returns {number} */
  const getIndex = () => Services.prefs.getIntPref(PREF_INDEX, 0);

  /**
   * Oberste Pin-Elemente (Tabs und Folder) einer Pin-Sektion.
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
      // pending Tabs ohne Browser: nur Label verwenden
    }
    return text.toLowerCase().includes(query);
  }

  /**
   * Filtert ein Element rekursiv und setzt das pinfind-hidden-Attribut.
   * @param {Element} element
   * @param {string} query
   * @param {boolean} forceShow Eltern-Folder hat selbst getroffen: alles darin zeigen
   * @returns {boolean} true wenn das Element sichtbar bleibt
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
    clear.title = "Suche leeren";

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

    // Neue Tabs/Folder waehrend aktiver Suche ebenfalls filtern
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

  // ---------------------------------------------------------------- 3. Trenner

  /**
   * Setzt CSS-order so, dass der Trenner vor Element `index` steht.
   * @param {Element} section
   */
  const layoutSection = section => {
    const separator = section.querySelector(SEPARATOR);
    if (!separator) {
      return;
    }
    const items = topLevelItems(section);
    if (!isFixed()) {
      for (const item of items) {
        item.style.removeProperty("order");
      }
      separator.style.removeProperty("order");
      separator.classList.remove("pinfind-fixed");
      return;
    }
    const index = Math.max(0, Math.min(getIndex(), items.length));
    items.forEach((item, i) => {
      item.style.order = String(i * 2);
    });
    separator.style.order = String(index * 2 - 1);
    separator.classList.add("pinfind-fixed");
  };

  const layoutAll = () => {
    for (const section of pinnedSections()) {
      layoutSection(section);
    }
  };

  /** @param {number} index */
  const setIndex = index => {
    Services.prefs.setIntPref(PREF_INDEX, index);
    layoutAll();
  };

  /**
   * Haengt Pin-Button und Drag-Verhalten an einen Trenner.
   * @param {Element} separator
   */
  const enhanceSeparator = separator => {
    if (separator.hasAttribute("pinfind-enhanced")) {
      return;
    }
    separator.setAttribute("pinfind-enhanced", "true");

    const button = document.createXULElement("toolbarbutton");
    button.className = "pinfind-divider-pin";
    button.setAttribute("tooltiptext", "Trenner fixieren");
    button.textContent = "📌";
    button.addEventListener("click", event => {
      event.stopPropagation();
      const next = !isFixed();
      Services.prefs.setBoolPref(PREF_FIXED, next);
      if (next) {
        // Aktuelle Position uebernehmen: Trenner bleibt zunaechst am Listenende
        const section = separator.closest(PINNED_SECTION);
        Services.prefs.setIntPref(PREF_INDEX, topLevelItems(section).length);
      }
      layoutAll();
    });
    separator.prepend(button);

    separator.addEventListener("pointerdown", event => {
      if (!isFixed() || event.button !== 0 || event.target.closest(".pinfind-divider-pin, toolbarbutton")) {
        return;
      }
      const section = separator.closest(PINNED_SECTION);
      separator.setPointerCapture(event.pointerId);
      separator.classList.add("pinfind-dragging");

      const onMove = (moveEvent) => {
        const items = topLevelItems(section);
        let newIndex = 0;
        items.forEach((item, i) => {
          const rect = item.getBoundingClientRect();
          if (rect.height > 0 && rect.top + rect.height / 2 < moveEvent.clientY) {
            newIndex = i + 1;
          }
        });
        if (newIndex !== getIndex()) {
          setIndex(newIndex);
        }
      };
      const onUp = () => {
        separator.classList.remove("pinfind-dragging");
        separator.releasePointerCapture(event.pointerId);
        separator.removeEventListener("pointermove", onMove);
        separator.removeEventListener("pointerup", onUp);
        separator.removeEventListener("pointercancel", onUp);
      };
      separator.addEventListener("pointermove", onMove);
      separator.addEventListener("pointerup", onUp);
      separator.addEventListener("pointercancel", onUp);
      event.preventDefault();
      event.stopPropagation();
    });
  };

  const enhanceAll = () => {
    for (const separator of document.querySelectorAll(SEPARATOR)) {
      enhanceSeparator(separator);
    }
    layoutAll();
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
    // Neue Workspaces / Pins / Folder -> Trenner neu ausrichten
    new MutationObserver(scheduleEnhance).observe(wrapper, {
      childList: true,
      subtree: true,
    });
  };

  init(0);
})();
