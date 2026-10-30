import test from "node:test";
import assert from "node:assert/strict";
import { buildSubscriptionHealth, moscowDate, parseCalendarDate, parseSubscriptionSummary } from "../public/js/subscriptions.js";

// Exact summary layout of the updated sheet, with no member data.
function summaryRows({ expired = "0", expiringSoon = "5", listed = "5", date = "30.10.2026" } = {}) {
  return [
    ["СРОКИ АБОНЕМЕНТОВ", "", "", "", "", ""],
    ["Истёкшие и действующие абонементы, которым осталось 1–3 дня, включая сегодня.", "", "", "", "", ""],
    ["Дата расчёта · Москва", date, "", "Истекли", expired, ""],
    ["Истекают в течение 3 дней", expiringSoon, "", "Всего в списке", listed, ""],
  ];
}

const VIEW_HEADER = ["Начало", "Оплачено, ₽", "Источник", "Действует по", "Осталось дней", "Статус"];
const NOW = new Date("2026-10-30T09:00:00Z");
function membership(end, start = "01.10.2026", staleDays = "999", staleStatus = "") {
  return [start, "", "", end, staleDays, staleStatus];
}

test("reads the updated source summary and preserves an authoritative zero", () => {
  assert.deepEqual(parseSubscriptionSummary(summaryRows()), {
    available: true, expired: 0, expiringSoon: 5, listed: 5, calculatedOn: "2026-10-30", reason: null,
  });
  const empty = parseSubscriptionSummary(summaryRows({ expiringSoon: 0, listed: 0 }));
  assert.equal(empty.available, true);
  assert.equal(empty.listed, 0);
});

test("strict dates reject rollover, ambiguous text and invalid leap days", () => {
  assert.equal(parseCalendarDate("29.02.2028"), "2028-02-29");
  assert.equal(parseCalendarDate("2026-10-30"), "2026-10-30");
  assert.equal(parseCalendarDate(" 1.2.2026 "), "2026-02-01");
  for (const value of ["29.02.2026", "31.04.2026", "30.13.2026", "2026-02-30", "today", "30/10/26", "date 30.10.2026", "2026-10-30T00:00:00Z"]) {
    assert.equal(parseCalendarDate(value), "", value);
  }
});

test("missing, malformed and inconsistent summaries are unavailable, never false zeros", () => {
  assert.equal(parseSubscriptionSummary(null).reason, "missing");
  assert.equal(parseSubscriptionSummary(summaryRows().slice(0, 3)).reason, "missing");
  for (const invalid of ["", "#REF!", "-1", "1.2", "5 clients", Number.MAX_SAFE_INTEGER + 1]) {
    const result = parseSubscriptionSummary(summaryRows({ expired: invalid }));
    assert.equal(result.available, false);
    assert.equal(result.expired, null);
  }
  assert.equal(parseSubscriptionSummary(summaryRows({ date: "31.02.2026" })).reason, "invalid");
  assert.equal(parseSubscriptionSummary(summaryRows({ listed: 82 })).reason, "inconsistent");
  assert.equal(parseSubscriptionSummary([...summaryRows(), ["Истекли", "1"]]).reason, "inconsistent");
});

test("Moscow day changes at 21:00 UTC regardless of the computer timezone", () => {
  assert.equal(moscowDate(new Date("2026-10-29T20:59:59Z")), "2026-10-29");
  assert.equal(moscowDate(new Date("2026-10-29T21:00:00Z")), "2026-10-30");
  assert.equal(moscowDate(new Date("2026-12-31T21:00:00Z")), "2027-01-01");
  assert.equal(moscowDate(new Date("invalid")), "");
});

test("expiry today is active and inclusive 3/7-day windows use real dates", () => {
  const rows = [VIEW_HEADER,
    membership("29.10.2026"),
    membership("30.10.2026"),
    membership("31.10.2026"),
    membership("01.11.2026"),
    membership("02.11.2026"),
    membership("05.11.2026"),
    membership("06.11.2026"),
    membership("01.12.2026", "01.11.2026"),
    ["", "", "", "", "", ""],
  ];
  const result = buildSubscriptionHealth(summaryRows({ expired: 1, expiringSoon: 3, listed: 4 }), rows, NOW);
  assert.equal(result.detailsAvailable, true);
  assert.equal(result.active, 6);
  assert.equal(result.expired, 1);
  assert.equal(result.expiresToday, 1);
  assert.equal(result.expiringWeek, 5);
  assert.equal(result.total, 8);
  assert.equal(result.unknownDates, 0);
});

test("stale or disagreeing sheet snapshots retain source counts and withhold extra counts", () => {
  const stale = buildSubscriptionHealth(summaryRows({ date: "29.10.2026" }), [VIEW_HEADER], NOW);
  assert.equal(stale.available, true);
  assert.equal(stale.detailsReason, "stale");
  assert.equal(stale.expiringSoon, 5);
  assert.equal(stale.active, null);
  const mismatch = buildSubscriptionHealth(summaryRows(), [VIEW_HEADER, membership("30.10.2026")], NOW);
  assert.equal(mismatch.detailsReason, "mismatch");
  assert.equal(mismatch.expiringSoon, 5);
  assert.equal(mismatch.expiresToday, null);
});

test("missing views and invalid member dates cannot become believable totals", () => {
  assert.equal(buildSubscriptionHealth(summaryRows(), [], NOW).detailsReason, "missing_view");
  const invalid = buildSubscriptionHealth(summaryRows(), [VIEW_HEADER, membership("31.02.2026")], NOW);
  assert.equal(invalid.detailsReason, "invalid_dates");
  assert.equal(invalid.unknownDates, 1);
  assert.equal(invalid.total, null);
  assert.equal(buildSubscriptionHealth([], [VIEW_HEADER], NOW).detailsReason, "summary_unavailable");
});

test("an empty valid view can represent a genuine zero watchlist", () => {
  const result = buildSubscriptionHealth(summaryRows({ expiringSoon: 0, listed: 0 }), [VIEW_HEADER], NOW);
  assert.equal(result.detailsAvailable, true);
  assert.equal(result.total, 0);
  assert.equal(result.active, 0);
});

test("outputs contain aggregate fields only and ignore the source status/day formulas", () => {
  const rows = [VIEW_HEADER, membership("31.10.2026", "01.10.2026", "-100", "PRIVATE_FIXTURE_VALUE")];
  const result = buildSubscriptionHealth(summaryRows({ expiringSoon: 1, listed: 1 }), rows, NOW);
  assert.equal(result.detailsAvailable, true);
  assert.equal(result.active, 1);
  assert.equal(JSON.stringify(result).includes("PRIVATE_FIXTURE_VALUE"), false);
  assert.equal(Object.values(result).some(Array.isArray), false);
});
