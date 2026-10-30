import { MONEY_FORMAT, NUMBER_FORMAT, SHEET_SOURCE } from "./config.js";
import { mergedDays } from "./metrics.js";
import { setTicker } from "./anim.js";
import { moscowDate, parseCalendarDate } from "./subscriptions.js";

const selectedDates = new Map();
const archiveStates = new WeakMap();
const incomeLabels = { memberships: "Абонементы", singleTraining: "Разовые тренировки", drinks: "Напитки", sportFood: "Спортпит", other: "Прочий доход" };
const expenseLabels = { rent: "Аренда", salary: "Зарплата", marketing: "Маркетинг", utilities: "Коммунальные услуги", household: "Хозяйственные расходы", sportFood: "Спортпит", drinks: "Напитки", other: "Прочие расходы" };
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const numeric = (value) => Number.isFinite(value) ? value : null;
const money = (value) => numeric(value) === null ? "—" : MONEY_FORMAT.format(value);
const count = (value) => numeric(value) === null ? "—" : NUMBER_FORMAT.format(value);
const dateLabel = (value) => parseCalendarDate(value) ? value.split("-").reverse().join(".") : "Дата не указана";

function monthLabel(month) {
  if (!parseCalendarDate(`${month}-01`)) return "Месячный отчёт";
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "Europe/Moscow" }).format(new Date(`${month}-01T12:00:00Z`));
}

function sourceStamp(meta) {
  const date = new Date(meta?.fetchedAt || "");
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(date) + " · Москва" : "Время обновления не указано";
}

function headerMarkup(subtitle, loading = false) {
  return `<header class="v2r-nav"><a class="v2r-wordmark" href="#v2Overview" aria-label="GF Fit — обзор">GF Fit<span>Панель клуба</span></a><nav aria-label="Разделы панели"><a href="#v2Overview">Обзор</a><a href="#v2Daily">По дням</a><a href="#v2Month">Месяц</a><a href="#periodReport">Отчёты</a></nav><button type="button" class="v2r-button v2r-refresh" data-action="refresh" ${loading ? 'disabled aria-busy="true"' : ""}>Обновить данные</button></header><section id="v2Overview" class="v2r-banner"><div><p>GF Fit</p><h1>Клуб в цифрах</h1><span>${escape(subtitle)}</span></div></section>`;
}

