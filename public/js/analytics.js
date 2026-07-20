function sumBy(records, selector) {
  return records.reduce((sum, record) => sum + selector(record), 0);
}

function sumObject(records, key) {
  return records.reduce((acc, record) => {
    for (const [name, value] of Object.entries(record[key])) {
      acc[name] = (acc[name] || 0) + value;
    }
    return acc;
  }, {});
}

function latestRecord(records) {
  return [...records].filter((record) => record.date).sort((a, b) => a.date.localeCompare(b.date)).at(-1) || records.at(-1) || null;
}

function latestActiveRecord(records) {
  return [...records]
    .filter((record) => record.date && (record.totalIncome || record.totalExpense))
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1) || null;
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthKey() {
  return todayIso().slice(0, 7);
}

function buildTotals(records, explicitTotals) {
  if (explicitTotals) return explicitTotals;
  const income = sumObject(records, "income");
  const expenses = sumObject(records, "expenses");
  const totalIncome = Object.values(income).reduce((sum, value) => sum + value, 0);
  const totalExpense = Object.values(expenses).reduce((sum, value) => sum + value, 0);
  return {
    membershipsCount: sumBy(records, (record) => record.membershipsCount),
    income,
    expenses,
    totalIncome,
    totalExpense,
    netProfit: totalIncome - totalExpense,
    balance: totalIncome - totalExpense,
  };
}

function monthKey(record) {
  return record.date ? record.date.slice(0, 7) : "unknown";
}

function buildMonthlySummaries(records) {
  const groups = new Map();
  for (const record of records) {
    const key = monthKey(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthRecords], index, all) => {
      const totals = buildTotals(monthRecords, null);
      const prevRecords = index > 0 ? groups.get(all[index - 1][0]) : null;
      const prevTotals = prevRecords ? buildTotals(prevRecords, null) : null;
      const incomeDiff = prevTotals ? totals.totalIncome - prevTotals.totalIncome : null;
      const profitDiff = prevTotals ? totals.netProfit - prevTotals.netProfit : null;
      return {
        month,
        activeDays: monthRecords.filter((record) => record.totalIncome || record.totalExpense).length,
        totals,
        previousMonth: prevTotals ? all[index - 1][0] : null,
        incomeDiff,
        profitDiff,
      };
    });
}

