import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadSubscriptionHealth, readSubscriptionHealthCache } from "../public/js/subscriptionHealth.js";
import { moscowDate } from "../public/js/subscriptions.js";

const originalFetch = globalThis.fetch;
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const CACHE_KEY = "gf-fit-subscription-health-v1";
let storage;

beforeEach(() => {
  storage = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  } });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
  else delete globalThis.localStorage;
});

function summaryCsv() {
  const date = moscowDate().split("-").reverse().join(".");
  return `СРОКИ АБОНЕМЕНТОВ\n\nДата расчёта · Москва,${date},,Истекли,0\nИстекают в течение 3 дней,0,,Всего в списке,0`;
}

test("network reads are limited to anonymous ranges; only aggregates enter storage", async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ range: url.searchParams.get("range"), gid: url.searchParams.get("gid"), cache: options.cache });
    return new Response(url.searchParams.get("range") === "A1:F4" ? summaryCsv() : "Начало,Оплачено,Источник,Действует по,Осталось дней,Статус");
  };
  const health = await loadSubscriptionHealth();
  assert.equal(health.available, true);
  assert.equal(health.active, 0);
  assert.deepEqual(requests.map((item) => item.range).sort(), ["A1:F4", "D4:I"]);
  assert.equal(requests.every((item) => item.cache === "no-store"), true);
  const cached = readSubscriptionHealthCache();
  assert.equal(cached.expired, 0);
  assert.equal(cached.total, 0);
  assert.equal(Object.entries(cached).every(([key, value]) => key === "calculatedOn" || key === "expiryByDate" || typeof value === "boolean" || typeof value === "number" || value === null), true);
  assert.equal(cached.expiryByDate.length, 30);
  assert.equal(cached.expiryByDate.every((day) => Object.keys(day).join(",") === "date,count" && day.count === 0), true);
});

test("failure of optional view keeps valid source summary without inventing details", async () => {
  globalThis.fetch = async (url) => {
    if (url.searchParams.get("range") !== "A1:F4") throw new Error("Offline");
    return new Response(summaryCsv());
  };
  const health = await loadSubscriptionHealth();
  assert.equal(health.available, true);
  assert.equal(health.expired, 0);
  assert.equal(health.detailsAvailable, false);
  assert.equal(health.active, null);
});

test("HTML sign-in responses and failed summary requests preserve last good cache", async () => {
  storage.set(CACHE_KEY, "previous snapshot");
  globalThis.fetch = async () => new Response("<!doctype html><html>Sign in</html>");
  await assert.rejects(loadSubscriptionHealth());
  assert.equal(storage.get(CACHE_KEY), "previous snapshot");
  globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
  await assert.rejects(loadSubscriptionHealth());
  assert.equal(storage.get(CACHE_KEY), "previous snapshot");
});

test("invalid summaries remove an obsolete cache instead of showing false zeros", async () => {
  storage.set(CACHE_KEY, "previous snapshot");
  globalThis.fetch = async () => new Response("#REF!");
  assert.equal((await loadSubscriptionHealth()).available, false);
  assert.equal(storage.has(CACHE_KEY), false);
});

test("cached data validates dates, count consistency and an explicit field allowlist", () => {
  const valid = { available: true, expired: 0, expiringSoon: 5, listed: 5, calculatedOn: "2026-10-30", rawSource: "PRIVATE_FIXTURE_VALUE" };
  storage.set(CACHE_KEY, JSON.stringify(valid));
  assert.equal(JSON.stringify(readSubscriptionHealthCache()).includes("PRIVATE_FIXTURE_VALUE"), false);
  for (const invalid of [{ calculatedOn: "2026-02-31" }, { expired: -1 }, { listed: 82 }, { expiringSoon: "5" }]) {
    storage.set(CACHE_KEY, JSON.stringify({ ...valid, ...invalid }));
    assert.equal(readSubscriptionHealthCache(), null);
  }
});

test("expiry cache stores only reconciled calendar buckets and strips source properties", () => {
  const calculatedOn = "2026-10-30";
  const expiryByDate = Array.from({ length: 30 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 9, 30 + index)).toISOString().slice(0, 10), count: index === 1 ? 5 : 0,
    rawSource: "PRIVATE_FIXTURE_VALUE",
  }));
  const valid = { available: true, detailsAvailable: true, calculatedOn, expired: 0, expiringSoon: 5, listed: 5,
    active: 8, expiresToday: 0, expiringWeek: 5, total: 8, unknownDates: 0, futureStarts: 0, expiryByDate };
  storage.set(CACHE_KEY, JSON.stringify(valid));
  const cache = readSubscriptionHealthCache();
  assert.equal(cache.expiryByDate.length, 30);
  assert.equal(JSON.stringify(cache).includes("PRIVATE_FIXTURE_VALUE"), false);
  for (const invalid of [expiryByDate.slice(1), expiryByDate.map((day, index) => index === 1 ? { ...day, count: 6 } : day),
    expiryByDate.map((day, index) => index === 1 ? { ...day, date: calculatedOn } : day)]) {
    storage.set(CACHE_KEY, JSON.stringify({ ...valid, expiryByDate: invalid }));
    assert.equal(readSubscriptionHealthCache().expiryByDate, null);
  }
});
