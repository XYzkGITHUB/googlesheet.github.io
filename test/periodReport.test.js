import test from "node:test";
import assert from "node:assert/strict";
import { buildPeriodReport, periodReportCsv } from "../public/js/periodReport.js";

const NOW = new Date("2026-10-30T12:00:00Z");
function record(date, income = 100, expense = 20, subscriptions = 1, extra = {}) {
  return { date, totalIncome: income, totalExpense: expense, membershipsCount: subscriptions, ...extra };
}

test("daily records replace duplicate monthly rows and future prefilled days do not count", () => {
  const model = {
    records: [record("2026-10-29", 100), record("2026-10-29", 200), record("2026-10-30", 100), record("2026-10-31", 9000)],
    dailyRecords: [record("2026-10-29", 300, 50, 2), record("2026-10-30", 400, 60, 3)],
  };
  const report = buildPeriodReport(model, { from: "2026-10-29", to: "2026-10-31" }, NOW);
  assert.equal(report.valid, true);
  assert.equal(report.to, "2026-10-30");
  assert.equal(report.clampedToToday, true);
  assert.equal(report.includesToday, true);
  assert.deepEqual(report.coverage, { available: 2, expected: 2 });
  assert.deepEqual(report.totals, { income: 700, expense: 110, profit: 590, subscriptions: 5 });
  assert.equal(report.bestDay.date, "2026-10-30");
});

test("real zero days remain available while missing or malformed days stay null", () => {
  const report = buildPeriodReport({ records: [
    record("2026-10-25", 0, 0, 0),
    record("2026-10-27", NaN),
    record("2026-10-28", 50, 10, -1),
    record("2026-10-29", 50, undefined, 1, { totalExpense: undefined }),
  ] }, { from: "2026-10-25", to: "2026-10-29" }, NOW);
  assert.deepEqual(report.coverage, { available: 1, expected: 5 });
  assert.deepEqual(report.days[0], { date: "2026-10-25", available: true, income: 0, expense: 0, profit: 0, subscriptions: 0 });
  for (const day of report.days.slice(1)) {
    assert.equal(day.available, false);
    assert.equal(day.income, null);
    assert.equal(day.subscriptions, null);
  }
  assert.deepEqual(report.totals, { income: 0, expense: 0, profit: 0, subscriptions: 0 });
  assert.equal(buildPeriodReport({}, { from: "2026-10-25", to: "2026-10-26" }, NOW).totals, null);
});

test("complete equal calendar windows compare revenue, costs, profit and counts", () => {
  const model = { records: [
    record("2026-10-25", 100, 50, 1), record("2026-10-26", 100, 50, 1),
    record("2026-10-27", 150, 40, 2), record("2026-10-28", 150, 40, 2),
  ] };
  const report = buildPeriodReport(model, { from: "2026-10-27", to: "2026-10-28" }, NOW);
  assert.deepEqual(report.previous, {
    from: "2026-10-25", to: "2026-10-26", coverage: { available: 2, expected: 2 },
    totals: { income: 200, expense: 100, profit: 100, subscriptions: 2 },
  });
  assert.deepEqual(report.changes.income, { absolute: 100, percent: 50 });
  assert.deepEqual(report.changes.expense, { absolute: -20, percent: -20 });
  assert.deepEqual(report.changes.profit, { absolute: 120, percent: 120 });
  assert.deepEqual(report.changes.subscriptions, { absolute: 2, percent: 100 });
  assert.equal(report.bestDay.date, "2026-10-27");
});

test("incomplete previous/current windows withhold deltas instead of inventing zeros", () => {
  for (const records of [
    [record("2026-10-26"), record("2026-10-27"), record("2026-10-28")],
    [record("2026-10-25"), record("2026-10-26"), record("2026-10-28")],
  ]) {
    const report = buildPeriodReport({ records }, { from: "2026-10-27", to: "2026-10-28" }, NOW);
    assert.deepEqual(report.changes, { income: null, expense: null, profit: null, subscriptions: null });
  }
});

