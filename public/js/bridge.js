import { buildDashboardModel } from "./analytics.js";

const DASHBOARD_PATH = "/api/dashboard";
const MONTHS_PATH = "/api/months";

export async function loadBridgeDashboard() {
  try {
    const response = await fetch(DASHBOARD_PATH, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.days && payload?.source?.period ? payload : null;
  } catch {
    return null;
  }
}

export function bridgeDashboardModel(payload) {
  const records = (payload.days || []).map((day) => {
    const income = {
      memberships: Number(day.categories?.members) || 0,
      singleTraining: Number(day.categories?.dropIns) || 0,
      drinks: Number(day.categories?.drinks) || 0,
      sportFood: Number(day.categories?.nutrition) || 0,
      other: 0,
    };
    const totalIncome = Number(day.revenue) || 0;
    const totalExpense = Number(day.expenses) || 0;
    const expenseRows = (day.expenseCategories || []).map((value) => Number(value) || 0);
    const knownExpense = expenseRows.reduce((sum, value) => sum + value, 0);
    return {
      date: day.date,
      rawDate: day.date,
      dayNumber: Number(day.day) || Number(day.date?.slice(8, 10)) || 0,
      membershipsCount: Number(day.subscriptions) || 0,
      goalSubscriptionsCount: Number(day.subscriptions) || 0,
      income,
      expenses: {
        rent: expenseRows[0] || 0,
        salary: expenseRows[3] || 0,
        marketing: 0,
        utilities: 0,
        household: 0,
        sportFood: expenseRows[1] || 0,
        drinks: expenseRows[2] || 0,
        other: (expenseRows[4] || 0) + totalExpense - knownExpense,
      },
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      balance: totalIncome - totalExpense,
    };
  });
  const model = buildDashboardModel({ records, dailyRecords: records, totals: null, warnings: [] }, "live");
  model.activePeriod = payload.source.period;
  return model;
}

export function archiveToMonthlyHistory(item) {
  const income = { memberships: 0, singleTraining: 0, drinks: 0, sportFood: 0, other: 0 };
  const totals = {
    membershipsCount: Number(item.subscriptions) || 0,
    income,
    expenses: { other: Number(item.expenses) || 0 },
    totalIncome: Number(item.revenue) || 0,
    totalExpense: Number(item.expenses) || 0,
    netProfit: Number(item.profit) || 0,
    balance: Number(item.profit) || 0,
  };
  return {
    month: item.period,
    label: new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date(`${item.period}-01T12:00:00`)),
    period: { start: `${item.period}-01`, end: `${item.period}-${String(new Date(Number(item.period.slice(0, 4)), Number(item.period.slice(5)), 0).getDate()).padStart(2, "0")}` },
    activeDays: (item.days || []).filter((day) => day.revenue || day.expenses || day.subscriptions).length,
    totals,
    ranking: [],
    days: item.days || [],
  };
}

export async function createNextMonth(period, adminToken, onProgress = () => {}) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(MONTHS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ period }),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Не удалось создать месяц.");
    onProgress(result);
    if (result.complete) return result;
  }
  throw new Error("Создание месяца не завершилось. Повторите действие: созданные вкладки сохранятся.");
}
