import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { LAYOUTS, THEMES, applyTheme, normalizePrefs, readPrefs, watchSystemTheme, writePrefs } from "../public/js/prefs.js";

const KEY = "gf-fit-prefs-v1";
const originals = Object.fromEntries(["localStorage", "window", "document"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let stored;
let dark;
let listeners;

beforeEach(() => {
  stored = new Map();
  dark = false;
  listeners = 0;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    matchMedia: () => ({ matches: dark, addEventListener: () => { listeners += 1; } }),
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: { dataset: {} } } });
});

afterEach(() => {
  for (const [key, descriptor] of Object.entries(originals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

test("only V1/V2 and White/Black are offered; V1 stays the default", () => {
  assert.deepEqual(LAYOUTS.map((item) => item.id), ["v1", "v2"]);
  assert.deepEqual(LAYOUTS.map((item) => item.name), ["V1", "V2"]);
  assert.deepEqual(THEMES.map((item) => item.id), ["light", "dark"]);
  assert.deepEqual(THEMES.map((item) => item.name), ["Белая", "Чёрная"]);
  assert.deepEqual(normalizePrefs({}), { layout: "v1", theme: "light" });
  assert.deepEqual(readPrefs(), { layout: "v1", theme: "light" });
});

test("legacy choices migrate while known V1/V2 selections stay intact", () => {
  assert.deepEqual(normalizePrefs({ layout: "v3", theme: "ocean" }), { layout: "v2", theme: "dark" });
  assert.deepEqual(normalizePrefs({ layout: "v1", theme: "mint" }), { layout: "v1", theme: "light" });
  assert.deepEqual(normalizePrefs({ layout: "v2", theme: "auto" }, true), { layout: "v2", theme: "dark" });
  assert.deepEqual(normalizePrefs({ layout: "v2", theme: "auto" }, false), { layout: "v2", theme: "light" });
  assert.deepEqual(normalizePrefs({ layout: "v2", theme: "dark" }), { layout: "v2", theme: "dark" });
});

test("former automatic theme resolves once and never follows later system changes", () => {
  stored.set(KEY, JSON.stringify({ layout: "v1", theme: "auto" }));
  dark = true;
  assert.deepEqual(readPrefs(), { layout: "v1", theme: "dark" });
  dark = false;
  assert.deepEqual(readPrefs(), { layout: "v1", theme: "dark" });
  assert.deepEqual(JSON.parse(stored.get(KEY)), { layout: "v1", theme: "dark" });
  watchSystemTheme(() => assert.fail("Explicit theme must not subscribe to system changes"));
  assert.equal(listeners, 0);
});

test("malformed and unknown preferences safely return to V1/White", () => {
  for (const input of [null, [], "dark", { layout: "unknown", theme: "unknown" }]) {
    assert.deepEqual(normalizePrefs(input), { layout: "v1", theme: "light" });
  }
  stored.set(KEY, "invalid JSON");
  assert.deepEqual(readPrefs(), { layout: "v1", theme: "light" });
  assert.deepEqual(JSON.parse(stored.get(KEY)), { layout: "v1", theme: "light" });
});

test("writes sanitize choices and keep unrelated fields out of stored preferences", () => {
  assert.deepEqual(writePrefs({ layout: "v3", theme: "mint", extra: "not retained" }), { layout: "v2", theme: "light" });
  assert.deepEqual(JSON.parse(stored.get(KEY)), { layout: "v2", theme: "light" });
  applyTheme("ocean");
  assert.deepEqual(document.documentElement.dataset, { theme: "dark", themeChoice: "dark", layout: "v2" });
});

test("blocked storage does not prevent normalized preferences or theme application", () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("Blocked"); } });
  assert.deepEqual(readPrefs(), { layout: "v1", theme: "light" });
  assert.deepEqual(writePrefs({ layout: "v2", theme: "dark" }), { layout: "v2", theme: "dark" });
  applyTheme("dark");
  assert.deepEqual(document.documentElement.dataset, { theme: "dark", themeChoice: "dark", layout: "v1" });
});
