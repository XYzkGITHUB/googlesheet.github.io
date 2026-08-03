import { MONEY_FORMAT, NUMBER_FORMAT } from "./config.js";

export function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const formatters = {
  money: (value) => MONEY_FORMAT.format(Math.round(value)),
  number: (value) => NUMBER_FORMAT.format(Math.round(value)),
  percent: (value) => `${Math.round(value)}%`,
  signed: (value) => `${value > 0 ? "+" : ""}${MONEY_FORMAT.format(Math.round(value))}`,
};

// Elements opt in with data-count="1234" data-format="money|number|percent|signed".
export function hydrateCounters(root, { duration = 850 } = {}) {
  const targets = root.querySelectorAll("[data-count]");
  const instant = reducedMotion();

  for (const el of targets) {
    const to = Number(el.dataset.count) || 0;
    const format = formatters[el.dataset.format] || formatters.number;
    if (instant || Math.abs(to) < 2) {
      el.textContent = format(to);
      continue;
    }

    const start = performance.now();
    const from = 0;
    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = format(from + (to - from) * eased);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// Staggered entrance for anything marked [data-reveal].
export function hydrateReveal(root) {
  const items = root.querySelectorAll("[data-reveal]");
  items.forEach((el, index) => {
    el.style.setProperty("--reveal-i", String(index));
    el.classList.add("is-revealed");
  });
}

let tickers = [];

export function setTicker(fn, ms) {
  fn();
  const id = setInterval(fn, ms);
  tickers.push(id);
  return id;
}

export function clearTickers() {
  for (const id of tickers) clearInterval(id);
  tickers = [];
}
