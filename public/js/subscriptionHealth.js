import { SHEET_SOURCE, NUMBER_FORMAT } from "./config.js";
import { parseCsv } from "./csv.js";
import { buildSubscriptionHealth, moscowDate, parseCalendarDate } from "./subscriptions.js";

const CACHE_KEY = "gf-fit-subscription-health-v1";
const COUNTS = ["expired", "expiringSoon", "listed", "active", "expiresToday", "expiringWeek", "total", "unknownDates", "futureStarts"];
let expiryWindow = 7;
let selectedExpiryDate = "";
let calendarHealth = null;
let calendarBound = false;

function safeExpiryBuckets(health) {
  if (!health.detailsAvailable || !Array.isArray(health.expiryByDate) || health.expiryByDate.length !== 30) return null;
  const start = new Date(`${health.calculatedOn}T00:00:00Z`).getTime();
  const days = [];
  for (const [index, bucket] of health.expiryByDate.entries()) {
    const expected = new Date(start + index * 86400000).toISOString().slice(0, 10);
    if (bucket?.date !== expected || !Number.isSafeInteger(bucket.count) || bucket.count < 0) return null;
    days.push({ date: expected, count: bucket.count });
  }
  const sum = (length) => days.slice(0, length).reduce((total, day) => total + day.count, 0);
  return days[0].count === health.expiresToday && sum(3) === health.expiringSoon && sum(7) === health.expiringWeek && sum(30) <= health.active ? days : null;
}

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
  result.expiryByDate = safeExpiryBuckets({ ...result, expiryByDate: health.expiryByDate });
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

function renderExpiryCalendar(health) {
  calendarHealth = health;
  const calendar = document.getElementById("expiryCalendar");
  const buckets = health?.available && health.calculatedOn === moscowDate() ? safeExpiryBuckets(health) : null;
  calendar.hidden = !buckets;
  const shortcut = document.getElementById("expiryShortcut");
  shortcut.disabled = !buckets;
  shortcut.textContent = buckets ? `Окончания за 7 дней: ${NUMBER_FORMAT.format(health.expiringWeek)}` : "Календарь пока недоступен";
  shortcut.onclick = () => {
    document.getElementById("subscriptionHealth").open = true;
    expiryWindow = 7;
    renderExpiryCalendar(calendarHealth);
    calendar.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  if (!buckets) return;
  if (!calendarBound) {
    calendar.addEventListener("click", (event) => {
      const windowButton = event.target.closest("[data-expiry-window]");
      const dayButton = event.target.closest("[data-expiry-date]");
      if (windowButton) expiryWindow = Number(windowButton.dataset.expiryWindow);
      else if (dayButton) selectedExpiryDate = dayButton.dataset.expiryDate;
      else return;
      renderExpiryCalendar(calendarHealth);
      if (dayButton) calendar.querySelector(`[data-expiry-date="${selectedExpiryDate}"]`)?.focus({ preventScroll: true });
    });
    calendarBound = true;
  }
  const days = buckets.slice(0, expiryWindow);
  const max = Math.max(0, ...days.map((day) => day.count));
  if (!days.some((day) => day.date === selectedExpiryDate)) selectedExpiryDate = (days.find((day) => day.count > 0) || days[0]).date;
  const total = days.reduce((sum, day) => sum + day.count, 0);
  document.getElementById("expiryCalendarRange").textContent = `${displayDate(days[0].date)}–${displayDate(days.at(-1).date)} · Окончаний: ${NUMBER_FORMAT.format(total)}`;
  for (const button of calendar.querySelectorAll("[data-expiry-window]")) button.setAttribute("aria-pressed", String(Number(button.dataset.expiryWindow) === expiryWindow));
  const fragment = document.createDocumentFragment();
  for (const day of days) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `expiry-day${day.date === health.calculatedOn ? " expiry-today" : ""}`;
    button.dataset.expiryDate = day.date;
    button.dataset.positive = String(day.count > 0);
    button.setAttribute("aria-pressed", String(day.date === selectedExpiryDate));
    button.setAttribute("aria-label", `${displayDate(day.date)} · Абонементов со сроком до этой даты: ${day.count}`);
    const label = document.createElement("span");
    label.className = "expiry-day-label";
    label.textContent = `${day.date.slice(8)}.${day.date.slice(5, 7)}`;
    const count = document.createElement("strong");
    count.className = "count";
    count.textContent = NUMBER_FORMAT.format(day.count);
    const bar = document.createElement("i");
    bar.setAttribute("aria-hidden", "true");
    bar.style.setProperty("--fill", `${max ? day.count / max * 100 : 0}%`);
    button.append(label, count, bar);
    fragment.appendChild(button);
  }
  document.getElementById("expiryDays").replaceChildren(fragment);
  const selected = days.find((day) => day.date === selectedExpiryDate);
  document.getElementById("expirySelection").textContent = `${displayDate(selected.date)} · Окончаний абонементов: ${NUMBER_FORMAT.format(selected.count)}.${health.futureStarts > 0 ? ` Ещё ${NUMBER_FORMAT.format(health.futureStarts)} абонементов начнут действовать позже.` : ""}`;
}

export function renderSubscriptionHealth(health, { loading = false, failed = false } = {}) {
  renderExpiryCalendar(health);
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
