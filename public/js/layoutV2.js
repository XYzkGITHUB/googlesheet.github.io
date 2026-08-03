import { MONEY_FORMAT, SHEET_SOURCE } from "./config.js";
import { barChart, ring } from "./charts.js";
import { compareToAverage, incomeMixByDay, monthMeta } from "./metrics.js";
import { hydrateCounters, hydrateReveal, setTicker } from "./anim.js";
import { icons } from "./icons.js";

function money(value) {
  return MONEY_FORMAT.format(Math.round(value || 0));
}

function workdayState() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(11, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 0, 0, 0);
  const total = end - start;
  const progress = Math.min(100, Math.max(0, ((now - start) / total) * 100));
  const beforeStart = now < start;
  const afterEnd = now > end;
  const minutesLeft = beforeStart ? total / 60000 : Math.max(0, (end - now) / 60000);
  const hours = Math.floor(minutesLeft / 60);
  const mins = Math.round(minutesLeft % 60);

  return {
    progress: afterEnd ? 100 : progress,
    label: afterEnd ? "Закрыто" : beforeStart ? "До открытия" : `${hours} ч ${mins} мин`,
    sub: afterEnd ? "день завершен" : beforeStart ? "откроемся в 11:00" : "до закрытия",
  };
}

function verdicts(model, meta, today) {
  const list = [];
  const totals = model.totals || {};
  const delta = compareToAverage(today, meta.avgPerActiveDay);

  if (today && delta !== null) {
    const rounded = Math.round(Math.abs(delta));
    if (delta >= 10) list.push({ tone: "good", icon: icons.arrowUp(18), text: `Сегодня лучше обычного дня на ${rounded}%.` });
    else if (delta <= -10) list.push({ tone: "bad", icon: icons.arrowDown(18), text: `Сегодня слабее обычного дня на ${rounded}%.` });
    else list.push({ tone: "flat", icon: icons.equals(18), text: "Сегодня примерно как обычный день." });
  }

  if (today && today.netProfit < 0) {
    list.push({ tone: "bad", icon: icons.alert(18), text: `Сегодня минус ${money(Math.abs(today.netProfit))} — расходы больше прихода.` });
  }

  const margin = totals.totalIncome ? Math.round((totals.netProfit / totals.totalIncome) * 100) : 0;
  if (margin >= 35) list.push({ tone: "good", icon: icons.check(18), text: `Из каждых 100 ₽ прихода остается ${margin} ₽ прибыли.` });
  else if (margin > 0) list.push({ tone: "warn", icon: icons.alert(18), text: `Из каждых 100 ₽ остается всего ${margin} ₽ — расходы давят.` });

  if (meta.isCurrentMonth && meta.daysLeft > 0) {
    list.push({ tone: "flat", icon: icons.arrowRight(18), text: `Если темп сохранится, месяц закроется на ${money(meta.projectedIncome)}.` });
  }

  return list.slice(0, 4);
}

