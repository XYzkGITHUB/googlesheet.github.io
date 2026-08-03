const KEY = "gf-fit-prefs-v1";

export const LAYOUTS = [
  { id: "v1", name: "Классика", note: "Исходный вид. Плотная сетка карточек." },
  { id: "v2", name: "Просто", note: "Крупно и понятно. Только главное." },
  { id: "v3", name: "Максимум", note: "Все данные, графики и прогнозы." },
];

export const THEMES = [
  { id: "auto", name: "Авто", dot: "linear-gradient(135deg,#f7f7f8 50%,#15171c 50%)" },
  { id: "light", name: "Светлая", dot: "linear-gradient(135deg,#ffffff,#e7e9ee)" },
  { id: "mint", name: "Мята", dot: "linear-gradient(135deg,#f2f7f4,#8fd9bb)" },
  { id: "dark", name: "Темная", dot: "linear-gradient(135deg,#2a2d35,#15171c)" },
  { id: "ocean", name: "Океан", dot: "linear-gradient(135deg,#0e3d4d,#22b8cf)" },
];

// v1 + light is the original look — the default must stay byte-identical to
// what shipped before. "auto" is opt-in only.
const DEFAULTS = { layout: "v1", theme: "light" };

export function readPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const layout = LAYOUTS.some((item) => item.id === parsed.layout) ? parsed.layout : DEFAULTS.layout;
    const theme = THEMES.some((item) => item.id === parsed.theme) ? parsed.theme : DEFAULTS.theme;
    return { layout, theme };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // preferences are a convenience; ignore storage failures
  }
}

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function resolveTheme(theme) {
  if (theme !== "auto") return theme;
  return systemDark.matches ? "dark" : "light";
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = resolveTheme(theme);
  document.documentElement.dataset.themeChoice = theme;
}

export function watchSystemTheme(onChange) {
  systemDark.addEventListener("change", () => {
    if (readPrefs().theme === "auto") onChange();
  });
}
