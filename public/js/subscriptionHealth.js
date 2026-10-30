import { SHEET_SOURCE, NUMBER_FORMAT } from "./config.js";
import { parseCsv } from "./csv.js";
import { buildSubscriptionHealth, moscowDate, parseCalendarDate } from "./subscriptions.js";

const CACHE_KEY = "gf-fit-subscription-health-v1";
const COUNTS = ["expired", "expiringSoon", "listed", "active", "expiresToday", "expiringWeek", "total", "unknownDates"];

// Only aggregate counts and their calculation date ever enter browser storage.
function safeSnapshot(health) {
  if (!health?.available || !parseCalendarDate(health.calculatedOn)) return null;
  const result = { available: true, calculatedOn: health.calculatedOn, detailsAvailable: health.detailsAvailable === true };
  for (const key of COUNTS) {
    result[key] = Number.isSafeInteger(health[key]) && health[key] >= 0 ? health[key] : null;
  }
  if (result.expired === null || result.expiringSoon === null || result.listed !== result.expired + result.expiringSoon) return null;
  result.detailsAvailable &&= ["active", "expiresToday", "expiringWeek", "total"].every((key) => result[key] !== null)
    && result.expiresToday <= result.expiringSoon && result.expiringSoon <= result.expiringWeek
    && result.expiringWeek <= result.active && result.active + result.expired <= result.total;
  return result;
}

export function readSubscriptionHealthCache() {
  try { return safeSnapshot(JSON.parse(localStorage.getItem(CACHE_KEY))); }
  catch { return null; }
}

async function readRange(gid, range) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_SOURCE.spreadsheetId}/export`);
  url.search = new URLSearchParams({ format: "csv", gid, range }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("Не удалось обновить сроки абонементов.");
  const csv = await response.text();
  if (/^\s*</.test(csv)) throw new Error("Сроки абонементов недоступны.");
  return parseCsv(csv, { preserveEmptyRows: true });
}

export async function loadSubscriptionHealth() {
  const [summary, memberships] = await Promise.allSettled([
    // The summary ends on row 4; the client list beneath it is never fetched.
    readRange(SHEET_SOURCE.subscriptionSummaryGid, "A1:F4"),
    // D:I has start/expiry dates and status, excluding names, contacts and search results.
    readRange(SHEET_SOURCE.membershipViewGid, "D4:I"),
  ]);
  if (summary.status === "rejected") throw summary.reason;
  const health = buildSubscriptionHealth(summary.value, memberships.status === "fulfilled" ? memberships.value : []);
  const snapshot = safeSnapshot(health);
  if (snapshot) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)); }
    catch { /* Storage is optional. */ }
  } else {
    try { localStorage.removeItem(CACHE_KEY); }
    catch { /* Storage is optional. */ }
  }
  return health;
}

function displayDate(iso) {
  return iso.split("-").reverse().join(".");
}

export function renderSubscriptionHealth(health, { loading = false, failed = false } = {}) {
  const grid = document.getElementById("subscriptionHealthGrid");
  const summary = document.getElementById("subscriptionHealthSummary");
  const note = document.getElementById("subscriptionHealthNote");
  if (!health?.available) {
    grid.hidden = true;
    summary.textContent = loading ? "Загрузка…" : "Нет данных";
    note.textContent = loading ? "Обновляем общие показатели из таблицы."
      : "Не удалось получить показатели сроков. Нажмите «Новые результаты», чтобы повторить загрузку.";
    return;
  }

  grid.hidden = false;
  const stale = health.calculatedOn !== moscowDate();
  const details = health.detailsAvailable && !stale;
  const metricIds = {
    expired: "subscriptionsExpired", expiringSoon: "subscriptionsExpireSoon",
    expiresToday: "subscriptionsExpireToday", expiringWeek: "subscriptionsExpireWeek",
    active: "subscriptionsActive", total: "subscriptionsTotal",
  };
  for (const [key, id] of Object.entries(metricIds)) {
    const value = ["expired", "expiringSoon"].includes(key) || details ? health[key] : null;
    document.getElementById(id).textContent = value == null ? "—" : NUMBER_FORMAT.format(value);
    const cell = grid.querySelector(`[data-metric="${key}"]`);
    if (cell) cell.dataset.tone = value > 0 ? (key === "expired" ? "expired" : "warning") : "";
  }
  summary.textContent = `Истекли: ${NUMBER_FORMAT.format(health.expired)} · за 3 дня: ${NUMBER_FORMAT.format(health.expiringSoon)}${stale ? " · прошлый расчёт" : failed ? " · сохранённые данные" : ""}`;
  const messages = [
    `Расчёт на ${displayDate(health.calculatedOn)} (Москва).`,
    "Периоды 3 и 7 дней включают сегодня; последний день действия ещё не считается истечением. Продления учтены в таблице.",
  ];
  if (stale) messages.push("Дата расчёта в таблице устарела. Обновите её, чтобы увидеть актуальные сроки.");
  else if (!details) messages.push("Дополнительные показатели пока недоступны.");
  if (loading) messages.push("Обновляем данные…");
  else if (failed) messages.push("Не удалось обновить данные; показан последний сохранённый расчёт.");
  note.textContent = messages.join(" ");
}
