import { loadMonthlyArchive, loadSheetCsv, saveMonthlySnapshot, updateMonthlyTotals } from "./api.js";
import { parseCsv } from "./csv.js";
import { SAMPLE_ROWS } from "./sampleData.js";
import { normalizeRows, normalizeWorkbook } from "./normalizer.js";
import { buildDashboardModel } from "./analytics.js";
import { renderDashboard, renderFatalError, startWorkdayTicker, updateMonthlyArchive, appendWarning } from "./ui.js";
import { applyTheme, readPrefs } from "./prefs.js";
import { clearTickers } from "./anim.js";
import { renderV2, renderV2Loading, updateV2Archive } from "./layoutV2.js";
import { mountToolbar, refreshToolbar } from "./toolbar.js";
import { renderSubscriptionGoal } from "./goal.js";
import { loadBridgeDashboard, bridgeDashboardModel, createNextMonth, archiveToMonthlyHistory } from "./bridge.js";
import { loadSubscriptionHealth, readSubscriptionHealthCache, renderSubscriptionHealth } from "./subscriptionHealth.js";
import { renderPeriodExplorer, showPeriodReportError } from "./periodExplorer.js";

const CACHE_KEY = "gf-fit-dashboard-cache-v3";

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(entry) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // storage unavailable (private mode/quota) — cache is a speed optimization only
  }
}

const editMonthHandler = (month, totals) => updateMonthlyTotals(month, totals).then((payload) => payload.months);

// Last rendered state, so layout/theme switches re-render without refetching.
let current = { model: null, meta: null };
let subscriptionHealth = readSubscriptionHealthCache();
let refreshPromise = null;
let refreshing = false;

// The goal, subscription calendar and report keep one set of IDs and handlers.
// Restore their original positions before replacing a layout's HTML.
const sharedPanels = ["subscriptionGoal", "periodReport"].map((id) => {
  const node = document.getElementById(id);
  const anchor = document.createComment(`${id} original position`);
  node.before(anchor);
  return { id, node, anchor };
});

function restoreSharedPanels() {
  for (const { node, anchor } of sharedPanels) anchor.after(node);
}

function placeSharedPanels(layout) {
  if (layout !== "v2") return;
  for (const { id, node } of sharedPanels) {
    const slot = document.getElementById(id === "subscriptionGoal" ? "v2GoalSlot" : "v2ReportSlot");
    if (slot) slot.appendChild(node);
  }
}

function showLayout(layout) {
  document.documentElement.dataset.layout = layout;
  for (const id of ["v1", "v2"]) document.getElementById(`layout${id.toUpperCase()}`).hidden = id !== layout;
}

function renderLoadingLayout() {
  restoreSharedPanels();
  const { layout } = readPrefs();
  showLayout(layout);
  if (layout === "v2") {
    renderV2Loading(document.getElementById("layoutV2"));
    if (!current.model) document.getElementById("subscriptionGoalToday").textContent = "Сегодня: —";
  }
  placeSharedPanels(layout);
  setRefreshing(refreshing);
}

function setRefreshing(value) {
  refreshing = value;
  for (const button of document.querySelectorAll('[data-action="refresh"]')) {
    button.disabled = value;
    button.setAttribute("aria-busy", String(value));
  }
}

function monthLabel(month) {
  const [year, value] = String(month || "").split("-").map(Number);
  if (!year || !value) return month || "Месяц";
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date(year, value - 1, 1));
}

function archiveMonth(model) {
  const sourceDate = model.period.start || model.today?.date || "";
  return sourceDate.match(/^\d{4}-\d{2}/)?.[0] || new Date().toISOString().slice(0, 7);
}

function buildArchiveSnapshot(model) {
  const month = archiveMonth(model);
  const activeDays = model.records.filter((record) => record.totalIncome || record.totalExpense).length;
  return {
    month,
    label: monthLabel(month),
    period: model.period,
    activeDays,
    totals: model.totals,
    ranking: model.incomeRanking,
  };
}

async function syncMonthlyArchive(model) {
  if (model.sourceMode !== "live") return loadMonthlyArchive();
  if (!model.totals || (!model.totals.totalIncome && !model.totals.totalExpense)) return loadMonthlyArchive();
  return saveMonthlySnapshot(buildArchiveSnapshot(model));
}

function paint(model, meta) {
  restoreSharedPanels();
  current = { model, meta };
  renderSubscriptionGoal(model);
  const { layout } = readPrefs();
  const hosts = {
    v1: document.getElementById("layoutV1"),
    v2: document.getElementById("layoutV2"),
  };

  clearTickers();
  showLayout(layout);

  const archiveEditor = meta.archiveReadOnly ? null : editMonthHandler;
  const ctx = { onEditMonth: archiveEditor };
  const fullMeta = { ...meta, onEditMonth: archiveEditor };

  if (layout === "v2") renderV2(hosts.v2, model, fullMeta, ctx);
  else {
    renderDashboard(model, fullMeta);
    startWorkdayTicker();
  }

  placeSharedPanels(layout);

  refreshToolbar();
  renderPeriodExplorer(model, meta, layout);
  setRefreshing(refreshing);
}

function repaint() {
  if (current.model) paint(current.model, current.meta);
  else renderLoadingLayout();
}

