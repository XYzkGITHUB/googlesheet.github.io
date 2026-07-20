import { MONEY_FORMAT, NUMBER_FORMAT, SHEET_SOURCE } from "./config.js";

const incomeLabels = {
  memberships: "Абонементы",
  singleTraining: "Разовые тренировки",
  drinks: "Напитки",
  sportFood: "Спортпит",
  other: "Прочий доход",
};

const expenseLabels = {
  rent: "Аренда",
  salary: "Зарплата",
  marketing: "Маркетинг",
  utilities: "Коммунальные",
  household: "Хозяйственные",
  sportFood: "Расход спортпит",
  drinks: "Расход напитки",
  other: "Прочие расходы",
};

function money(value) {
  return MONEY_FORMAT.format(value || 0);
}

function formatDateLabel(date) {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date || "-";
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function number(value) {
  return NUMBER_FORMAT.format(Math.round(value || 0));
}

function signedMoney(value) {
  if (value === null || value === undefined) return "нет данных";
  const sign = value > 0 ? "+" : "";
  return `${sign}${money(value)}`;
}

function monthShortName(index) {
  return new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(new Date(2026, index, 1)).replace(".", "");
}

function setHtml(id, html) {
  document.getElementById(id).innerHTML = html;
}

function metricCard(label, value, note, tone = "") {
  return `
    <article class="metric ${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </article>
  `;
}

function monthHeroCard(totals) {
  if (!totals) {
    return `<article class="today-hero empty">Нет данных за месяц</article>`;
  }

  return `
    <article class="today-hero">
      <span>Приход за месяц</span>
      <strong class="positive">${money(totals.totalIncome)}</strong>
      <small>Расход ${money(totals.totalExpense)} / Чистая прибыль ${money(totals.netProfit)}</small>
    </article>
  `;
}

function todayHeroCard(today) {
  if (!today) {
    return `<article class="today-hero empty">Нет данных за текущий день</article>`;
  }

  return `
    <article class="today-hero">
      <span>Приход сегодня</span>
      <strong class="positive">${money(today.totalIncome)}</strong>
      <small>Абонементы ${number(today.membershipsCount)} / Чистая прибыль ${money(today.netProfit)}</small>
    </article>
  `;
}

function breakdownRows(items, labels, total) {
  return Object.entries(items)
    .filter(([, value]) => value)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => {
      const width = total ? Math.max(3, Math.round((value / total) * 100)) : 0;
      return `
        <div class="breakdown-row">
          <div class="row-line">
            <span>${labels[key] || key}</span>
            <strong>${money(value)}</strong>
          </div>
          <div class="bar"><i style="width:${width}%"></i></div>
        </div>
      `;
    })
    .join("") || `<div class="empty">Нет данных</div>`;
}

function renderMonthlyFacts(totals, records) {
  const activeDays = records.filter((record) => record.totalIncome || record.totalExpense).length;
  const rows = [
    ["Дней с движением", activeDays, "number"],
    ["Средний приход", activeDays ? totals.totalIncome / activeDays : 0],
    ["Чистая маржа", totals.totalIncome ? (totals.netProfit / totals.totalIncome) * 100 : 0, "percent"],
    ["Чистая прибыль", totals.netProfit],
  ];

  return rows.map(([label, value, type]) => {
    return `
      <div class="compare-row">
        <span>${label}</span>
        <strong>${type === "number" ? number(value) : type === "percent" ? `${Math.round(value)}%` : money(value)}</strong>
        <small>итог месяца</small>
      </div>
    `;
  }).join("");
}

function renderCategoryComparison(ranking, totalIncome) {
  if (!ranking.length) return `<div class="empty">Нет продаж по категориям</div>`;
  const shareText = (value) => {
    if (!totalIncome || !value) return "0%";
    if (value > 0 && value < 1) return "<1%";
    return `${Math.round(value)}%`;
  };
  return ranking.map((item) => `
    <div class="compare-row">
      <span>${item.label}</span>
      <strong>${money(item.value)}</strong>
      <small>${shareText(item.share)} прихода</small>
    </div>
  `).join("");
}

