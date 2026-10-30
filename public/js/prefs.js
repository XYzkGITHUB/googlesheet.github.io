const KEY = "gf-fit-prefs-v1";

export const LAYOUTS = [
  { id: "v1", name: "V1", note: "Привычный вид" },
  { id: "v2", name: "V2", note: "Новый дизайн · те же показатели" },
];

export const THEMES = [
  { id: "light", name: "Белая", dot: "#fff" },
  { id: "dark", name: "Чёрная", dot: "#111" },
];

// Keep the familiar layout and explicit light theme as the defaults.
const DEFAULTS = { layout: "v1", theme: "light" };

export function normalizePrefs(value, systemDark = false) {
  const prefs = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const layout = prefs.layout === "v3" ? "v2"
    : LAYOUTS.some((item) => item.id === prefs.layout) ? prefs.layout : DEFAULTS.layout;
  let theme = prefs.theme;
  if (theme === "mint") theme = "light";
  else if (theme === "ocean") theme = "dark";
  else if (theme === "auto") theme = systemDark ? "dark" : "light";
  if (!THEMES.some((item) => item.id === theme)) theme = DEFAULTS.theme;
  return { layout, theme };
}

function systemIsDark() {
  try { return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches === true; }
  catch { return false; }
}

export function readPrefs() {
  let raw;
  let parsed = {};
  try {
    raw = localStorage.getItem(KEY);
    parsed = raw ? JSON.parse(raw) : {};
  } catch { /* Unavailable or malformed storage falls back to the familiar view. */ }
  const prefs = normalizePrefs(parsed, systemIsDark());
  // Persist migration so a former system theme becomes one fixed choice.
  try { if (raw && raw !== JSON.stringify(prefs)) localStorage.setItem(KEY, JSON.stringify(prefs)); }
  catch { /* Preferences remain usable when storage is blocked. */ }
  return prefs;
}

export function writePrefs(prefs) {
  const normalized = normalizePrefs(prefs, systemIsDark());
  try {
    localStorage.setItem(KEY, JSON.stringify(normalized));
  } catch {
    // preferences are a convenience; ignore storage failures
  }
  return normalized;
}

export function applyTheme(theme) {
  const prefs = readPrefs();
  const selected = normalizePrefs({ ...prefs, theme }, systemIsDark());
  document.documentElement.dataset.theme = selected.theme;
  document.documentElement.dataset.themeChoice = selected.theme;
  document.documentElement.dataset.layout = prefs.layout;
}

// Compatibility for existing app imports: White/Black never follow system changes.
export function watchSystemTheme() {}
