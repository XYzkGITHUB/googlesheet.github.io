const MOSCOW_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function label(value) {
  return text(value).toLowerCase().replace(/ё/g, "е");
}

/** Strict calendar dates only: no Date.parse rollover or browser locale guesses. */
export function parseCalendarDate(value) {
  const valueText = text(value);
  const iso = valueText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dmy = valueText.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})$/);
  if (!iso && !dmy) return "";
  const [year, month, day] = (iso ? [iso[1], iso[2], iso[3]] : [dmy[3], dmy[2], dmy[1]]).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function moscowDate(now = new Date()) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(MOSCOW_DATE_FORMAT.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseCount(value) {
  if (typeof value !== "number" && !/^\d+$/.test(text(value))) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function unavailable(reason) {
  return { available: false, expired: null, expiringSoon: null, listed: null, calculatedOn: "", reason };
}

const SUMMARY_LABELS = {
  expired: /^истекли$/,
  expiringSoon: /^истекают в течение 3 дней$/,
  listed: /^всего в списке$/,
  calculatedOn: /^дата расчета(?:\s*[·•—:-]\s*москва)?$/,
};

/**
 * Read only the summary range A1:F4 of «Сроки абонементов».
 * `listed` is the expiry watchlist size, not the full membership count.
 */
export function parseSubscriptionSummary(rows) {
  if (!Array.isArray(rows)) return unavailable("missing");
  const values = new Map();
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (let index = 0; index < row.length; index += 1) {
      const key = Object.keys(SUMMARY_LABELS).find((name) => SUMMARY_LABELS[name].test(label(row[index])));
      if (!key) continue;
      const value = key === "calculatedOn" ? parseCalendarDate(row[index + 1]) : parseCount(row[index + 1]);
      if (value === null || value === "") return unavailable("invalid");
      if (values.has(key) && values.get(key) !== value) return unavailable("inconsistent");
      values.set(key, value);
    }
  }
  if (Object.keys(SUMMARY_LABELS).some((key) => !values.has(key))) return unavailable("missing");
  const summary = Object.fromEntries(values);
  if (summary.listed !== summary.expired + summary.expiringSoon) return unavailable("inconsistent");
  return { available: true, ...summary, reason: null };
}

function calendarDay(iso) {
  return new Date(`${iso}T00:00:00.000Z`).getTime() / 86400000;
}

/**
 * Optional counts from the renewal-adjusted «Абонементы» view, range D4:I.
 * The range excludes identity columns and the separate search results panel.
 * Only anonymous counts leave this function; no member records are retained.
 */
export function buildSubscriptionHealth(summaryRows, membershipRows, now = new Date()) {
  const summary = parseSubscriptionSummary(summaryRows);
  const result = {
    ...summary,
    detailsAvailable: false,
    detailsReason: null,
    active: null,
    expiresToday: null,
    expiringWeek: null,
    total: null,
    unknownDates: null,
    expiryByDate: null,
    futureStarts: null,
  };
  if (!summary.available) return { ...result, detailsReason: "summary_unavailable" };
  const today = moscowDate(now);
  if (!today || summary.calculatedOn !== today) return { ...result, detailsReason: "stale" };
  if (!Array.isArray(membershipRows)) return { ...result, detailsReason: "missing_view" };
  const headerIndex = membershipRows.findIndex((row) => Array.isArray(row)
    && /^(начало|дата начала)$/.test(label(row[0]))
    && /^(действует по|дата окончания)$/.test(label(row[3])));
  if (headerIndex < 0) return { ...result, detailsReason: "missing_view" };

  let active = 0;
  let expired = 0;
  let expiresToday = 0;
  let expiringSoon = 0;
  let expiringWeek = 0;
  let total = 0;
  let unknownDates = 0;
  let futureStarts = 0;
  const todayDay = calendarDay(today);
  const expiryByDate = Array.from({ length: 30 }, (_, index) => ({
    date: new Date((todayDay + index) * 86400000).toISOString().slice(0, 10),
    count: 0,
  }));
  for (const row of membershipRows.slice(headerIndex + 1)) {
    if (!Array.isArray(row) || ![0, 3, 4, 5].some((index) => text(row[index]))) continue;
    total += 1;
    const start = parseCalendarDate(row[0]);
    const end = parseCalendarDate(row[3]);
    if (!start || !end || end < start) {
      unknownDates += 1;
      continue;
    }
    if (end < today) expired += 1;
    if (start > today) {
      futureStarts += 1;
      continue;
    }
    if (end < today) continue;
    active += 1;
    const daysLeft = calendarDay(end) - todayDay + 1;
    if (daysLeft === 1) expiresToday += 1;
    if (daysLeft <= 3) expiringSoon += 1;
    if (daysLeft <= 7) expiringWeek += 1;
    if (daysLeft <= expiryByDate.length) expiryByDate[daysLeft - 1].count += 1;
  }
  if (unknownDates) return { ...result, unknownDates, detailsReason: "invalid_dates" };
  if (expired !== summary.expired || expiringSoon !== summary.expiringSoon) {
    return { ...result, unknownDates: 0, detailsReason: "mismatch" };
  }
  return { ...result, detailsAvailable: true, active, expiresToday, expiringWeek, total, unknownDates: 0, expiryByDate, futureStarts };
}
