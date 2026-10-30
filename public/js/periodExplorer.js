import { buildPeriodReport, periodReportCsv } from "./periodReport.js";
import { moscowDate, parseCalendarDate } from "./subscriptions.js";
import { MONEY_FORMAT, NUMBER_FORMAT } from "./config.js";

const METRICS = { income: "Приход", expense: "Расходы", profit: "Прибыль", subscriptions: "Абонементы" };
const state = { model: null, meta: {}, preset: "month", metric: "income", range: null, showDays: false, showRange: false, report: null, bound: false };
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const fullDate = (date) => date.split("-").reverse().join(".");
const shortDate = (date) => `${date.slice(8)}.${date.slice(5, 7)}`;
const format = (key, value) => value == null ? "—" : key === "subscriptions" ? NUMBER_FORMAT.format(value) : MONEY_FORMAT.format(value);

function shiftDate(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function presetRange(model, preset) {
  const today = moscowDate();
  const month = model.activePeriod || model.period?.start?.slice(0, 7) || today.slice(0, 7);
  const first = parseCalendarDate(`${month}-01`) || `${today.slice(0, 7)}-01`;
  const date = new Date(`${first}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  const monthEnd = date.toISOString().slice(0, 10);
  const to = monthEnd < today ? monthEnd : today;
  return { from: preset === "month" ? first : shiftDate(to, 1 - Number(preset)), to };
}

function changeMarkup(key, change) {
  if (!change) return "";
  const sign = change.absolute > 0 ? "+" : "";
  const good = key === "expense" ? change.absolute < 0 : change.absolute > 0;
  const tone = change.absolute === 0 ? "" : good ? "positive" : "negative";
  const percent = change.absolute === 0 ? "без изменений" : change.percent == null ? "с нуля" : `${change.percent > 0 ? "+" : ""}${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(change.percent)}%`;
  return `<small class="delta ${tone}">${escape(`${sign}${format(key, change.absolute)} · ${percent}`)}</small>`;
}

function niceStep(value) {
  const base = 10 ** Math.floor(Math.log10(value || 1));
  const ratio = value / base;
  return (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * base;
}

function chart(report, metric) {
  if (!report.totals) return '<div class="report-empty">За этот период нет дневных данных. Выберите другие даты.</div>';
  const values = report.days.filter((day) => day.available).map((day) => day[metric]);
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const step = metric === "subscriptions" ? Math.max(1, niceStep((high - low) / 4)) : niceStep((high - low) / 4);
  const bottom = Math.floor(low / step) * step;
  let top = Math.ceil(high / step) * step;
  if (top <= high) top += step;
  const width = Math.max(260, document.getElementById("periodReport").clientWidth - 50), height = 210, left = 62, right = 16, upper = 16, lower = 30;
  const plotWidth = width - left - right, plotHeight = height - upper - lower;
  const x = (index) => left + (index + .5) * plotWidth / report.days.length;
  const y = (value) => upper + (top - value) / (top - bottom) * plotHeight;
  const axisFormat = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
  let lines = "";
  for (let tick = bottom; tick <= top + step / 10; tick += step) {
    lines += `<line x1="${left}" x2="${width - right}" y1="${y(tick)}" y2="${y(tick)}" class="report-chart-grid${tick === 0 ? " report-zero-line" : ""}"/><text x="${left - 12}" y="${y(tick) + 4}" text-anchor="end">${escape(axisFormat.format(tick))}</text>`;
  }
  const tickStep = Math.max(1, Math.ceil((report.days.length - 1) / 5));
  const bars = report.days.map((day, index) => {
    let result = index % tickStep === 0 ? `<text x="${x(index)}" y="${height - 8}" text-anchor="middle">${shortDate(day.date)}</text>` : "";
    if (day.available) {
      const value = day[metric], barWidth = Math.max(.5, plotWidth / report.days.length * .7);
      result += `<rect class="report-bar" data-negative="${value < 0}" x="${x(index) - barWidth / 2}" y="${Math.min(y(value), y(0))}" width="${barWidth}" height="${Math.abs(y(value) - y(0))}"><title>${escape(`${fullDate(day.date)} · ${format(metric, value)}`)}</title></rect>`;
    }
    return result;
  }).join("");
  return `<svg class="report-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="periodChartTitle periodChartDescription"><title id="periodChartTitle">${METRICS[metric]} по дням${metric === "subscriptions" ? ", шт." : ", ₽"}</title><desc id="periodChartDescription">${escape(`С ${fullDate(report.from)} по ${fullDate(report.to)}. Пропуски не показаны как нули. Все числа доступны в таблице ниже.`)}</desc>${lines}${bars}</svg>`;
}

function finding(report, metric) {
  if (!report.totals) return "";
  if (metric === "income" && report.bestDay) return `Лучший день по приходу: ${fullDate(report.bestDay.date)} · ${format(metric, report.bestDay.income)}.`;
  return `В среднем за день с данными: ${format(metric, report.totals[metric] / report.coverage.available)}.`;
}

function render() {
  const host = document.getElementById("periodReport");
  state.showDays = host.querySelector(".report-days")?.open ?? state.showDays;
  state.showRange = host.querySelector(".report-custom-range")?.open ?? state.showRange;
  if (!state.range || state.preset !== "custom") state.range = presetRange(state.model, state.preset);
  const report = buildPeriodReport(state.model, state.range);
  state.report = report;
  const fetched = new Date(state.meta.fetchedAt || "");
  const freshness = Number.isFinite(fetched.getTime())
    ? `Обновлено ${new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(fetched)} (Москва).`
    : "Время обновления источника неизвестно.";
  const metricCells = Object.keys(METRICS).map((key) => `<div><dt>${METRICS[key]}</dt><dd>${escape(format(key, report.totals?.[key]))}</dd>${changeMarkup(key, report.changes[key])}</div>`).join("");
  const comparison = report.previous ? `Предыдущий период: ${fullDate(report.previous.from)}–${fullDate(report.previous.to)}. ${report.previous.coverage.available === report.previous.coverage.expected && report.coverage.available === report.coverage.expected ? "Изменения рассчитаны по двум полным периодам." : "Для сравнения нужны данные за каждый день обоих периодов."}` : "";
  host.innerHTML = `<div class="panel report-panel">
    <div class="report-heading"><div><h2 id="periodReportTitle">Отчёт за период</h2><p class="report-feedback">Выберите даты и посмотрите, как менялись показатели.</p></div><button type="button" class="feature-button" data-report-export ${report.totals ? "" : "disabled"}>Скачать CSV</button></div>
    <div class="feature-segments" role="group" aria-label="Быстрый выбор периода">${[["month", "Месяц"], ["7", "7 дней"], ["14", "14 дней"]].map(([value, label]) => `<button type="button" data-report-preset="${value}" aria-pressed="${state.preset === value}">${label}</button>`).join("")}</div>
    <details class="report-custom-range" ${state.showRange || state.preset === "custom" ? "open" : ""}><summary>Выбрать даты</summary><form class="report-range-form"><label>С даты<input type="date" name="from" value="${escape(state.range.from)}" max="${moscowDate()}" required></label><label>По дату<input type="date" name="to" value="${escape(state.range.to)}" max="${moscowDate()}" required></label><button type="submit" class="feature-button">Показать</button></form></details>
    ${report.valid ? `<p class="report-coverage">${fullDate(report.from)}–${fullDate(report.to)} · Дней с данными: ${report.coverage.available} из ${report.coverage.expected}${report.includesToday ? " · Сегодняшний день ещё не завершён" : ""}</p>
    <dl class="report-metrics">${metricCells}</dl>
    <figure class="report-chart-area"><div class="report-chart-heading"><h3>${METRICS[state.metric]} по дням${state.metric === "subscriptions" ? ", шт." : ", ₽"}</h3><div class="feature-segments" role="group" aria-label="Показатель графика">${Object.entries(METRICS).map(([key, label]) => `<button type="button" data-report-metric="${key}" aria-pressed="${state.metric === key}">${label}</button>`).join("")}</div></div><div class="report-chart-plot">${chart(report, state.metric)}</div><figcaption>${escape(finding(report, state.metric))}</figcaption></figure>
    <details class="report-days" ${state.showDays ? "open" : ""}><summary>Показать дни · ${report.days.length}</summary><div class="report-table-wrap"><table><caption>Дневные показатели за выбранный период</caption><thead><tr><th scope="col">Дата</th>${Object.values(METRICS).map((label) => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${report.days.map((day) => `<tr><th scope="row">${fullDate(day.date)}</th>${Object.keys(METRICS).map((key) => `<td>${escape(format(key, day[key]))}</td>`).join("")}</tr>`).join("")}</tbody><tfoot><tr><th scope="row">Итого</th>${Object.keys(METRICS).map((key) => `<td>${escape(format(key, report.totals?.[key]))}</td>`).join("")}</tr></tfoot></table></div></details>
    <div class="report-footer"><p class="report-coverage">${escape(comparison)}</p><p class="report-coverage">${state.model.sourceMode === "demo" ? "Демонстрационные данные." : "Google Таблица."} ${escape(freshness)} Пропуски обозначены «—»; будущие дни исключены.</p></div>`
      : '<p class="report-feedback" role="alert">Выберите правильный диапазон до сегодняшней даты, не длиннее 366 дней.</p>'}
    <p id="reportInteractionStatus" class="report-feedback" role="status" aria-live="polite"></p>
  </div>`;
}

function exportCsv() {
  if (!state.report?.totals) return;
  const url = URL.createObjectURL(new Blob([periodReportCsv(state.report)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `gf-fit-${state.report.from}-${state.report.to}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  document.getElementById("reportInteractionStatus").textContent = "CSV подготовлен: только даты и общие показатели.";
}

export function showPeriodReportError() {
  const host = document.getElementById("periodReport");
  if (state.model) {
    const status = document.getElementById("reportInteractionStatus");
    if (status) status.textContent = "Не удалось обновить отчёт. Показаны последние сохранённые показатели.";
  } else {
    host.innerHTML = '<div class="panel report-panel"><h2 id="periodReportTitle">Отчёт за период</h2><p class="report-feedback" role="status">Не удалось загрузить дневные показатели.</p><button type="button" class="feature-button" data-action="refresh">Повторить загрузку</button></div>';
  }
}

export function renderPeriodExplorer(model, meta = {}, layout = "v1") {
  state.model = model;
  state.meta = meta;
  const host = document.getElementById("periodReport");
  host.dataset.layout = layout;
  if (!state.bound) {
    let resizeFrame;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const plot = host.querySelector(".report-chart-plot");
        if (plot && state.report?.valid) plot.innerHTML = chart(state.report, state.metric);
      });
    });
    host.addEventListener("click", (event) => {
      const preset = event.target.closest("[data-report-preset]");
      const metric = event.target.closest("[data-report-metric]");
      if (preset) state.preset = preset.dataset.reportPreset;
      else if (metric) state.metric = metric.dataset.reportMetric;
      else if (event.target.closest("[data-report-export]")) { exportCsv(); return; }
      else return;
      const selector = preset ? `[data-report-preset="${state.preset}"]` : `[data-report-metric="${state.metric}"]`;
      render();
      host.querySelector(selector)?.focus({ preventScroll: true });
    });
    host.addEventListener("submit", (event) => {
      if (!event.target.matches(".report-range-form")) return;
      event.preventDefault();
      state.range = { from: event.target.elements.from.value, to: event.target.elements.to.value };
      state.preset = "custom";
      render();
      host.querySelector('[type="submit"]')?.focus({ preventScroll: true });
    });
    state.bound = true;
  }
  render();
}
