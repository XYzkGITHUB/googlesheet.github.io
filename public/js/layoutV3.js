import { MONEY_FORMAT, NUMBER_FORMAT, SHEET_SOURCE } from "./config.js";
import { barChart, ring, shareBars, trendChart } from "./charts.js";
import { cumulativeSeries, dayRecords, incomeMixByDay, monthMeta, weekdayStats } from "./metrics.js";
import { hydrateCounters, hydrateReveal, setTicker } from "./anim.js";
import { icons } from "./icons.js";

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
  sportFood: "Закуп спортпит",
  drinks: "Закуп напитки",
  other: "Прочие расходы",
};

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function money(value) {
  return MONEY_FORMAT.format(Math.round(value || 0));
}

function number(value) {
  return NUMBER_FORMAT.format(Math.round(value || 0));
}

function signed(value) {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${money(value)}`;
}

function dateLabel(date) {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}` : date || "—";
}

function kpi(label, value, sub, tone = "", format = "money") {
  return `
    <article class="k-cell ${tone}" data-reveal>
      <span>${label}</span>
      <strong data-count="${value}" data-format="${format}">0</strong>
      <small>${sub}</small>
    </article>
  `;
}

function workdayPercent() {
  const now = new Date();
  const start = new Date(now).setHours(11, 0, 0, 0);
  const end = new Date(now).setHours(23, 0, 0, 0);
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function archiveSection(months) {
  const sorted = [...(months || [])]
    .filter((item) => /^\d{4}-\d{2}$/.test(item.month || ""))
    .sort((a, b) => a.month.localeCompare(b.month));

  if (!sorted.length) return `<div class="chart-empty">Годовой архив пока пуст.</div>`;

  const years = new Map();
  for (const item of sorted) {
    const year = item.month.slice(0, 4);
    if (!years.has(year)) years.set(year, []);
    years.get(year).push(item);
  }

  return [...years.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([year, items]) => {
    const byMonth = new Map(items.map((item) => [Number(item.month.slice(5, 7)), item]));
    const income = items.reduce((sum, item) => sum + (item.totals?.totalIncome || 0), 0);
    const profit = items.reduce((sum, item) => sum + (item.totals?.netProfit || 0), 0);

    const cells = Array.from({ length: 12 }, (_, index) => {
      const item = byMonth.get(index + 1);
      if (!item) return `<div class="y-cell empty"><span>${MONTHS_SHORT[index]}</span><strong>—</strong></div>`;
      const tone = (item.totals?.netProfit || 0) >= 0 ? "pos" : "neg";
      const editable = item.month !== currentMonthKey();
      return `
        <div class="y-cell ${tone}" data-month="${item.month}">
          ${editable ? `<button type="button" class="y-edit" data-action="edit" aria-label="Изменить">${icons.pencil(12)}</button>` : ""}
          <span>${MONTHS_SHORT[index]}</span>
          <strong>${money(item.totals?.netProfit)}</strong>
          <small>приход ${money(item.totals?.totalIncome)}</small>
        </div>
      `;
    }).join("");

    return `
      <div class="y-block">
        <div class="y-head">
          <div><span>${year}</span><strong>${money(profit)}</strong><small>прибыль за год</small></div>
          <div><span>Приход</span><strong>${money(income)}</strong><small>${items.length} мес.</small></div>
        </div>
        <div class="y-grid">${cells}</div>
      </div>
    `;
  }).join("");
}

export function renderV3(container, model, meta, ctx) {
  const totals = model.totals || {};
  const today = model.today;
  const monthly = monthMeta(model);
  const days = incomeMixByDay(model);
  const records = dayRecords(model);
  const weekdays = weekdayStats(model);
  const cumulative = cumulativeSeries(model);
  const isDemo = model.sourceMode === "demo";
  const margin = totals.totalIncome ? (totals.netProfit / totals.totalIncome) * 100 : 0;
  const totalMemberships = days.reduce((sum, day) => sum + day.membershipsCount, 0);
  const avgCheck = totalMemberships ? (totals.income?.memberships || 0) / totalMemberships : 0;

  container.innerHTML = `
    <div class="v3">
      <header class="v3-top" data-reveal>
        <div class="v3-brand">
          <span class="v3-mark">GF</span>
          <div>
            <strong>GF Fit · Полный отчет</strong>
            <small>${model.period?.start || "—"} — ${model.period?.end || "—"} · <span data-clock></span></small>
          </div>
        </div>
        <div class="v3-top-actions">
          <span class="pill ${isDemo ? "pill-warn" : "pill-live"}"><i class="dot"></i>${isDemo ? "Демо" : "Live"}</span>
          <button type="button" class="icon-btn" data-action="refresh" title="Обновить" aria-label="Обновить">${icons.refresh(18)}</button>
        </div>
      </header>

      ${(model.warnings || []).length || isDemo ? `
        <div class="v3-alerts" data-reveal>
          ${isDemo ? `<div class="v3-alert">Таблица закрыта — показаны демо-цифры.</div>` : ""}
          ${(model.warnings || []).map((warning) => `<div class="v3-alert">${warning}</div>`).join("")}
        </div>` : ""}

      <section class="k-grid">
        ${kpi("Приход месяц", totals.totalIncome || 0, "все источники", "accent")}
        ${kpi("Расход месяц", totals.totalExpense || 0, "все затраты", "neg")}
        ${kpi("Чистая прибыль", totals.netProfit || 0, "после расходов", (totals.netProfit || 0) >= 0 ? "pos" : "neg")}
        ${kpi("Маржа", margin, "от прихода", margin >= 30 ? "pos" : "warn", "percent")}
        ${kpi("Приход сегодня", today?.totalIncome || 0, dateLabel(today?.date), "accent")}
        ${kpi("Прибыль сегодня", today?.netProfit || 0, "за день", (today?.netProfit || 0) >= 0 ? "pos" : "neg")}
        ${kpi("Средний день", monthly.avgPerActiveDay, `${monthly.activeCount} активных дней`)}
        ${kpi("Прогноз месяца", monthly.projectedIncome, monthly.isCurrentMonth ? `осталось ${monthly.daysLeft} дн.` : "факт", "accent")}
        ${kpi("Абонементов", totalMemberships, "продано за месяц", "", "number")}
        ${kpi("Средний чек", avgCheck, "за абонемент")}
      </section>

      <section class="v3-row">
        <article class="v3-card wide" data-reveal>
          <div class="v3-card-head"><h2>Динамика по дням</h2><small>приход и расход</small></div>
          ${trendChart(days, [
            { key: "income", label: "Приход", color: "var(--accent)", area: true },
            { key: "expense", label: "Расход", color: "var(--neg)", area: false },
          ])}
        </article>
        <article class="v3-card" data-reveal>
          <div class="v3-card-head"><h2>Рабочий день</h2><small>11:00 — 23:00</small></div>
          <div class="v3-ring-wrap">
            ${ring(workdayPercent(), { size: 150, stroke: 13, label: `${Math.round(workdayPercent())}%`, sub: "дня прошло" })}
          </div>
          <div class="v3-mini">
            <div><span>Прогресс месяца</span><strong>${Math.round(monthly.monthProgress)}%</strong></div>
            <div><span>День</span><strong>${monthly.dayOfMonth} / ${monthly.daysInMonth}</strong></div>
          </div>
        </article>
      </section>

      <section class="v3-row">
        <article class="v3-card" data-reveal>
          <div class="v3-card-head"><h2>Накопленная прибыль</h2><small>нарастающим итогом</small></div>
          ${trendChart(cumulative, [{ key: "profit", label: "Прибыль", color: "var(--pos)", area: true }], { height: 170 })}
        </article>
        <article class="v3-card" data-reveal>
          <div class="v3-card-head"><h2>По дням недели</h2><small>средний приход</small></div>
          ${barChart(weekdays.map((item) => ({ label: item.label, value: item.average })), { height: 150 })}
        </article>
      </section>

      <section class="v3-row">
        <article class="v3-card" data-reveal>
          <div class="v3-card-head"><h2>Структура дохода</h2><small>за месяц</small></div>
          <div class="shares">${shareBars(totals.income || {}, totals.totalIncome, { labels: incomeLabels })}</div>
        </article>
        <article class="v3-card" data-reveal>
          <div class="v3-card-head"><h2>Структура расхода</h2><small>за месяц</small></div>
          <div class="shares">${shareBars(totals.expenses || {}, totals.totalExpense, { labels: expenseLabels })}</div>
        </article>
      </section>

      <section class="v3-row">
        <article class="v3-card" data-reveal>
          <div class="v3-card-head"><h2>Рекорды месяца</h2><small>лучшие и слабые дни</small></div>
          <div class="rec-list">
            <div class="rec pos"><span>Лучший день</span><strong>${money(records.best?.totalIncome)}</strong><small>${dateLabel(records.best?.date)}</small></div>
            <div class="rec"><span>Максимум прибыли</span><strong>${money(records.bestProfit?.netProfit)}</strong><small>${dateLabel(records.bestProfit?.date)}</small></div>
            <div class="rec neg"><span>Слабый день</span><strong>${money(records.worst?.totalIncome)}</strong><small>${dateLabel(records.worst?.date)}</small></div>
          </div>
        </article>
        <article class="v3-card" data-reveal>
          <div class="v3-card-head"><h2>Закуп и продажа</h2><small>маржа по товарам</small></div>
          <div class="prod-list">
            ${(model.productMargins || []).map((item) => `
              <div class="prod ${item.profit >= 0 ? "pos" : "neg"}">
                <div class="prod-head"><span>${item.label}</span><strong>${signed(item.profit)}</strong></div>
                <div class="prod-stats">
                  <div><span>Продали</span><strong>${money(item.sold)}</strong></div>
                  <div><span>Закупили</span><strong>${money(item.purchased)}</strong></div>
                  <div><span>Маржа</span><strong>${item.purchaseMissing ? "нет закупа" : `${Math.round(item.margin || 0)}%`}</strong></div>
                </div>
              </div>
            `).join("") || `<div class="chart-empty">Нет данных</div>`}
          </div>
        </article>
      </section>

      <section class="v3-card" data-reveal>
        <div class="v3-card-head"><h2>Приход по дням</h2><small>весь месяц</small></div>
        ${barChart(days.map((day) => ({
          label: String(day.day).padStart(2, "0"),
          value: day.income,
          tone: day.profit < 0 ? "neg" : "",
        })), { height: 170 })}
      </section>

      <section class="v3-row">
        <article class="v3-card" data-reveal>
          <div class="v3-card-head"><h2>Выводы</h2><small>на что смотреть</small></div>
          <ul class="v3-insights">
            ${(model.insights || []).map((item) => `<li class="${item.tone}">${item.text}</li>`).join("")}
          </ul>
        </article>
        <article class="v3-card" data-reveal>
          <div class="v3-card-head"><h2>Источник</h2><small>Google Sheet</small></div>
          <div class="v3-source">
            <a href="${SHEET_SOURCE.url}" target="_blank" rel="noreferrer">Открыть таблицу ↗</a>
            <div><span>Обновлено</span><strong>${meta.fetchedAt ? new Date(meta.fetchedAt).toLocaleString("ru-RU") : new Date().toLocaleString("ru-RU")}</strong></div>
            <div><span>Дней с движением</span><strong>${number(monthly.activeCount)}</strong></div>
            <div><span>Записей загружено</span><strong>${number((model.records || []).length)}</strong></div>
          </div>
        </article>
      </section>

      <section class="v3-card" data-reveal>
        <div class="v3-card-head"><h2>Годовой отчет</h2><small>наведи на месяц и нажми карандаш, чтобы поправить</small></div>
        <div id="v3Archive">${archiveSection(meta.monthlyArchive)}</div>
      </section>
    </div>
  `;

  hydrateReveal(container);
  hydrateCounters(container);

  setTicker(() => {
    const el = container.querySelector("[data-clock]");
    if (el) el.textContent = new Date().toLocaleTimeString("ru-RU");
  }, 1000);

  wireArchiveEditing(container, meta, ctx);
}

// Kept at module scope so a background archive sync can refresh just this
// section instead of repainting (and re-animating) the whole layout.
let months = [];
let archiveHost = null;

export function updateV3Archive(nextMonths) {
  months = nextMonths || [];
  if (archiveHost && archiveHost.isConnected) archiveHost.innerHTML = archiveSection(months);
}

function wireArchiveEditing(container, meta, ctx) {
  const archive = container.querySelector("#v3Archive");
  if (!archive) return;
  archiveHost = archive;
  months = meta.monthlyArchive || [];

  archive.addEventListener("click", (event) => {
    const editButton = event.target.closest('[data-action="edit"]');
    if (!editButton) return;
    const cell = editButton.closest("[data-month]");
    const month = cell.dataset.month;
    const item = months.find((entry) => entry.month === month);
    if (!item) return;

    cell.classList.add("editing");
    cell.innerHTML = `
      <form class="y-form" data-month="${month}">
        <label>Доход<input type="number" name="totalIncome" value="${Math.round(item.totals?.totalIncome || 0)}" required></label>
        <label>Расход<input type="number" name="totalExpense" value="${Math.round(item.totals?.totalExpense || 0)}" required></label>
        <div class="y-form-actions">
          <button type="submit">OK</button>
          <button type="button" data-action="cancel">Отмена</button>
        </div>
      </form>
    `;
  });

  archive.addEventListener("click", (event) => {
    if (!event.target.closest('[data-action="cancel"]')) return;
    archive.innerHTML = archiveSection(months);
  });

  archive.addEventListener("submit", async (event) => {
    const form = event.target.closest(".y-form");
    if (!form) return;
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "...";
    try {
      months = await ctx.onEditMonth(form.dataset.month, {
        totalIncome: Number(form.totalIncome.value) || 0,
        totalExpense: Number(form.totalExpense.value) || 0,
      });
      meta.monthlyArchive = months;
      archive.innerHTML = archiveSection(months);
    } catch (error) {
      submit.disabled = false;
      submit.textContent = "OK";
      alert(error.message || "Не удалось сохранить");
    }
  });
}
