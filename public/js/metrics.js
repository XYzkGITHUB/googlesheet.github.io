// Derived analytics that the base dashboard model does not expose:
// per-day series, weekday patterns, records, run-rate projections.

export function mergedDays(model) {
  const byDate = new Map();
  for (const record of [...(model.records || []), ...(model.dailyRecords || [])]) {
    if (!record.date || byDate.has(record.date)) continue;
    byDate.set(record.date, record);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function activeDays(days) {
  return days.filter((day) => day.totalIncome || day.totalExpense);
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function monthMeta(model) {
  const days = mergedDays(model);
  const monthKey = (model.period?.start || days[0]?.date || todayIso()).slice(0, 7);
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = year && month ? new Date(year, month, 0).getDate() : 30;
  const now = new Date();
  const isCurrentMonth = monthKey === todayIso().slice(0, 7);
  const dayOfMonth = isCurrentMonth ? now.getDate() : daysInMonth;
  const elapsed = Math.max(1, dayOfMonth);

  const totals = model.totals || {};
  const active = activeDays(days);
  const avgPerActiveDay = active.length ? totals.totalIncome / active.length : 0;
  const runRate = totals.totalIncome / elapsed;
  const projectedIncome = isCurrentMonth ? runRate * daysInMonth : totals.totalIncome;
  const profitRate = (totals.netProfit || 0) / elapsed;
  const projectedProfit = isCurrentMonth ? profitRate * daysInMonth : totals.netProfit || 0;

  return {
    monthKey,
    daysInMonth,
    dayOfMonth,
    isCurrentMonth,
    daysLeft: Math.max(0, daysInMonth - dayOfMonth),
    monthProgress: Math.min(100, (dayOfMonth / daysInMonth) * 100),
    activeCount: active.length,
    avgPerActiveDay,
    projectedIncome,
    projectedProfit,
  };
}

export function dayRecords(model) {
  const days = mergedDays(model);
  const active = activeDays(days);
  const sortedByIncome = [...active].sort((a, b) => b.totalIncome - a.totalIncome);
  return {
    best: sortedByIncome[0] || null,
    worst: sortedByIncome.at(-1) || null,
    bestProfit: [...active].sort((a, b) => b.netProfit - a.netProfit)[0] || null,
  };
}

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function weekdayStats(model) {
  const active = activeDays(mergedDays(model));
  const buckets = new Map(WEEK_ORDER.map((index) => [index, []]));

  for (const day of active) {
    const [year, month, date] = day.date.split("-").map(Number);
    const weekday = new Date(year, month - 1, date).getDay();
    buckets.get(weekday)?.push(day);
  }

  return WEEK_ORDER.map((index) => {
    const items = buckets.get(index) || [];
    const total = items.reduce((sum, item) => sum + item.totalIncome, 0);
    return {
      label: WEEKDAYS[index],
      count: items.length,
      total,
      average: items.length ? total / items.length : 0,
    };
  });
}

export function cumulativeSeries(model) {
  const days = mergedDays(model);
  let income = 0;
  let profit = 0;
  return days.map((day) => {
    income += day.totalIncome || 0;
    profit += day.netProfit || 0;
    return { date: day.date, day: day.dayNumber || Number(day.date.slice(8, 10)), income, profit };
  });
}

export function incomeMixByDay(model) {
  return activeDays(mergedDays(model)).map((day) => ({
    date: day.date,
    day: day.dayNumber || Number(day.date.slice(8, 10)),
    income: day.totalIncome || 0,
    expense: day.totalExpense || 0,
    profit: day.netProfit || 0,
    memberships: day.income?.memberships || 0,
    singleTraining: day.income?.singleTraining || 0,
    drinks: day.income?.drinks || 0,
    sportFood: day.income?.sportFood || 0,
    membershipsCount: day.membershipsCount || 0,
  }));
}

export function compareToAverage(day, average) {
  if (!day || !average) return null;
  return ((day.totalIncome - average) / average) * 100;
}
