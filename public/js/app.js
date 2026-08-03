import { loadMonthlyArchive, loadSheetCsv, saveMonthlySnapshot, updateMonthlyTotals } from "./api.js";
import { parseCsv } from "./csv.js";
import { SAMPLE_ROWS } from "./sampleData.js";
import { normalizeRows, normalizeWorkbook } from "./normalizer.js";
import { buildDashboardModel } from "./analytics.js";
import { renderDashboard, renderFatalError, startWorkdayTicker, updateMonthlyArchive, appendWarning } from "./ui.js";
import { applyTheme, readPrefs, watchSystemTheme } from "./prefs.js";
import { clearTickers } from "./anim.js";
import { renderV2 } from "./layoutV2.js";
import { renderV3, updateV3Archive } from "./layoutV3.js";
import { mountToolbar } from "./toolbar.js";

const CACHE_KEY = "gf-fit-dashboard-cache-v1";

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
  current = { model, meta };
  const { layout } = readPrefs();
  const hosts = {
    v1: document.getElementById("layoutV1"),
    v2: document.getElementById("layoutV2"),
    v3: document.getElementById("layoutV3"),
  };

  clearTickers();
  for (const [id, host] of Object.entries(hosts)) host.hidden = id !== layout;

  const ctx = { onEditMonth: editMonthHandler };
  const fullMeta = { ...meta, onEditMonth: editMonthHandler };

  if (layout === "v2") renderV2(hosts.v2, model, fullMeta, ctx);
  else if (layout === "v3") renderV3(hosts.v3, model, fullMeta, ctx);
  else {
    renderDashboard(model, fullMeta);
    startWorkdayTicker();
  }

  window.scrollTo({ top: 0 });
}

function repaint() {
  if (current.model) paint(current.model, current.meta);
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
      else if (layout === "v3") updateV3Archive(months);
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
    const payload = await loadSheetCsv();
    const normalized = Array.isArray(payload.sheets)
      ? normalizeWorkbook(payload.sheets.map((sheet) => ({ ...sheet, rows: parseCsv(sheet.csv) })))
      : normalizeRows(parseCsv(payload.csv));
    const model = buildDashboardModel(normalized, "live");
    renderThenSyncArchive(model, { fetchedAt: payload.fetchedAt }, cached?.monthlyArchive || []);
  } catch (error) {
    if (error.code === "GOOGLE_SHEET_NOT_PUBLIC") {
      const normalized = normalizeRows(SAMPLE_ROWS);
      const model = buildDashboardModel(normalized, "demo");
      const archivePayload = await loadMonthlyArchive().catch(() => ({ months: cached?.monthlyArchive || [] }));
      paint(model, { monthlyArchive: archivePayload.months || [] });
      return;
    }
    if (!cached && readPrefs().layout === "v1") renderFatalError(error);
  }
}

applyTheme(readPrefs().theme);
watchSystemTheme(() => applyTheme(readPrefs().theme));
mountToolbar(repaint);

document.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="refresh"]')) loadDashboard();
});

loadDashboard();