// Renders immediately from whatever archive data we already have, then syncs
// the archive in the background — the page never waits on that round-trip.
function renderThenSyncArchive(model, meta, cachedMonthlyArchive) {
  const baseMeta = { ...meta, monthlyArchive: cachedMonthlyArchive };
  paint(model, baseMeta);
  writeCache({ model, monthlyArchive: cachedMonthlyArchive, meta });

  syncMonthlyArchive(model)
    .then((archivePayload) => {
      const months = archivePayload.months || [];
      current.meta = { ...current.meta, monthlyArchive: months };
      // Patch only the archive section — repainting the whole layout here
      // would restart every entrance animation a second after load.
      const layout = readPrefs().layout;
      if (layout === "v1") updateMonthlyArchive(months, editMonthHandler);
      else updateV2Archive(document.getElementById("layoutV2"), months, current.meta.archiveReadOnly ? null : editMonthHandler);
      writeCache({ model, monthlyArchive: months, meta });
    })
    .catch((error) => {
      if (readPrefs().layout === "v1") appendWarning(error.message || "Годовой архив не обновлен");
    });
}

async function loadDashboard() {
  const cached = readCache();
  if (cached) {
    paint(cached.model, { ...cached.meta, monthlyArchive: cached.monthlyArchive || [] });
  } else if (readPrefs().layout === "v1") {
    document.getElementById("sourceStatus").textContent = "Загрузка данных";
    document.getElementById("sourceStatus").className = "status";
  }

  try {
    const bridge = await loadBridgeDashboard();
    if (bridge) {
      const model = bridgeDashboardModel(bridge);
      const months = (bridge.archives || []).map(archiveToMonthlyHistory);
      paint(model, { fetchedAt: bridge.generatedAt, monthlyArchive: months, archiveReadOnly: true });
      writeCache({ model, monthlyArchive: months, meta: { fetchedAt: bridge.generatedAt, archiveReadOnly: true } });
      return true;
    }
    const payload = await loadSheetCsv();
    const normalized = Array.isArray(payload.sheets)
      ? normalizeWorkbook(payload.sheets.map((sheet) => ({ ...sheet, rows: parseCsv(sheet.csv, { preserveEmptyRows: true }) })))
      : normalizeRows(parseCsv(payload.csv));
    const model = buildDashboardModel(normalized, "live");
    renderThenSyncArchive(model, { fetchedAt: payload.fetchedAt }, cached?.monthlyArchive || []);
    return true;
  } catch (error) {
    if (error.code === "GOOGLE_SHEET_NOT_PUBLIC") {
      const normalized = normalizeRows(SAMPLE_ROWS);
      const model = buildDashboardModel(normalized, "demo");
      const archivePayload = await loadMonthlyArchive().catch(() => ({ months: cached?.monthlyArchive || [] }));
      paint(model, { monthlyArchive: archivePayload.months || [] });
      return true;
    }
    if (!cached && readPrefs().layout === "v1") renderFatalError(error);
    throw error;
  }
}

async function refreshSubscriptionHealth() {
  renderSubscriptionHealth(subscriptionHealth, { loading: true });
  try {
    subscriptionHealth = await loadSubscriptionHealth();
    renderSubscriptionHealth(subscriptionHealth);
  } catch {
    renderSubscriptionHealth(subscriptionHealth, { failed: true });
  }
}

function refreshDashboard() {
  if (refreshPromise) return refreshPromise;
  setRefreshing(true);
  const feedback = document.getElementById("dashboardRefreshFeedback");
  feedback.hidden = true;
  refreshPromise = Promise.allSettled([loadDashboard(), refreshSubscriptionHealth()])
    .then(([dashboard]) => {
      if (dashboard.status === "rejected") {
        showPeriodReportError();
        if (!current.model && readPrefs().layout === "v2") {
          const daily = document.getElementById("v2Daily");
          if (daily) {
            daily.setAttribute("aria-busy", "false");
            daily.innerHTML = '<div class="v2r-section-heading"><h2>По дням</h2></div><p class="v2r-empty" role="status">Не удалось загрузить дневные данные. Нажмите «Обновить данные», чтобы повторить.</p>';
          }
          document.getElementById("subscriptionGoalMonth").textContent = "Данные не загружены";
          document.getElementById("subscriptionGoalRemaining").textContent = "Цель — 100 абонементов за месяц.";
          const subtitle = document.querySelector(".v2r-banner > div > span");
          if (subtitle) subtitle.textContent = "Данные не загружены";
        }
        const refreshLabel = readPrefs().layout === "v2" ? "Обновить данные" : "Новые результаты";
        feedback.textContent = current.model
          ? `Не удалось обновить отчёт. Показаны последние сохранённые показатели. Нажмите «${refreshLabel}», чтобы повторить.`
          : `Не удалось загрузить отчёт. Нажмите «${refreshLabel}», чтобы повторить.`;
        feedback.hidden = false;
      }
    })
    .finally(() => {
      setRefreshing(false);
      refreshPromise = null;
    });
  return refreshPromise;
}

applyTheme(readPrefs().theme);
mountToolbar(repaint, {
  getMonthData: () => ({
    period: current.model?.activePeriod || current.model?.dailyRecords?.[0]?.date?.slice(0, 7) || "",
    canCreate: !!current.model?.activePeriod,
    archives: current.model?.activePeriod ? current.meta?.monthlyArchive || [] : [],
  }),
  createMonth: async (period, adminToken, onProgress) => {
    const result = await createNextMonth(period, adminToken, onProgress);
    if (result.complete) await refreshDashboard();
    return result;
  },
});

document.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="refresh"]')) refreshDashboard();
});

renderLoadingLayout();
refreshDashboard();
