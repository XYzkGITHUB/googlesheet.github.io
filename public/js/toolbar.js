import { LAYOUTS, THEMES, applyTheme, readPrefs, writePrefs } from "./prefs.js";

const PREVIEWS = {
  v1: `<i class="pv a"></i><i class="pv a"></i><i class="pv a"></i><i class="pv a"></i><i class="pv a"></i><i class="pv a"></i>`,
  v2: `<i class="pv big"></i><i class="pv b"></i><i class="pv b"></i>`,
  v3: `<i class="pv c"></i><i class="pv c"></i><i class="pv c"></i><i class="pv c"></i><i class="pv wide"></i><i class="pv c"></i><i class="pv c"></i><i class="pv c"></i>`,
};

let host = null;
let open = false;
let onChange = () => {};

function render() {
  const prefs = readPrefs();

  host.innerHTML = `
    <div class="tb-panel ${open ? "is-open" : ""}" role="dialog" aria-label="Настройки вида" aria-hidden="${!open}">
      <div class="tb-section">
        <p class="tb-title">Макет</p>
        <div class="tb-layouts">
          ${LAYOUTS.map((item) => `
            <button type="button" class="tb-layout ${prefs.layout === item.id ? "active" : ""}" data-layout="${item.id}">
              <span class="tb-preview ${item.id}">${PREVIEWS[item.id]}</span>
              <strong>${item.name}<em>${item.id}</em></strong>
              <small>${item.note}</small>
            </button>
          `).join("")}
        </div>
      </div>

      <div class="tb-section">
        <p class="tb-title">Тема</p>
        <div class="tb-themes">
          ${THEMES.map((theme) => `
            <button type="button" class="tb-theme ${prefs.theme === theme.id ? "active" : ""}" data-theme="${theme.id}" title="${theme.name}">
              <i style="background:${theme.dot}"></i>
              <span>${theme.name}</span>
            </button>
          `).join("")}
        </div>
      </div>

    </div>

    <button type="button" class="tb-fab tb-fab-menu ${open ? "is-open" : ""}" aria-label="Настройки вида" aria-expanded="${open}">
      <span class="tb-burger"><i></i><i></i><i></i></span>
    </button>
  `;
}

export function mountToolbar(handler) {
  onChange = handler;
  host = document.createElement("div");
  host.id = "toolbarHost";
  document.body.appendChild(host);
  render();

  host.addEventListener("click", (event) => {
    // Re-rendering detaches event.target, so the document-level outside-click
    // handler below can no longer tell this click came from inside the panel.
    event.__fromToolbar = true;

    if (event.target.closest(".tb-fab-menu")) {
      open = !open;
      render();
      return;
    }

    const layoutButton = event.target.closest("[data-layout]");
    if (layoutButton) {
      const prefs = { ...readPrefs(), layout: layoutButton.dataset.layout };
      writePrefs(prefs);
      open = false;
      render();
      onChange();
      return;
    }

    const themeButton = event.target.closest("[data-theme]");
    if (themeButton) {
      const prefs = { ...readPrefs(), theme: themeButton.dataset.theme };
      writePrefs(prefs);
      applyTheme(prefs.theme);
      render();
    }
  });

  document.addEventListener("click", (event) => {
    if (open && !event.__fromToolbar) {
      open = false;
      render();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) {
      open = false;
      render();
    }
  });
}