function metricsMarkup(items) {
  return `<dl class="v2r-metrics">${items.map(([label, value, note]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd>${note ? `<small>${escape(note)}</small>` : ""}</div>`).join("")}</dl>`;
}

function dailyMarkup(day) {
  if (!day) return '<p class="v2r-empty">Дневные данные пока не загружены.</p>';
  const today = moscowDate();
  const caption = `${day.date === today ? "Сегодня" : day.date > today ? "Будущий день" : "Выбранный день"} · ${dateLabel(day.date)}`;
  return `<p class="v2r-date-caption">${escape(caption)}</p>${metricsMarkup([["Выручка", money(day.totalIncome)], ["Расходы", money(day.totalExpense)], ["Прибыль", money(day.netProfit)], ["Продано абонементов", count(day.goalSubscriptionsCount ?? day.membershipsCount)]])}`;
}

function workdayMarkup() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const remaining = Math.max(0, 1380 - minutes);
  const label = minutes < 660 ? "Откроется в 11:00" : minutes >= 1380 ? "Зал закрыт" : `До закрытия ${Math.floor(remaining / 60)} ч ${remaining % 60} мин`;
  const progress = Math.min(100, Math.max(0, (minutes - 660) / 720 * 100));
  return `<span>Зал сегодня · 11:00–23:00</span><strong>${escape(label)}</strong><span class="v2r-workday-track" role="progressbar" aria-label="Рабочий день" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><i style="width:${progress}%"></i></span>`;
}

function breakdownMarkup(values, labels, emptyLabel) {
  const items = Object.entries(values || {}).filter(([, value]) => Number.isFinite(value) && value !== 0);
  if (!items.length) return `<p class="v2r-empty">${escape(emptyLabel)}</p>`;
  const max = Math.max(...items.map(([, value]) => Math.abs(value)), 1);
  return `<dl class="v2r-breakdown">${items.map(([key, value]) => `<div><dt>${escape(labels[key] || "Прочее")}</dt><dd>${escape(money(value))}</dd><span aria-hidden="true"><i style="width:${Math.abs(value) / max * 100}%"></i></span></div>`).join("")}</dl>`;
}

function productsMarkup(items) {
  const products = (items || []).filter((item) => item.sold || item.purchased);
  if (!products.length) return '<p class="v2r-empty">Продаж и закупок товаров пока нет.</p>';
  return `<div class="v2r-table-wrap"><table class="v2r-table"><thead><tr><th scope="col">Товар</th><th scope="col">Продажи</th><th scope="col">Закупки</th><th scope="col">Прибыль</th><th scope="col">Маржа</th></tr></thead><tbody>${products.map((item) => `<tr><th scope="row">${escape(item.label)}${item.purchaseMissing ? '<small>Закупки не внесены</small>' : ""}</th><td>${escape(money(item.sold))}</td><td>${escape(money(item.purchased))}</td><td>${item.purchaseMissing ? "—" : escape(money(item.profit))}</td><td>${item.margin == null ? "—" : `${NUMBER_FORMAT.format(Math.round(item.margin))}%`}</td></tr>`).join("")}</tbody></table></div>`;
}

function archiveMarkup(state) {
  const months = [...new Map((state.months || []).filter((item) => /^\d{4}-\d{2}$/.test(item.month || "")).map((item) => [item.month, item])).values()].sort((a, b) => b.month.localeCompare(a.month));
  if (!months.length) return '<p class="v2r-empty">Годовой архив пока пуст.</p>';
  const groups = new Map();
  for (const item of months) {
    const year = item.month.slice(0, 4);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(item);
  }
  return [...groups].map(([year, records]) => {
    const total = (key) => records.every((item) => Number.isFinite(item.totals?.[key]))
      ? records.reduce((sum, item) => sum + item.totals[key], 0) : null;
    return `<section class="v2r-archive-year"><div class="v2r-section-heading"><h3>${year}</h3><p>Прибыль ${escape(money(total("netProfit")))} · выручка ${escape(money(total("totalIncome")))} · расходы ${escape(money(total("totalExpense")))}</p></div><div class="v2r-table-wrap"><table class="v2r-table"><thead><tr><th scope="col">Месяц</th><th scope="col">Выручка</th><th scope="col">Расходы</th><th scope="col">Прибыль</th>${state.editor ? '<th scope="col">Действие</th>' : ""}</tr></thead><tbody>${records.map((item) => `<tr><th scope="row">${escape(item.label || monthLabel(item.month))}${state.editing === item.month ? `<form class="v2r-archive-form" data-month="${item.month}"><label>Выручка<input name="totalIncome" type="number" step="1" value="${Number(item.totals?.totalIncome) || 0}" required></label><label>Расходы<input name="totalExpense" type="number" step="1" value="${Number(item.totals?.totalExpense) || 0}" required></label><div><button class="v2r-button" type="submit">Сохранить</button><button class="v2r-button" type="button" data-v2-cancel-edit>Отмена</button></div><p class="v2r-form-status" role="status">${escape(state.error || "")}</p></form>` : ""}</th><td>${escape(money(item.totals?.totalIncome))}</td><td>${escape(money(item.totals?.totalExpense))}</td><td>${escape(money(item.totals?.netProfit))}</td>${state.editor ? `<td>${item.month === moscowDate().slice(0, 7) ? "Текущий" : `<button type="button" class="v2r-text-button" data-v2-edit="${item.month}">Изменить</button>`}</td>` : ""}</tr>`).join("")}</tbody></table></div></section>`;
  }).join("");
}

export function updateV2Archive(container, months, onEditMonth) {
  const state = archiveStates.get(container) || {};
  state.months = months || [];
  if (onEditMonth !== undefined) state.editor = onEditMonth;
  archiveStates.set(container, state);
  const host = container.querySelector("#v2Archive");
  if (host) host.innerHTML = archiveMarkup(state);
}

export function renderV2Loading(container) {
  container.innerHTML = `<main class="v2r">${headerMarkup("Загрузка показателей из Google Таблицы…", true)}<div id="v2GoalSlot"></div><section id="v2Daily" class="v2r-panel" aria-busy="true"><div class="v2r-section-heading"><h2>По дням</h2><p>Загружаем дневной отчёт…</p></div><div class="v2r-loading-grid" aria-hidden="true"><span></span><span></span><span></span><span></span></div></section><div id="v2ReportSlot"></div></main>`;
}

export function renderV2(container, model, meta = {}, ctx = {}) {
  const totals = model.totals || {};
  const days = mergedDays(model).filter((day) => parseCalendarDate(day.date));
  const month = model.activePeriod || model.period?.start?.slice(0, 7) || days[0]?.date?.slice(0, 7) || moscowDate().slice(0, 7);
  const monthDays = days.filter((day) => day.date.startsWith(month));
  const currentDate = selectedDates.get(month);
  const day = monthDays.find((item) => item.date === currentDate) || monthDays.find((item) => item.date === moscowDate()) || monthDays.find((item) => item.date === model.today?.date) || monthDays.filter((item) => item.date <= moscowDate()).at(-1) || monthDays[0] || null;
  if (day) selectedDates.set(month, day.date);
  const active = monthDays.filter((item) => item.totalIncome || item.totalExpense);
  const average = active.length ? totals.totalIncome / active.length : null;
  const averageCheck = totals.membershipsCount > 0 ? (totals.income?.memberships || 0) / totals.membershipsCount : null;
  const margin = totals.totalIncome > 0 ? totals.netProfit / totals.totalIncome * 100 : null;
  const warnings = [...(model.sourceMode === "demo" ? ["Показаны демонстрационные данные: Google Таблица недоступна."] : []), ...(model.warnings || [])];
  container.innerHTML = `<main class="v2r">${headerMarkup(monthLabel(month))}
    ${warnings.length ? `<aside class="v2r-notices" aria-label="Состояние данных">${warnings.map((warning) => `<p>${escape(warning)}</p>`).join("")}</aside>` : ""}
    <div id="v2GoalSlot"></div>
    <section id="v2Daily" class="v2r-panel"><div class="v2r-section-heading"><div><h2>По дням</h2><p>${escape(monthLabel(month))}</p></div><span>Выберите день</span></div><nav class="v2r-days" aria-label="Выбор дня отчёта">${monthDays.map((item) => `<button type="button" data-v2-date="${item.date}" aria-pressed="${item.date === day?.date}" aria-label="${escape(dateLabel(item.date))}"><span>${Number(item.date.slice(8))}</span><small>${new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "Europe/Moscow" }).format(new Date(`${item.date}T12:00:00Z`))}</small></button>`).join("")}</nav><div class="v2r-day-results" aria-live="polite">${dailyMarkup(day)}</div><div class="v2r-workday">${workdayMarkup()}</div></section>
    <section id="v2Month" class="v2r-panel"><div class="v2r-section-heading"><div><h2>Месяц</h2><p>${escape(monthLabel(month))}</p></div><a class="v2r-inline-link" href="#periodReport">Выбрать другой период</a></div>${metricsMarkup([["Выручка", money(totals.totalIncome)], ["Расходы", money(totals.totalExpense)], ["Прибыль", money(totals.netProfit)], ["Продано абонементов", count(totals.membershipsCount)]])}<dl class="v2r-context"><div><dt>Дней с движением</dt><dd>${active.length}</dd></div><div><dt>Выручка за активный день</dt><dd>${escape(money(average))}</dd></div><div><dt>Средний чек абонемента</dt><dd>${escape(money(averageCheck))}</dd></div><div><dt>Маржа</dt><dd>${margin === null ? "—" : `${NUMBER_FORMAT.format(Math.round(margin))}%`}</dd></div></dl></section>
    <div class="v2r-columns"><section class="v2r-panel"><div class="v2r-section-heading"><h2>Откуда выручка</h2></div>${breakdownMarkup(totals.income, incomeLabels, "В этом месяце продаж пока нет.")}</section><section class="v2r-panel"><div class="v2r-section-heading"><h2>На что расходы</h2></div>${breakdownMarkup(totals.expenses, expenseLabels, "В этом месяце расходов пока нет.")}</section></div>
    <section class="v2r-panel"><div class="v2r-section-heading"><div><h2>Спортпит и напитки</h2><p>Продажи, закупки и результат за месяц</p></div></div>${productsMarkup(model.productMargins)}</section>
    <section class="v2r-panel"><div class="v2r-section-heading"><h2>На что смотреть</h2></div>${model.insights?.length ? `<ul class="v2r-insights">${model.insights.map((item) => `<li>${escape(item.text)}</li>`).join("")}</ul>` : '<p class="v2r-empty">Пока недостаточно данных для выводов.</p>'}</section>
    <div id="v2ReportSlot"></div>
    <section class="v2r-panel"><div class="v2r-section-heading"><div><h2>Годовой отчёт</h2><p>Сохранённые итоги месяцев</p></div></div><div id="v2Archive"></div></section>
    <footer class="v2r-footer"><div><strong>GF Fit</strong><span>Обновлено: ${escape(sourceStamp(meta))}</span></div><a href="${escape(SHEET_SOURCE.url)}" target="_blank" rel="noreferrer">Открыть Google Таблицу</a></footer>
    </main>`;

  archiveStates.set(container, { months: meta.monthlyArchive || [], editor: ctx.onEditMonth || meta.onEditMonth || null, editing: null, error: "" });
  updateV2Archive(container, meta.monthlyArchive || []);
  const selectDay = (date) => {
    const selected = monthDays.find((item) => item.date === date);
    if (!selected) return;
    selectedDates.set(month, date);
    container.querySelector(".v2r-day-results").innerHTML = dailyMarkup(selected);
    for (const button of container.querySelectorAll("[data-v2-date]")) button.setAttribute("aria-pressed", String(button.dataset.v2Date === date));
  };
  container.onclick = (event) => {
    const button = event.target.closest("[data-v2-date]");
    if (button) selectDay(button.dataset.v2Date);
    const edit = event.target.closest("[data-v2-edit]");
    const cancel = event.target.closest("[data-v2-cancel-edit]");
    if (edit || cancel) {
      const state = archiveStates.get(container);
      state.editing = edit?.dataset.v2Edit || null;
      state.error = "";
      updateV2Archive(container, state.months);
    }
  };
  container.onkeydown = (event) => {
    if (!event.target.matches("[data-v2-date]") || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [...container.querySelectorAll("[data-v2-date]")];
    const index = buttons.indexOf(event.target);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)));
    event.preventDefault();
    selectDay(buttons[next].dataset.v2Date);
    buttons[next].focus({ preventScroll: true });
    buttons[next].scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  container.onsubmit = async (event) => {
    const form = event.target.closest(".v2r-archive-form");
    if (!form) return;
    event.preventDefault();
    const state = archiveStates.get(container);
    const income = Number(form.elements.totalIncome.value), expense = Number(form.elements.totalExpense.value);
    if (!state.editor || !Number.isFinite(income) || !Number.isFinite(expense)) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    form.querySelector(".v2r-form-status").textContent = "Сохраняем…";
    try {
      const months = await state.editor(form.dataset.month, { totalIncome: income, totalExpense: expense });
      state.editing = null;
      state.error = "";
      updateV2Archive(container, Array.isArray(months) ? months : state.months);
    } catch (error) {
      state.error = error.message || "Не удалось сохранить месяц. Повторите попытку.";
      form.querySelector(".v2r-form-status").textContent = state.error;
      submit.disabled = false;
    }
  };
  const strip = container.querySelector(".v2r-days");
  const selectedButton = strip.querySelector('[aria-pressed="true"]');
  if (selectedButton) strip.scrollLeft = Math.max(0, selectedButton.offsetLeft - strip.offsetLeft - strip.clientWidth / 2 + selectedButton.clientWidth / 2);
  setTicker(() => {
    const host = container.querySelector(".v2r-workday");
    if (host) host.innerHTML = workdayMarkup();
  }, 30_000);
}
