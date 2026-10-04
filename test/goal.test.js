import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionGoalState } from "../public/js/goal.js";

function state(before, today = 0, date = "2026-10-22", future = 0) {
  return subscriptionGoalState({ activePeriod: "2026-10", dailyRecords: [
    { date: "2026-10-01", goalSubscriptionsCount: before },
    { date, goalSubscriptionsCount: today },
    { date: "2026-10-31", goalSubscriptionsCount: future },
  ] }, date);
}

test("10 subscriptions in 10 days: missed target carries into tomorrow", () => {
  const result = state(90);
  assert.equal(result.daysLeft, 10);
  assert.equal(result.todayTarget, 1);
  assert.equal(result.todayShortfall, 1);
  assert.equal(result.tomorrowTarget, 2);
});

test("today's sales reduce shortfall and tomorrow's target, not today's target", () => {
  const result = state(90, 1);
  assert.equal(result.todayTarget, 1);
  assert.equal(result.todayShortfall, 0);
  assert.equal(result.tomorrowTarget, 1);
  assert.equal(state(90, 10).tomorrowTarget, 0);
});

test("future rows cannot reduce daily targets", () => {
  assert.equal(state(90, 0, "2026-10-22", 10).todayTarget, 1);
  assert.equal(state(90, 0, "2026-10-22", 10).tomorrowTarget, 2);
});

test("last day requires all remaining subscriptions and has no tomorrow target", () => {
  const result = state(90, 3, "2026-10-31");
  assert.equal(result.todayTarget, 10);
  assert.equal(result.todayShortfall, 7);
  assert.equal(result.tomorrowTarget, null);
});

test("completed goals and other months", () => {
  assert.equal(state(105).todayTarget, 0);
  assert.equal(state(105).todayShortfall, 0);
  const archived = subscriptionGoalState({ activePeriod: "2026-09", records: [] }, "2026-10-04");
  assert.equal(archived.isCurrentMonth, false);
  assert.equal(archived.todayTarget, null);
  assert.equal(archived.tomorrowTarget, null);
});

test("leap February uses 29 calendar days and fallback membership counts", () => {
  const result = subscriptionGoalState({ records: [
    { date: "2028-02-01", membershipsCount: 90 },
  ] }, "2028-02-20");
  assert.equal(result.daysLeft, 10);
  assert.equal(result.todayTarget, 1);
  assert.equal(result.tomorrowTarget, 2);
});