test("zero baselines have absolute changes without percentages; negative profits remain signed", () => {
  const model = { records: [record("2026-10-29", 0, 100, 0), record("2026-10-30", 50, 20, 1)] };
  const report = buildPeriodReport(model, { from: "2026-10-30", to: "2026-10-30" }, NOW);
  assert.deepEqual(report.changes.income, { absolute: 50, percent: null });
  assert.deepEqual(report.changes.profit, { absolute: 130, percent: 130 });
  assert.equal(report.previous.totals.profit, -100);
  const refunds = buildPeriodReport({ records: [record("2026-10-29", -50, -10, 0)] }, { from: "2026-10-29", to: "2026-10-29" }, NOW);
  assert.equal(refunds.totals.profit, -40);
});

test("strict ranges reject rollover, non-ISO, reversed, future and overlong input", () => {
  for (const range of [
    { from: "2026-02-30", to: "2026-03-01" },
    { from: "29.10.2026", to: "30.10.2026" },
    { from: "2026-10-30", to: "2026-10-29" },
    { from: "2026-10-31", to: "2026-11-01" },
    { from: "2024-01-01", to: "2026-10-30" },
    {},
  ]) {
    const report = buildPeriodReport({}, range, NOW);
    assert.equal(report.valid, false);
    assert.equal(report.reason, "invalid_range");
    assert.equal(report.totals, null);
    assert.equal(periodReportCsv(report), "");
  }
});

test("calendar arithmetic crosses leap days, month ends and the year boundary", () => {
  const leap = buildPeriodReport({}, { from: "2028-02-28", to: "2028-03-01" }, new Date("2028-03-02T10:00:00Z"));
  assert.deepEqual(leap.days.map((day) => day.date), ["2028-02-28", "2028-02-29", "2028-03-01"]);
  assert.equal(leap.previous.from, "2028-02-25");
  assert.equal(leap.previous.to, "2028-02-27");
  const year = buildPeriodReport({}, { from: "2027-01-01", to: "2027-01-02" }, new Date("2027-01-02T10:00:00Z"));
  assert.equal(year.previous.from, "2026-12-30");
  assert.equal(year.previous.to, "2026-12-31");
  const fullLeapYear = buildPeriodReport({}, { from: "2028-01-01", to: "2028-12-31" }, new Date("2029-01-02T10:00:00Z"));
  assert.equal(fullLeapYear.coverage.expected, 366);
});

test("Moscow midnight controls the latest included day regardless of computer timezone", () => {
  const model = { records: [record("2026-10-29", 100), record("2026-10-30", 200)] };
  const range = { from: "2026-10-29", to: "2026-10-30" };
  const before = buildPeriodReport(model, range, new Date("2026-10-29T20:59:59Z"));
  const after = buildPeriodReport(model, range, new Date("2026-10-29T21:00:00Z"));
  assert.equal(before.to, "2026-10-29");
  assert.equal(before.totals.income, 100);
  assert.equal(after.to, "2026-10-30");
  assert.equal(after.totals.income, 300);
});

test("count precedence uses goalSubscriptionsCount and CSV exposes only dates and aggregates", () => {
  const model = { records: [record("2026-10-29", 100, 20, 1, {
    goalSubscriptionsCount: 3, sourceText: "PRIVATE_FIXTURE_VALUE", identity: "PRIVATE_FIXTURE_VALUE",
  }), record("not-a-date", 500), record("30.10.2026", 500)] };
  const report = buildPeriodReport(model, { from: "2026-10-29", to: "2026-10-30" }, NOW);
  assert.equal(report.totals.subscriptions, 3);
  const csv = periodReportCsv(report);
  assert.ok(csv.startsWith("\uFEFFДата;"));
  assert.ok(csv.includes("2026-10-29;100;20;80;3\r\n"));
  assert.ok(csv.includes("2026-10-30;;;;\r\n"));
  assert.equal(JSON.stringify(report).includes("PRIVATE_FIXTURE_VALUE"), false);
  assert.equal(csv.includes("PRIVATE_FIXTURE_VALUE"), false);
  assert.equal(csv.includes("not-a-date"), false);
});
