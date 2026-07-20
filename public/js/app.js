import { loadMonthlyArchive, loadSheetCsv, saveMonthlySnapshot } from "./api.js";
import { parseCsv } from "./csv.js";
import { SAMPLE_ROWS } from "./sampleData.js";
import { normalizeRows, normalizeWorkbook } from "./normalizer.js";
import { buildDashboardModel } from "./analytics.js";
import { renderDashboard, renderFatalError, startWorkdayTicker } from "./ui.js";

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

async function loadDashboard() {
  try {
    document.getElementById("sourceStatus").textContent = "Загрузка данных";
    document.getElementById("sourceStatus").className = "status";
    const payload = await loadSheetCsv();
    const normalized = Array.isArray(payload.sheets)
      ? normalizeWorkbook(payload.sheets.map((sheet) => ({ ...sheet, rows: parseCsv(sheet.csv) })))
      : normalizeRows(parseCsv(payload.csv));
    const model = buildDashboardModel(normalized, "live");
    let archivePayload = { months: [] };
    let archiveWarning = "";
    try {
      archivePayload = await syncMonthlyArchive(model);
    } catch (error) {
      archiveWarning = error.message || "Годовой архив не обновлен";
    }
    renderDashboard(model, {
      fetchedAt: payload.fetchedAt,
      monthlyArchive: archivePayload.months || [],
      archiveWarning,
    });
    startWorkdayTicker();
  } catch (error) {
    if (error.code === "GOOGLE_SHEET_NOT_PUBLIC") {
      const normalized = normalizeRows(SAMPLE_ROWS);
      const archivePayload = await loadMonthlyArchive().catch(() => ({ months: [] }));
      renderDashboard(buildDashboardModel(normalized, "demo"), { monthlyArchive: archivePayload.months || [] });
      startWorkdayTicker();
      return;
    }
    renderFatalError(error);
  }
}

document.getElementById("refreshButton").addEventListener("click", loadDashboard);
loadDashboard();
