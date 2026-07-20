import { SHEET_SOURCE, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";
import { supabase } from "./supabaseClient.js";

export async function loadSheetCsv() {
  const params = new URLSearchParams({
    spreadsheetId: SHEET_SOURCE.spreadsheetId,
    gid: SHEET_SOURCE.gid,
  });
  const response = await fetch(`${SUPABASE_URL}/functions/v1/gym-report?${params.toString()}`, {
    cache: "no-store",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.message || "Не удалось загрузить таблицу");
    error.code = payload.code || "LOAD_ERROR";
    error.payload = payload;
    throw error;
  }
  return payload;
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
