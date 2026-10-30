import { moscowDate, parseCalendarDate } from "./subscriptions.js";

const DAY_MS = 86400000;
const METRICS = ["income", "expense", "profit", "subscriptions"];

function isoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && parseCalendarDate(value) === value ? value : "";
}

function dayNumber(iso) {
  return new Date(`${iso}T00:00:00.000Z`).getTime() / DAY_MS;
}

function dateAt(day) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function noChanges() {
  return Object.fromEntries(METRICS.map((key) => [key, null]));
}

function invalidRange() {
  return {
    valid: false, reason: "invalid_range", from: "", to: "", days: [],
    coverage: { available: 0, expected: 0 }, totals: null,
    previous: null, changes: noChanges(), bestDay: null,
    includesToday: false, clampedToToday: false,
  };
}

function anonymousValues(record) {
  const income = record?.totalIncome;
  const expense = record?.totalExpense;
  const subscriptions = record?.goalSubscriptionsCount ?? record?.membershipsCount;
  if (!Number.isFinite(income) || !Number.isFinite(expense)
    || !Number.isSafeInteger(subscriptions) || subscriptions < 0) return null;
  const profit = income - expense;
  if (!Number.isFinite(profit)) return null;
  return { income, expense, profit, subscriptions };
}

function collectDays(model, today) {
  const byDate = new Map();
  const records = Array.isArray(model?.records) ? model.records : [];
  const daily = Array.isArray(model?.dailyRecords) ? model.dailyRecords : [];
  // Daily data replaces a monthly row for the same date; neither is added twice.
  for (const record of [...records, ...daily]) {
    const date = isoDate(record?.date);
    if (date && date <= today) byDate.set(date, anonymousValues(record));
  }
  return byDate;
}

function summarize(byDate, first, last) {
  const days = Array.from({ length: last - first + 1 }, (_, index) => {
    const date = dateAt(first + index);
    const values = byDate.get(date);
    return { date, available: !!values, ...(values || { income: null, expense: null, profit: null, subscriptions: null }) };
  });
  const available = days.filter((day) => day.available);
  const coverage = { available: available.length, expected: days.length };
  const totals = available.length ? available.reduce((sum, day) => {
    for (const key of METRICS) sum[key] += day[key];
    return sum;
  }, { income: 0, expense: 0, profit: 0, subscriptions: 0 }) : null;
  return { from: dateAt(first), to: dateAt(last), days, coverage, totals };
}

/**
 * Calendar-based report from anonymous daily financial records.
 * Missing/invalid days stay null; a genuine zero remains a recorded zero.
 * Comparisons require complete coverage in both equal-length calendar windows.
 */
export function buildPeriodReport(model, { from, to } = {}, now = new Date()) {
  const start = isoDate(from);
  const requestedEnd = isoDate(to);
  const today = moscowDate(now);
  if (!start || !requestedEnd || !today || start > requestedEnd || start > today) return invalidRange();
  const first = dayNumber(start);
  if (dayNumber(requestedEnd) - first + 1 > 366) return invalidRange();
  const end = requestedEnd > today ? today : requestedEnd;
  const last = dayNumber(end);
  const span = last - first + 1;
  const byDate = collectDays(model, today);
  const current = summarize(byDate, first, last);
  const prior = summarize(byDate, first - span, first - 1);
  const complete = current.coverage.available === span && prior.coverage.available === span;
  const changes = complete ? Object.fromEntries(METRICS.map((key) => {
    const absolute = current.totals[key] - prior.totals[key];
    const baseline = prior.totals[key];
    return [key, { absolute, percent: baseline === 0 ? null : absolute / Math.abs(baseline) * 100 }];
  })) : noChanges();
  const bestDay = current.days.filter((day) => day.available)
    .reduce((best, day) => !best || day.income > best.income ? day : best, null);
  return {
    valid: true, reason: null, ...current,
    previous: { from: prior.from, to: prior.to, coverage: prior.coverage, totals: prior.totals },
    changes, bestDay, includesToday: end === today, clampedToToday: requestedEnd > today,
  };
}

/** UTF-8 CSV for Russian Excel: BOM, semicolon separator, and CRLF rows. */
export function periodReportCsv(report) {
  if (!report?.valid || !Array.isArray(report.days)) return "";
  const rows = [["Дата", "Приход, ₽", "Расходы, ₽", "Прибыль, ₽", "Абонементы, шт."]];
  for (const day of report.days) {
    if (!isoDate(day?.date)) continue;
    rows.push([day.date, ...METRICS.map((key) => day.available && Number.isFinite(day[key]) ? day[key] : "")]);
  }
  return `\uFEFF${rows.map((row) => row.join(";")).join("\r\n")}\r\n`;
}
