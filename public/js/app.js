import { loadMonthlyArchive, loadSheetCsv, saveMonthlySnapshot, updateMonthlyTotals } from "./api.js";
import { parseCsv } from "./csv.js";
import { SAMPLE_ROWS } from "./sampleData.js";
import { normalizeRows, normalizeWorkbook } from "./normalizer.js";
import { buildDashboardModel } from "./analytics.js";
import { renderDashboard, renderFatalError, startWorkdayTicker, updateMonthlyArchive, appendWarning } from "./ui.js";

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

function monthLabel(month) {
  const [year, value] = String(month || "").split("-").map(Number);
  if (!year || !value) return month || "Месяц";
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date(year, value - 1, 1));
}

function archiveMonth(model) {
  const sourceDate = model.period.start || model.today?.date || "";
  const month = sourceDate.match(/^\d{4}-\d{2}/)?.[0] || new Date().toISOString().slice(0, 7);
  return month;
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

// Renders immediately from whatever archive data we already have (cache or
// empty), then syncs the archive in the background and patches just that
// section in place — the page doesn't wait on the archive round-trip to paint.
function renderThenSyncArchive(model, meta, cachedMonthlyArchive) {
  renderDashboard(model, {
    ...meta,
    monthlyArchive: cachedMonthlyArchive,
    onEditMonth: editMonthHandler,
  });
  startWorkdayTicker();
  writeCache({ model, monthlyArchive: cachedMonthlyArchive, meta });

  syncMonthlyArchive(model)
    .then((archivePayload) => {
      const months = archivePayload.months || [];
      updateMonthlyArchive(months, editMonthHandler);
      writeCache({ model, monthlyArchive: months, meta });
    })
    .catch((error) => {
      appendWarning(error.message || "Годовой архив не обновлен");
    });
}

async function loadDashboard() {
  const cached = readCache();
  if (cached) {
    renderDashboard(cached.model, {
      ...cached.meta,
      monthlyArchive: cached.monthlyArchive || [],
      onEditMonth: editMonthHandler,
    });
    startWorkdayTicker();
  } else {
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
      renderDashboard(model, { monthlyArchive: archivePayload.months || [], onEditMonth: editMonthHandler });
      startWorkdayTicker();
      return;
    }
    if (!cached) renderFatalError(error);
  }
}

document.getElementById("refreshButton").addEventListener("click", loadDashboard);
loadDashboard();