function percent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${Math.round(value)}%`;
}

function renderProductMargins(items) {
  if (!items.length) return `<div class="empty">Нет данных по закупу и продаже</div>`;

  return items.map((item) => {
    const tone = item.profit >= 0 ? "profit" : "loss";
    const marginText = item.purchaseMissing ? "нет закупа" : percent(item.margin);
    return `
      <article class="product-card ${tone} ${item.purchaseMissing ? "missing" : ""}">
        <div class="product-title">
          <span>${item.label}</span>
          <strong>${money(item.profit)}</strong>
        </div>
        <div class="product-stats">
          <div>
            <span>Продали</span>
            <strong>${money(item.sold)}</strong>
          </div>
          <div>
            <span>Закупили</span>
            <strong>${money(item.purchased)}</strong>
          </div>
          <div>
            <span>Маржа</span>
            <strong>${marginText}</strong>
          </div>
          <div>
            <span>Доля расхода</span>
            <strong>${percent(item.purchaseShare)}</strong>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function previousMonthDiff(item, sortedMonths) {
  const index = sortedMonths.findIndex((month) => month.month === item.month);
  const previous = index > 0 ? sortedMonths[index - 1] : null;
  if (!previous) return null;
  return (item.totals?.netProfit || 0) - (previous.totals?.netProfit || 0);
}

function renderYearArchive(year, records, sortedMonths) {
  const byMonth = new Map(records.map((item) => [Number(item.month.slice(5, 7)), item]));
  const yearIncome = records.reduce((sum, item) => sum + (item.totals?.totalIncome || 0), 0);
  const yearExpense = records.reduce((sum, item) => sum + (item.totals?.totalExpense || 0), 0);
  const yearProfit = records.reduce((sum, item) => sum + (item.totals?.netProfit || 0), 0);
  const bestMonth = [...records].sort((a, b) => (b.totals?.netProfit || 0) - (a.totals?.netProfit || 0))[0];

  const cards = Array.from({ length: 12 }, (_, index) => {
    const monthNumber = index + 1;
    const item = byMonth.get(monthNumber);
    if (!item) {
      return `
        <div class="year-month empty-month">
          <span>${monthShortName(index)}</span>
          <strong>-</strong>
          <small>нет отчета</small>
        </div>
      `;
    }

    const diff = previousMonthDiff(item, sortedMonths);
    const tone = (item.totals?.netProfit || 0) >= 0 ? "profit" : "loss";
    return `
      <div class="year-month ${tone}">
        <span>${monthShortName(index)}</span>
        <strong>${money(item.totals?.netProfit)}</strong>
        <small>${diff === null ? "первый отчет" : `${signedMoney(diff)} к пред.`}</small>
      </div>
    `;
  }).join("");

  return `
    <section class="year-report">
      <div class="year-topline">
        <div>
          <span>${year}</span>
          <strong>${money(yearProfit)}</strong>
          <small>чистая прибыль за год</small>
        </div>
        <div>
          <span>Приход</span>
          <strong>${money(yearIncome)}</strong>
          <small>расход ${money(yearExpense)}</small>
        </div>
        <div>
          <span>Лучший месяц</span>
          <strong>${bestMonth?.label || bestMonth?.month || "-"}</strong>
          <small>${bestMonth ? money(bestMonth.totals?.netProfit) : "нет данных"}</small>
        </div>
      </div>
      <div class="year-calendar">${cards}</div>
    </section>
  `;
}

function renderAnnualArchive(months) {
  const sortedMonths = [...(months || [])]
    .filter((item) => /^\d{4}-\d{2}$/.test(item.month || ""))
    .sort((a, b) => a.month.localeCompare(b.month));

  if (!sortedMonths.length) {
    return `<div class="empty">Годовой архив пока пуст. Первый месячный итог сохранится автоматически после загрузки финального отчета.</div>`;
  }

  const groups = new Map();
  for (const item of sortedMonths) {
    const year = item.month.slice(0, 4);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(item);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, records]) => renderYearArchive(year, records, sortedMonths))
    .join("");
}