export function renderV2(container, model, meta, ctx) {
  const totals = model.totals || {};
  const today = model.today;
  const monthly = monthMeta(model);
  const days = incomeMixByDay(model);
  const recent = days.slice(-14).map((day) => ({
    label: String(day.day).padStart(2, "0"),
    value: day.income,
    tone: day.profit < 0 ? "neg" : "",
  }));
  const work = workdayState();
  const isDemo = model.sourceMode === "demo";

  container.innerHTML = `
    <div class="v2">
      <header class="v2-top" data-reveal>
        <div class="v2-brand">
          <span class="v2-mark">GF</span>
          <div>
            <strong>GF Fit</strong>
            <small data-clock></small>
          </div>
        </div>
        <div class="v2-top-actions">
          <span class="pill ${isDemo ? "pill-warn" : "pill-live"}">
            <i class="dot"></i>${isDemo ? "Демо" : "Live"}
          </span>
          <button class="v2-refresh" data-action="refresh" type="button">${icons.refresh(16)}<span>Обновить</span></button>
        </div>
      </header>

      ${isDemo ? `<div class="v2-alert" data-reveal>Таблица закрыта — показаны демо-цифры.</div>` : ""}

      <section class="v2-hero" data-reveal>
        <div class="v2-hero-main">
          <p>Приход сегодня</p>
          <strong data-count="${today?.totalIncome || 0}" data-format="money">0 ₽</strong>
          <span class="v2-hero-sub ${(today?.netProfit || 0) >= 0 ? "up" : "down"}">
            Чистыми ${money(today?.netProfit)} · ${today?.membershipsCount || 0} абонем.
          </span>
        </div>
        <div class="v2-hero-ring">
          ${ring(work.progress, { size: 150, stroke: 13, label: work.label, sub: work.sub })}
        </div>
      </section>

      <section class="v2-tiles">
        <article class="v2-tile" data-reveal>
          <span>Расход сегодня</span>
          <strong data-count="${today?.totalExpense || 0}" data-format="money">0 ₽</strong>
        </article>
        <article class="v2-tile" data-reveal>
          <span>Приход за месяц</span>
          <strong data-count="${totals.totalIncome || 0}" data-format="money">0 ₽</strong>
        </article>
        <article class="v2-tile ${(totals.netProfit || 0) >= 0 ? "pos" : "neg"}" data-reveal>
          <span>Прибыль за месяц</span>
          <strong data-count="${totals.netProfit || 0}" data-format="money">0 ₽</strong>
        </article>
      </section>

      <section class="v2-card" data-reveal>
        <div class="v2-card-head">
          <h2>Последние дни</h2>
          <small>приход по дням</small>
        </div>
        ${barChart(recent, { height: 170 })}
      </section>

      <section class="v2-card" data-reveal>
        <div class="v2-card-head">
          <h2>Месяц идет</h2>
          <small>${monthly.dayOfMonth} из ${monthly.daysInMonth} дней</small>
        </div>
        <div class="v2-progress">
          <div class="v2-progress-track"><div class="v2-progress-fill" style="--w:${monthly.monthProgress.toFixed(1)}%"></div></div>
          <div class="v2-progress-meta">
            <div><span>Уже заработано</span><strong>${money(totals.totalIncome)}</strong></div>
            <div><span>Прогноз на месяц</span><strong>${money(monthly.projectedIncome)}</strong></div>
            <div><span>Средний день</span><strong>${money(monthly.avgPerActiveDay)}</strong></div>
          </div>
        </div>
      </section>

      <section class="v2-verdicts">
        ${verdicts(model, monthly, today).map((item) => `
          <div class="v2-verdict ${item.tone}" data-reveal>
            <i>${item.icon}</i><p>${item.text}</p>
          </div>
        `).join("")}
      </section>

      <footer class="v2-foot" data-reveal>
        <a href="${SHEET_SOURCE.url}" target="_blank" rel="noreferrer">Открыть таблицу</a>
        <span>Обновлено ${meta.fetchedAt ? new Date(meta.fetchedAt).toLocaleString("ru-RU") : new Date().toLocaleString("ru-RU")}</span>
      </footer>
    </div>
  `;

  hydrateReveal(container);
  hydrateCounters(container);

  setTicker(() => {
    const el = container.querySelector("[data-clock]");
    if (el) el.textContent = new Date().toLocaleTimeString("ru-RU");
  }, 1000);

  setTicker(() => {
    const state = workdayState();
    const value = container.querySelector(".ring-value");
    const label = container.querySelector(".ring-center strong");
    const sub = container.querySelector(".ring-center span");
    if (!value || !label) return;
    const dash = Number(value.style.getPropertyValue("--dash"));
    value.style.setProperty("--offset", String(dash * (1 - state.progress / 100)));
    label.textContent = state.label;
    if (sub) sub.textContent = state.sub;
  }, 30_000);
}
