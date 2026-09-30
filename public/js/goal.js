const TARGET = 100;

function moscowDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function count(record) {
  const value = record.goalSubscriptionsCount ?? record.membershipsCount ?? 0;
  return Math.max(0, Number(value) || 0);
}

export function subscriptionGoalState(model, date = moscowDate()) {
  const records = model.dailyRecords?.length ? model.dailyRecords : model.records || [];
  const month = model.activePeriod || records.map((record) => record.date?.slice(0, 7) || "").sort().at(-1) || date.slice(0, 7);
  const days = records.filter((record) => record.date?.slice(0, 7) === month);
  const total = days.reduce((sum, record) => sum + count(record), 0);
  const today = month === date.slice(0, 7)
    ? days.filter((record) => record.date === date).reduce((sum, record) => sum + count(record), 0)
    : 0;
  return { month, total, today, remaining: Math.max(0, TARGET - total), progress: Math.min(100, total) };
}

export function renderSubscriptionGoal(model) {
  const state = subscriptionGoalState(model);
  const monthDate = new Date(`${state.month}-01T12:00:00`);
  const monthLabel = Number.isNaN(monthDate.getTime())
    ? "Текущий месяц"
    : new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "Europe/Moscow" }).format(monthDate);
  document.getElementById("subscriptionGoalMonth").textContent = monthLabel;
  document.getElementById("subscriptionGoalCount").textContent = String(state.total);
  document.getElementById("subscriptionGoalToday").textContent = `+${state.today} сегодня`;
  document.getElementById("subscriptionGoalRemaining").textContent = state.remaining
    ? `До цели осталось ${state.remaining}`
    : "Цель выполнена!";
  document.getElementById("subscriptionGoalFill").style.width = `${state.progress}%`;
  document.querySelector(".subscription-goal-track").setAttribute("aria-valuenow", String(state.progress));
}