function share(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function exactShare(value, total) {
  return total > 0 ? (value / total) * 100 : 0;
}

function rankedIncomeCategories(totals) {
  const labels = {
    memberships: "Абонементы",
    singleTraining: "Разовые",
    drinks: "Напитки",
    sportFood: "Спортпит",
    other: "Прочее",
  };

  return Object.entries(totals.income)
    .map(([key, value]) => ({
      key,
      label: labels[key] || key,
      value,
      share: exactShare(value, totals.totalIncome),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

function productProfitAnalytics(totals) {
  const items = [
    {
      key: "sportFood",
      label: "Спортпит",
      sold: totals.income.sportFood || 0,
      purchased: totals.expenses.sportFood || 0,
    },
    {
      key: "drinks",
      label: "Вода",
      sold: totals.income.drinks || 0,
      purchased: totals.expenses.drinks || 0,
    },
  ];

  return items.map((item) => {
    const profit = item.sold - item.purchased;
    const purchaseMissing = item.sold > 0 && item.purchased === 0;
    return {
      ...item,
      profit,
      purchaseMissing,
      margin: item.sold > 0 && !purchaseMissing ? (profit / item.sold) * 100 : null,
      purchaseShare: totals.totalExpense > 0 ? (item.purchased / totals.totalExpense) * 100 : null,
    };
  });
}

function makeInsights(totals) {
  const insights = [];
  const margin = totals.totalIncome ? Math.round((totals.netProfit / totals.totalIncome) * 100) : 0;
  const ranking = rankedIncomeCategories(totals);
  const leader = ranking[0];
  const weakest = ranking.at(-1);
  const weakestItems = weakest ? ranking.filter((item) => item.value === weakest.value).map((item) => item.label) : [];

  if (leader) insights.push({ tone: "good", text: `Главный источник продаж: ${leader.label} — ${Math.round(leader.share)}% месячного прихода.` });
  if (weakest && weakest.key !== leader?.key) insights.push({ tone: "warn", text: `Слабее всего продается: ${weakestItems.join(" и ")}. Проверь выкладку, предложение и скрипт продажи.` });
  insights.push({ tone: "warn", text: "Предыдущего месяца в файле нет, поэтому сравнение построено по категориям текущего месяца." });

  if (margin >= 35) insights.push({ tone: "good", text: `Маржинальность месяца выглядит сильной: около ${margin}%.` });
  if (margin > 0 && margin < 20) insights.push({ tone: "warn", text: `Чистая маржа низкая: около ${margin}%, расходы давят на результат.` });
  if (totals.totalExpense > totals.totalIncome * 0.55) insights.push({ tone: "bad", text: "Расходы забирают больше половины прихода — нужна детализация затрат." });

  const membershipShare = share(totals.income.memberships || 0, totals.totalIncome);
  if (membershipShare >= 55) insights.push({ tone: "good", text: "Абонементы дают основную стабильность выручки." });
  if (membershipShare < 35) insights.push({ tone: "warn", text: "Доля абонементов слабая: стоит усилить продление и пакетные продажи." });

  const sportFood = totals.income.sportFood || 0;
  const drinks = totals.income.drinks || 0;
  if (sportFood + drinks < totals.totalIncome * 0.08) {
    insights.push({ tone: "warn", text: "Напитки и спортпит дают мало допродаж — это зона роста без увеличения нагрузки зала." });
  }

  const productMargins = productProfitAnalytics(totals)
    .filter((item) => item.sold || item.purchased)
    .map((item) => ({ label: item.label, income: item.sold, expense: item.purchased }));

  for (const item of productMargins) {
    if (!item.income && item.expense) {
      insights.push({ tone: "bad", text: `${item.label}: есть расход без прихода — проверь остатки и списания.` });
      continue;
    }
    if (!item.income) continue;
    if (item.expense === 0) {
      insights.push({ tone: "warn", text: `${item.label}: закуп не внесен, маржинальность пока нельзя оценить честно.` });
      continue;
    }
    const margin = Math.round(((item.income - item.expense) / item.income) * 100);
    const tone = margin >= 45 ? "good" : margin >= 25 ? "warn" : "bad";
    insights.push({ tone, text: `${item.label}: маржа ${margin}% после закупа.` });
  }

  return insights.slice(0, 7);
}

export function buildDashboardModel(normalized, sourceMode = "live") {
  const records = normalized.records;
  const dailyRecords = normalized.dailyRecords || [];
  const totals = buildTotals(records, normalized.totals);
  const currentDate = todayIso();
  const currentMonth = currentMonthKey();
  const currentDayNumber = new Date().getDate();
  const today = dailyRecords.find((record) => record.date === currentDate)
    || records.find((record) => record.date === currentDate)
    || dailyRecords.find((record) => record.date?.startsWith(currentMonth) && record.dayNumber === currentDayNumber)
    || records.find((record) => record.date?.startsWith(currentMonth) && record.dayNumber === currentDayNumber)
    || latestActiveRecord(dailyRecords)
    || latestActiveRecord(records)
    || latestRecord(records);
  const periodStart = records.find((record) => record.date)?.date || "";
  const periodEnd = latestRecord(records)?.date || "";
  const warnings = [...(normalized.warnings || [])];

  return {
    sourceMode,
    records,
    dailyRecords,
    today,
    totals,
    incomeRanking: rankedIncomeCategories(totals),
    productMargins: productProfitAnalytics(totals),
    monthlySummaries: buildMonthlySummaries(records),
    period: { start: periodStart, end: periodEnd },
    warnings,
    insights: makeInsights(totals),
  };
}