function sortedDayRecords(model) {
  const byDate = new Map();
  for (const record of [...(model.records || []), ...(model.dailyRecords || [])]) {
    if (!record.date || byDate.has(record.date)) continue;
    byDate.set(record.date, record);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function findDayRecord(model, date) {
  return (model.dailyRecords || []).find((record) => record.date === date)
    || (model.records || []).find((record) => record.date === date)
    || model.today
    || null;
}

function renderDaySelector(model, selectedDate) {
  const days = sortedDayRecords(model);
  if (!days.length) return "";

  return days.map((record) => {
    const day = String(record.dayNumber || Number(record.date.slice(8, 10))).padStart(2, "0");
    const active = record.date === selectedDate ? " active" : "";
    const hasData = record.totalIncome || record.totalExpense || record.membershipsCount;
    return `
      <button class="day-chip${active}" type="button" data-date="${record.date}">
        <span>${day}</span>
        <small>${hasData ? money(record.totalIncome) : "0 ₽"}</small>
      </button>
    `;
  }).join("");
}

function renderTodayGrid(today) {
  if (!today) return "";
  return [
    todayHeroCard(today),
    metricCard("Абонементы сегодня", number(today.membershipsCount), "продано", "profit-tone"),
    metricCard("Расход сегодня", money(today.totalExpense), "все затраты", "expense-tone"),
    metricCard("Чистая прибыль", money(today.netProfit), "сегодня", today.netProfit >= 0 ? "profit-tone" : "loss-tone"),
    metricCard("Абонементы ₽", money(today.income.memberships), "сегодня"),
    metricCard("Разовые", money(today.income.singleTraining), "сегодня"),
    metricCard("Напитки", money(today.income.drinks), "сегодня"),
    metricCard("Спортпит", money(today.income.sportFood), "сегодня"),
  ].join("");
}

function updateSelectedDay(model, selectedDate) {
  const selected = findDayRecord(model, selectedDate);
  document.getElementById("todayTitle").textContent = selected?.date === model.today?.date ? "Текущий день" : "Выбранный день";
  document.getElementById("todayDate").textContent = selected ? `${selected.rawDate || "День"} / ${formatDateLabel(selected.date)}` : "День не определен";
  setHtml("todayGrid", renderTodayGrid(selected));

  for (const button of document.querySelectorAll(".day-chip")) {
    button.classList.toggle("active", button.dataset.date === selected?.date);
  }
}

function centerSelectedChip(container, selectedDate) {
  const target = container.querySelector(`[data-date="${selectedDate}"]`);
  if (!target) return;
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const offset = container.scrollLeft
    + (targetRect.left - containerRect.left)
    - container.clientWidth / 2
    + targetRect.width / 2;
  container.scrollLeft = Math.max(0, offset);
}

function enableDragScroll(container) {
  let isDown = false;
  let startX = 0;
  let startScroll = 0;

  const onMove = (event) => {
    if (!isDown) return;
    const delta = event.pageX - startX;
    if (Math.abs(delta) > 4) container.dataset.dragged = "true";
    container.scrollLeft = startScroll - delta;
  };

  const stop = () => {
    isDown = false;
    container.classList.remove("dragging");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", stop);
  };

  container.onmousedown = (event) => {
    isDown = true;
    delete container.dataset.dragged;
    startX = event.pageX;
    startScroll = container.scrollLeft;
    container.classList.add("dragging");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", stop);
  };
}

function updateDayArrowState(container, prev, next) {
  const maxScroll = container.scrollWidth - container.clientWidth - 1;
  prev.disabled = container.scrollLeft <= 0;
  next.disabled = container.scrollLeft >= maxScroll;
}

function wireDaySelectorArrows(container) {
  const prev = document.getElementById("daySelectorPrev");
  const next = document.getElementById("daySelectorNext");
  if (!prev || !next) return;

  const scrollAmount = () => Math.max(container.clientWidth * 0.7, 160);
  prev.onclick = () => container.scrollBy({ left: -scrollAmount(), behavior: "smooth" });
  next.onclick = () => container.scrollBy({ left: scrollAmount(), behavior: "smooth" });
  container.onscroll = () => updateDayArrowState(container, prev, next);
  updateDayArrowState(container, prev, next);
}

function mountDaySelector(model) {
  const selectedDate = model.today?.date || sortedDayRecords(model)[0]?.date || "";
  const container = document.getElementById("daySelector");
  setHtml("daySelector", renderDaySelector(model, selectedDate));
  updateSelectedDay(model, selectedDate);

  container.onclick = (event) => {
    if (container.dataset.dragged) {
      delete container.dataset.dragged;
      return;
    }
    const button = event.target.closest(".day-chip");
    if (!button) return;
    updateSelectedDay(model, button.dataset.date);
  };

  enableDragScroll(container);
  wireDaySelectorArrows(container);
  centerSelectedChip(container, selectedDate);
}

function renderMonthGrid(totals) {
  if (!totals) return "";
  const margin = totals.totalIncome ? Math.round((totals.netProfit / totals.totalIncome) * 100) : 0;
  return [
    monthHeroCard(totals),
    metricCard("Расход за месяц", money(totals.totalExpense), "все затраты", "expense-tone"),
    metricCard("Чистая маржа", `${margin}%`, "после расходов", totals.netProfit >= 0 ? "profit-tone" : "loss-tone"),
    metricCard("Абонементы ₽", money(totals.income.memberships), "итоговый отчет"),
    metricCard("Разовые", money(totals.income.singleTraining), "итоговый отчет"),
    metricCard("Напитки", money(totals.income.drinks), "итоговый отчет"),
    metricCard("Спортпит", money(totals.income.sportFood), "итоговый отчет"),
    metricCard("Чистая прибыль", money(totals.netProfit), "итог месяца", totals.netProfit >= 0 ? "profit-tone" : "loss-tone"),
  ].join("");
}

export function renderDashboard(model, meta = {}) {
  const { totals, today, records, incomeRanking, productMargins } = model;
  document.getElementById("sourceStatus").textContent = model.sourceMode === "demo" ? "Демо" : "Live";
  document.getElementById("sourceStatus").className = `status ${model.sourceMode === "demo" ? "demo" : "ok"}`;
  document.getElementById("sourceLink").href = SHEET_SOURCE.url;
  document.getElementById("updatedAt").textContent = meta.fetchedAt ? new Date(meta.fetchedAt).toLocaleString("ru-RU") : new Date().toLocaleString("ru-RU");
  const monthLabel = model.period.start && model.period.end ? `${model.period.start} — ${model.period.end}` : "Месяц не определен";
  document.getElementById("periodLabel").textContent = monthLabel;
  mountDaySelector(model);
  setHtml("todayComparison", renderMonthlyFacts(totals, records));

  setHtml("summaryGrid", [
    metricCard("Приход за месяц", money(totals.totalIncome), "итоговый отчет", "income-tone"),
    metricCard("Расход за месяц", money(totals.totalExpense), "итоговый отчет", "expense-tone"),
    metricCard("Чистая маржа", `${totals.totalIncome ? Math.round((totals.netProfit / totals.totalIncome) * 100) : 0}%`, "итоговый отчет", totals.netProfit >= 0 ? "profit-tone" : "loss-tone"),
    metricCard("Абонементы ₽", money(totals.income.memberships), "итоговый отчет"),
    metricCard("Разовые", money(totals.income.singleTraining), "итоговый отчет"),
    metricCard("Напитки", money(totals.income.drinks), "итоговый отчет"),
    metricCard("Спортпит", money(totals.income.sportFood), "итоговый отчет"),
    metricCard("Чистая прибыль", money(totals.netProfit), "итоговый отчет", totals.netProfit >= 0 ? "profit-tone" : "loss-tone"),
  ].join(""));

  setHtml("incomeBreakdown", breakdownRows(totals.income, incomeLabels, totals.totalIncome));
  setHtml("expenseBreakdown", breakdownRows(totals.expenses, expenseLabels, totals.totalExpense));
  setHtml("productMargins", renderProductMargins(productMargins || []));
  setHtml("comparison", renderCategoryComparison(incomeRanking, totals.totalIncome));
  setHtml("insights", model.insights.map((item) => `<li class="${item.tone}">${item.text}</li>`).join(""));
  setHtml("monthlyHistory", renderAnnualArchive(meta.monthlyArchive || []));

  const warnings = [...(model.warnings || [])];
  if (model.sourceMode === "demo") warnings.unshift("Таблица закрыта. Показаны демо-цифры.");
  if (meta.archiveWarning) warnings.push(meta.archiveWarning);
  setHtml("alertHost", warnings.map((warning) => `<div class="alert">${warning}</div>`).join(""));
}

function minutesToText(minutes) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (!hours) return `${rest} мин`;
  return `${hours} ч ${rest} мин`;
}

function updateWorkdayStatus() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(11, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 0, 0, 0);
  const total = end - start;
  const elapsed = now - start;
  const progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
  const beforeStart = now < start;
  const afterEnd = now > end;
  const minutesLeft = beforeStart ? (end - start) / 60000 : (end - now) / 60000;
  const isFriday = now.getDay() === 5;
  const fridayBreakStarted = isFriday && now.getHours() >= 13 && now < end;
  const title = beforeStart ? "До открытия" : afterEnd ? "Рабочий день завершен" : "11:00-23:00";
  const note = fridayBreakStarted ? "Пятница: перерыв с 13:00" : "Без выходных";

  document.getElementById("workdayTitle").textContent = title;
  document.getElementById("workdayTimeLeft").textContent = afterEnd ? "0 мин" : minutesToText(minutesLeft);
  document.getElementById("workdayProgress").style.width = `${progress}%`;
  document.getElementById("workdayPercent").textContent = `${Math.round(progress)}% дня прошло`;
  document.getElementById("workdayNote").textContent = note;
}

let workdayTimer = null;

export function startWorkdayTicker() {
  updateWorkdayStatus();
  if (workdayTimer) clearInterval(workdayTimer);
  workdayTimer = setInterval(updateWorkdayStatus, 60_000);
}

export function renderFatalError(error) {
  document.getElementById("sourceStatus").textContent = "Ошибка";
  document.getElementById("sourceStatus").className = "status error";
  setHtml("alertHost", `<div class="alert danger">${error.message}</div>`);
}
