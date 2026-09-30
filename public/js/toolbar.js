import { LAYOUTS, THEMES, applyTheme, readPrefs, writePrefs } from "./prefs.js";
import { SHEET_SOURCE } from "./config.js";

const PREVIEWS = {
  v1: `<i class="pv a"></i><i class="pv a"></i><i class="pv a"></i><i class="pv a"></i><i class="pv a"></i><i class="pv a"></i>`,
  v2: `<i class="pv big"></i><i class="pv b"></i><i class="pv b"></i>`,
  v3: `<i class="pv c"></i><i class="pv c"></i><i class="pv c"></i><i class="pv c"></i><i class="pv wide"></i><i class="pv c"></i><i class="pv c"></i><i class="pv c"></i>`,
};

let host = null;
let open = false;
let onChange = () => {};
let monthTools = {};
let monthMessage = "";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function nextMonth(period) {
  if (!/^\d{4}-\d{2}$/.test(period || "")) return "";
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function archiveMarkup(items) {
  if (!items?.length) return '<p class="tb-note">Сохранённых месяцев пока нет.</p>';
  const money = (amount) => `${new Intl.NumberFormat("ru-RU").format(Number(amount) || 0)} ₽`;
  return items.slice().sort((a, b) => b.month.localeCompare(a.month)).map((item) => {
    const days = (item.days || []).map((day) => `<tr><td>${escapeHtml(day.date)}</td><td>${Number(day.subscriptions) || 0}</td><td>${money(day.revenue)}</td><td>${money(day.expenses)}</td><td>${money((Number(day.revenue) || 0) - (Number(day.expenses) || 0))}</td></tr>`).join("");
    return `<details class="tb-archive-item"><summary><strong>${escapeHtml(item.label || item.month)}</strong><span>${Number(item.totals?.membershipsCount) || 0}/100</span></summary><div class="tb-archive-totals"><span>Выручка: ${money(item.totals?.totalIncome)}</span><span>Расходы: ${money(item.totals?.totalExpense)}</span><span>Прибыль: ${money(item.totals?.netProfit)}</span></div>${days ? `<div class="tb-archive-scroll"><table><thead><tr><th>Дата</th><th>Абон.</th><th>Выручка</th><th>Расходы</th><th>Итог</th></tr></thead><tbody>${days}</tbody></table></div>` : ""}</details>`;
  }).join("");
}

function render() {
  const prefs = readPrefs();
  const monthData = monthTools.getMonthData?.() || {};
  const upcoming = nextMonth(monthData.period);

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

      <div class="tb-section tb-month-section">
        <p class="tb-title">Новый месяц</p>
        <p class="tb-note">Текущий: ${escapeHtml(monthData.period || "загрузка")}. При создании итоги попадут в «Архив» Google Таблицы.</p>
        ${monthData.canCreate ? "" : '<p class="tb-note">Создание месяца доступно после подключения сайта к Netlify и обновления Apps Script.</p>'}
        <form id="tbMonthForm" class="tb-month-form">
          <label>Следующий месяц<input name="period" type="month" value="${escapeHtml(upcoming)}" min="${escapeHtml(upcoming)}" max="${escapeHtml(upcoming)}" required ${upcoming && monthData.canCreate ? "" : "disabled"}></label>
          <label>Ключ администратора<input name="adminToken" type="password" autocomplete="off" required></label>
          <button type="submit" ${upcoming && monthData.canCreate ? "" : "disabled"}>Создать месяц и сохранить архив</button>
        </form>
        <p class="tb-month-status" role="status">${escapeHtml(monthMessage)}</p>
      </div>

      <div class="tb-section">
        <p class="tb-title">Архив</p>
        <a class="tb-archive-link" href="${SHEET_SOURCE.archiveUrl}" target="_blank" rel="noreferrer">Открыть вкладку «Архив» ↗</a>
        <div class="tb-archive-list">${archiveMarkup(monthData.archives)}</div>
      </div>

    </div>

    <button type="button" class="tb-fab tb-fab-menu ${open ? "is-open" : ""}" aria-label="Настройки вида" aria-expanded="${open}">
      <span class="tb-burger"><i></i><i></i><i></i></span>
    </button>
  `;
}

export function mountToolbar(handler, tools = {}) {
  onChange = handler;
  monthTools = tools;
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

  host.addEventListener("submit", async (event) => {
    if (event.target.id !== "tbMonthForm") return;
    event.preventDefault();
    const form = event.target;
    const period = form.elements.period.value;
    const token = form.elements.adminToken.value;
    const button = form.querySelector('button[type="submit"]');
    const status = host.querySelector(".tb-month-status");
    button.disabled = true;
    status.textContent = "Создаём вкладки нового месяца…";
    try {
      await monthTools.createMonth(period, token, (result) => {
        if (status.isConnected) status.textContent = `Создано ${result.created} из ${result.total} дней…`;
      });
      monthMessage = `Месяц ${period} создан. Предыдущий месяц сохранён в архиве.`;
      render();
    } catch (error) {
      monthMessage = error.message || "Не удалось создать месяц.";
      if (status.isConnected) status.textContent = monthMessage;
      button.disabled = false;
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

export function refreshToolbar() {
  if (host) render();
}
