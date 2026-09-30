import { SHEET_SOURCE } from "./config.js";
import { supabase } from "./supabaseClient.js";

const GOOGLE_SHEETS = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(SHEET_SOURCE.spreadsheetId)}`;

async function readGoogleText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось загрузить данные Google Таблицы");
  const body = await response.text();
  if (body.trimStart().startsWith("<!DOCTYPE html") && url.includes("/export?")) {
    throw new Error("Google Таблица не отдает CSV без входа");
  }
  return body;
}

function workbookTabs(html) {
  // The visualization CSV drops source rows and text in mixed-type columns.
  // The public workbook HTML contains stable IDs for the lossless CSV export.
  const tabs = [...html.matchAll(/\\\"(\d+)\\\",\[\{\\\"1\\\":\[\[0,0,\\\"([^\\\"]+)\\\"/g)]
    .map((match) => ({ gid: match[1], name: match[2] }));
  return [...new Map(tabs.map((tab) => [tab.gid, tab])).values()];
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

export async function loadSheetCsv() {
  const html = await readGoogleText(`${GOOGLE_SHEETS}/edit?gid=${encodeURIComponent(SHEET_SOURCE.gid)}`);
  const tabs = workbookTabs(html);
  if (!tabs.length) throw new Error("Не удалось найти вкладки Google Таблицы");
  const sheets = await mapWithConcurrency(tabs, 8, async ({ gid, name }) => ({
    name,
    csv: await readGoogleText(`${GOOGLE_SHEETS}/export?format=csv&gid=${encodeURIComponent(gid)}`),
  }));
  return {
    ok: true,
    source: { ...SHEET_SOURCE, format: "google-export" },
    fetchedAt: new Date().toISOString(),
    sheets,
  };
}

function rowToMonth(row) {
  return {
    month: row.month,
    label: row.label,
    period: { start: row.period_start, end: row.period_end },
    activeDays: row.active_days,
    totals: row.totals,
    ranking: row.ranking || [],
    savedAt: row.saved_at,
    updatedAt: row.updated_at,
  };
}

export async function loadMonthlyArchive() {
  const { data, error } = await supabase
    .from("monthly_archive")
    .select("*")
    .order("month", { ascending: true });
  if (error) throw new Error(error.message || "Не удалось загрузить годовой архив");
  return { ok: true, months: (data || []).map(rowToMonth) };
}

export async function saveMonthlySnapshot(snapshot) {
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("monthly_archive")
    .select("saved_at")
    .eq("month", snapshot.month)
    .maybeSingle();

  const row = {
    month: snapshot.month,
    label: snapshot.label,
    period_start: snapshot.period?.start || "",
    period_end: snapshot.period?.end || "",
    active_days: snapshot.activeDays || 0,
    totals: snapshot.totals,
    ranking: snapshot.ranking || [],
    saved_at: existing?.saved_at || now,
    updated_at: now,
  };

  const { error } = await supabase.from("monthly_archive").upsert(row, { onConflict: "month" });
  if (error) throw new Error(error.message || "Не удалось обновить годовой архив");
  return loadMonthlyArchive();
}

export async function updateMonthlyTotals(month, { totalIncome, totalExpense }) {
  const { data: existing, error: fetchError } = await supabase
    .from("monthly_archive")
    .select("totals")
    .eq("month", month)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message || "Не удалось загрузить месяц");
  if (!existing) throw new Error("Месяц не найден в архиве");

  const netProfit = totalIncome - totalExpense;
  const totals = { ...existing.totals, totalIncome, totalExpense, netProfit, balance: netProfit };

  const { error } = await supabase
    .from("monthly_archive")
    .update({ totals, updated_at: new Date().toISOString() })
    .eq("month", month);
  if (error) throw new Error(error.message || "Не удалось сохранить месяц");
  return loadMonthlyArchive();
}
