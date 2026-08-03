// Dependency-free chart primitives. Bars are CSS (cheap, animatable),
// trend lines are inline SVG with a stroke-draw animation.
import { MONEY_FORMAT } from "./config.js";

function money(value) {
  return MONEY_FORMAT.format(Math.round(value || 0));
}

export function barChart(items, { height = 150, valueLabels = true } = {}) {
  if (!items.length) return `<div class="chart-empty">Нет данных за период</div>`;
  const max = Math.max(...items.map((item) => item.value), 1);

  const columns = items.map((item, index) => {
    const ratio = Math.max(item.value / max, item.value > 0 ? 0.02 : 0);
    return `
      <div class="bar-col ${item.tone || ""}" style="--v:${ratio.toFixed(4)};--i:${index}" title="${item.label}: ${money(item.value)}">
        ${valueLabels ? `<span class="bar-val">${item.value ? money(item.value) : ""}</span>` : ""}
        <div class="bar-track"><div class="bar-fill"></div></div>
        <span class="bar-lbl">${item.label}</span>
      </div>
    `;
  }).join("");

  return `<div class="bars" style="--bar-h:${height}px">${columns}</div>`;
}

function buildPath(values, width, height, max, min) {
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((value, index) => {
    const x = index * stepX;
    const y = height - ((value - min) / span) * height;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export function trendChart(series, lines, { height = 190 } = {}) {
  if (series.length < 2) return `<div class="chart-empty">Нужно минимум два дня с данными</div>`;

  const width = 640;
  const padding = 8;
  const innerH = height - padding * 2;
  const allValues = lines.flatMap((line) => series.map((point) => point[line.key]));
  const max = Math.max(...allValues, 1);
  const min = Math.min(...allValues, 0);

  const paths = lines.map((line, index) => {
    const values = series.map((point) => point[line.key]);
    const d = buildPath(values, width, innerH, max, min);
    const areaD = `${d} L${width},${innerH} L0,${innerH} Z`;
    return `
      ${line.area ? `<path class="trend-area" d="${areaD}" fill="url(#trendFill${index})" transform="translate(0,${padding})"/>` : ""}
      <path class="trend-line" pathLength="1" d="${d}" stroke="${line.color}" style="--i:${index}" transform="translate(0,${padding})"/>
    `;
  }).join("");

  const gradients = lines.map((line, index) => `
    <linearGradient id="trendFill${index}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${line.color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${line.color}" stop-opacity="0"/>
    </linearGradient>
  `).join("");

  const legend = lines.map((line) => `
    <span class="legend-item"><i style="background:${line.color}"></i>${line.label}</span>
  `).join("");

  return `
    <div class="trend">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="График динамики">
        <defs>${gradients}</defs>
        ${paths}
      </svg>
      <div class="chart-legend">${legend}</div>
    </div>
  `;
}

export function ring(percent, { size = 132, stroke = 12, label = "", sub = "" } = {}) {
  const safe = Math.max(0, Math.min(100, percent || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safe / 100);

  return `
    <div class="ring" style="--ring-size:${size}px">
      <svg viewBox="0 0 ${size} ${size}">
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}"/>
        <circle class="ring-value" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}"
          stroke-dasharray="${circumference.toFixed(2)}" style="--offset:${offset.toFixed(2)};--dash:${circumference.toFixed(2)}"/>
      </svg>
      <div class="ring-center">
        <strong>${label}</strong>
        <span>${sub}</span>
      </div>
    </div>
  `;
}

export function shareBars(items, total, { labels = {} } = {}) {
  const entries = Object.entries(items).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="chart-empty">Нет данных</div>`;

  return entries.map(([key, value], index) => {
    const share = total ? (value / total) * 100 : 0;
    return `
      <div class="share-row" style="--i:${index}">
        <div class="share-head">
          <span>${labels[key] || key}</span>
          <strong>${money(value)}</strong>
        </div>
        <div class="share-track"><div class="share-fill" style="--w:${share.toFixed(2)}%"></div></div>
        <small>${share < 1 && share > 0 ? "<1" : Math.round(share)}% от итога</small>
      </div>
    `;
  }).join("");
}
