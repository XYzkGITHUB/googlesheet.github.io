const incomeMatchers = {
  membershipsCount: [/абонемент.*(шт|кол|кол-во|количество)/i, /кол.*абон/i],
  membershipsIncome: [/доход.*абон/i, /абонемент/i],
  singleTrainingIncome: [/разов/i, /персонал.*трен/i],
  drinksIncome: [/напит/i, /вода/i, /кофе/i],
  sportFoodIncome: [/спорт.?пит/i, /протеин/i, /батончик/i],
  otherIncome: [/проч.*доход/i, /доп.*доход/i],
};

const expenseMatchers = {
  rent: [/аренд/i],
  salary: [/зарп/i, /зп/i, /персонал/i],
  marketing: [/маркет/i, /реклам/i, /smm/i],
  utilities: [/коммун/i, /свет/i, /электроэн/i, /вода/i],
  household: [/хоз/i, /уборк/i, /расход/i],
  sportFood: [/расх.*спорт.?пит/i, /закуп.*спорт.?пит/i],
  drinks: [/расх.*напит/i, /закуп.*напит/i],
  other: [/проч.*расход/i, /другое/i],
};

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  const normalized = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/[₽рруб.,](?=\D|$)/gi, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  const text = cleanText(value);
  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = text.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

function currentYear() {
  return new Date().getFullYear();
}

function currentYearMonth() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: String(now.getMonth() + 1).padStart(2, "0"),
  };
}

function dateFromCurrentMonthDay(day) {
  const numericDay = Number(day);
  if (!Number.isInteger(numericDay) || numericDay < 1 || numericDay > 31) return "";
  const { year, month } = currentYearMonth();
  const daysInMonth = new Date(year, Number(month), 0).getDate();
  if (numericDay > daysInMonth) return "";
  return `${year}-${month}-${String(numericDay).padStart(2, "0")}`;
}

function parseSheetDate(value) {
  const text = cleanText(value);
  const parsed = parseDate(text);
  if (parsed) return parsed;

  const dayMonth = text.match(/(?:^|\D)(\d{1,2})[./-](\d{1,2})(?:\D|$)/);
  if (dayMonth) {
    const [, day, month] = dayMonth;
    return `${currentYear()}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const day = text.match(/(?:^|\D)(\d{1,2})(?:\D|$)/)?.[1];
  const monthWord = Object.keys(ruMonths).find((month) => new RegExp(month, "i").test(text));
  if (day && monthWord) return `${currentYear()}-${ruMonths[monthWord]}-${day.padStart(2, "0")}`;

  return "";
}

function dayNumberFromDate(date) {
  const match = String(date || "").match(/\d{4}-\d{2}-(\d{2})/);
  return match ? Number(match[1]) : 0;
}

function dayNumberFromSheetName(value) {
  const text = cleanText(value);
  if (!text) return 0;

  const dayLabel = text.match(/день[_\s-]*(\d{1,2})/i)?.[1];
  if (dayLabel) return Number(dayLabel);

  const iso = text.match(/(?:^|\D)\d{4}[-./](\d{1,2})[-./](\d{1,2})(?:\D|$)/);
  if (iso) return Number(iso[2]);

  const leadingDay = text.match(/^\D*(\d{1,2})(?:\D|$)/)?.[1];
  if (leadingDay) return Number(leadingDay);

  const dayWithMonthWord = text.match(/(?:^|\D)(\d{1,2})(?:\D|$)/)?.[1];
  const monthWord = Object.keys(ruMonths).find((month) => new RegExp(month, "i").test(text));
  if (dayWithMonthWord && monthWord) return Number(dayWithMonthWord);

  return 0;
}

function dailySheetDate(value) {
  return dateFromCurrentMonthDay(dayNumberFromSheetName(value));
}

function dayNumberFromText(value) {
  const text = cleanText(value);
  const sheetDay = dayNumberFromSheetName(text);
  if (sheetDay) return sheetDay;
  return dayNumberFromDate(parseSheetDate(text));
}

const ruMonths = {
  январь: "01",
  января: "01",
  февраль: "02",
  февраля: "02",
  март: "03",
  марта: "03",
  апрель: "04",
  апреля: "04",
  май: "05",
  мая: "05",
  июнь: "06",
  июня: "06",
  июль: "07",
  июля: "07",
  август: "08",
  августа: "08",
  сентябрь: "09",
  сентября: "09",
  октябрь: "10",
  октября: "10",
  ноябрь: "11",
  ноября: "11",
  декабрь: "12",
  декабря: "12",
};

function rowText(row) {
  return row.map((cell) => cleanText(cell)).filter(Boolean).join(" ");
}

function extractGfReportDate(rows, sheetName = "") {
  const sheetDay = dayNumberFromSheetName(sheetName);
  const sheetDate = sheetDay ? dateFromCurrentMonthDay(sheetDay) : parseSheetDate(sheetName);
  if (sheetDate) {
    return {
      date: sheetDate,
      rawDate: cleanText(sheetName),
    };
  }

  const dateRow = rows.find((row) => /день\s*\d{1,2}/i.test(rowText(row)) && /\d{4}/.test(rowText(row)));
  const text = dateRow ? rowText(dateRow) : "";
  const day = text.match(/день\s*(\d{1,2})/i)?.[1];
  const year = text.match(/(20\d{2})/)?.[1];
  const monthWord = Object.keys(ruMonths).find((month) => new RegExp(month, "i").test(text));

  if (!day || !year || !monthWord) {
    return { date: "", rawDate: text || "Дневной отчет GF Fit" };
  }

  return {
    date: `${year}-${ruMonths[monthWord]}-${day.padStart(2, "0")}`,
    rawDate: `${day.padStart(2, "0")}.${ruMonths[monthWord]}.${year}`,
  };
}

function compactCells(row) {
  return row.map((cell) => cleanText(cell)).filter(Boolean);
}

function amountFromPair(cash, card, fallback = 0) {
  const total = parseNumber(cash) + parseNumber(card);
  return total || parseNumber(fallback);
}

function findGfSummaryValue(rows, label) {
  const summaryStart = rows.findIndex((row) => /итог\s+дня/i.test(rowText(row)));
  const scope = summaryStart >= 0 ? rows.slice(summaryStart) : rows;
  const row = [...scope].reverse().find((item) => {
    const cells = compactCells(item);
    const index = cells.findIndex((cell) => new RegExp(`^${label}$`, "i").test(cell));
    return index >= 0 && cells.slice(index + 1).some((cell) => parseNumber(cell) > 0 || /^0$/.test(cell));
  });
  if (!row) return 0;

  const cells = compactCells(row);
  const index = cells.findIndex((cell) => new RegExp(`^${label}$`, "i").test(cell));
  if (index < 0) return 0;

  return amountFromPair(cells[index + 1], cells[index + 2], cells[index + 3]);
}

function findGfExpenseLineValue(rows, matcher) {
  const row = rows.find((item) => matcher.test(rowText(item)));
  if (!row) return 0;
  const values = compactCells(row).map((cell) => parseNumber(cell)).filter((value) => value > 0);
  return values.at(-1) || 0;
}

function countGfMemberships(rows) {
  const start = rows.findIndex((row) => /абонементы\s+на\s+месяц/i.test(rowText(row)));
  if (start < 0) return 0;
  const totalRow = rows.findIndex((row, index) => {
    if (index <= start) return false;
    const cells = compactCells(row);
    return /^итого:?$/i.test(cells[0] || "");
  });
  const nextSection = rows.findIndex((row, index) => index > start && /разовые\s+тренировки/i.test(rowText(row)));
  const end = totalRow > start ? totalRow : nextSection;
  const section = rows.slice(start + 1, end > start ? end : rows.length);

  return section.filter((row) => {
    const cells = compactCells(row);
    if (!cells.length || /^итого:?$/i.test(cells[0])) return false;
    return cells.some((cell, index) => index > 0 && parseNumber(cell) > 0);
  }).length;
}

function parseGfDailyReport(rows, sheetName = "") {
  const sheetText = rows.map((row) => rowText(row)).join(" ");
  if (!/фитнес\s+«?gf/i.test(sheetText) && !/абонементы\s+на\s+месяц/i.test(sheetText)) return null;

  const { date, rawDate } = extractGfReportDate(rows, sheetName);
  const dayNumber = dayNumberFromText(sheetName) || dayNumberFromDate(date);
  const income = {
    memberships: findGfSummaryValue(rows, "Абонементы"),
    singleTraining: findGfSummaryValue(rows, "Разовые"),
    drinks: findGfSummaryValue(rows, "Напитки"),
    sportFood: findGfSummaryValue(rows, "Спортпит"),
    other: 0,
  };
  const totalExpense = findGfSummaryValue(rows, "Расход");
  const sportFoodExpense = findGfExpenseLineValue(rows, /расход\s+спорт.?пит/i);
  const drinksExpense = findGfExpenseLineValue(rows, /расход\s+напит/i);
  const productExpense = sportFoodExpense + drinksExpense;
  const expenses = {
    rent: 0,
    salary: 0,
    marketing: 0,
    utilities: 0,
    household: 0,
    sportFood: sportFoodExpense,
    drinks: drinksExpense,
    other: Math.max(0, totalExpense - productExpense),
  };
  const totalIncome = Object.values(income).reduce((sum, item) => sum + item, 0);
  const resolvedExpense = totalExpense || Object.values(expenses).reduce((sum, item) => sum + item, 0);
  const warnings = [];

  if (!date) warnings.push("Секция итогов GF Fit найдена, но дата не распознана");

  return {
    records: [
      {
        date,
        rawDate,
        dayNumber,
        sheetName,
        membershipsCount: countGfMemberships(rows),
        income,
        expenses,
        totalIncome,
        totalExpense: resolvedExpense,
        netProfit: totalIncome - resolvedExpense,
        balance: totalIncome - resolvedExpense,
      },
    ],
    totals: null,
    warnings,
  };
}

function blankIncome() {
  return {
    memberships: 0,
    singleTraining: 0,
    drinks: 0,
    sportFood: 0,
    other: 0,
  };
}

function blankExpenses() {
  return {
    rent: 0,
    salary: 0,
    marketing: 0,
    utilities: 0,
    household: 0,
    sportFood: 0,
    drinks: 0,
    other: 0,
  };
}

function makeMonthlyRecord(row, sheetName = "") {
  const day = dayNumberFromSheetName(row[0]);
  const date = day ? dateFromCurrentMonthDay(day) : parseDate(row[0]);
  if (!date) return null;

  const income = {
    memberships: parseNumber(row[1]) + parseNumber(row[2]),
    singleTraining: parseNumber(row[3]) + parseNumber(row[4]),
    drinks: parseNumber(row[5]) + parseNumber(row[6]),
    sportFood: parseNumber(row[7]) + parseNumber(row[8]),
    other: 0,
  };
  const totalExpense = parseNumber(row[9]);
  const sportFoodExpense = parseNumber(row[10]);
  const drinksExpense = parseNumber(row[11]);
  const productExpense = sportFoodExpense + drinksExpense;
  const expenses = {
    ...blankExpenses(),
    sportFood: sportFoodExpense,
    drinks: drinksExpense,
    other: Math.max(0, totalExpense - productExpense),
  };
  const totalIncome = Object.values(income).reduce((sum, item) => sum + item, 0);
  const resolvedExpense = totalExpense || Object.values(expenses).reduce((sum, item) => sum + item, 0);

  return {
    date,
    rawDate: date,
    dayNumber: dayNumberFromDate(date),
    sheetName,
    membershipsCount: 0,
    income,
    expenses,
    totalIncome,
    totalExpense: resolvedExpense,
    netProfit: totalIncome - resolvedExpense,
    balance: totalIncome - resolvedExpense,
  };
}

function parseGfMonthlyReport(rows, sheetName = "") {
  const text = rows.map((row) => rowText(row)).join(" ");
  if (!/отчет\s+за\s+месяц/i.test(text) && !/абон\.\s*н/i.test(text)) return null;

  const records = rows.map((row) => makeMonthlyRecord(row, sheetName)).filter(Boolean);
  if (!records.length) return null;

  const income = records.reduce((acc, record) => {
    for (const [key, value] of Object.entries(record.income)) acc[key] = (acc[key] || 0) + value;
    return acc;
  }, blankIncome());
  const expenses = records.reduce((acc, record) => {
    for (const [key, value] of Object.entries(record.expenses)) acc[key] = (acc[key] || 0) + value;
    return acc;
  }, blankExpenses());
  const totalIncome = Object.values(income).reduce((sum, item) => sum + item, 0);
  const totalExpense = Object.values(expenses).reduce((sum, item) => sum + item, 0);

  return {
    records,
    totals: {
      membershipsCount: 0,
      income,
      expenses,
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      balance: totalIncome - totalExpense,
    },
    warnings: [],
  };
}

export function normalizeWorkbook(sheets) {
  const warnings = [];
  const monthlySheet = sheets.find((sheet) => /отчет|месяц|финал|итог/i.test(sheet.name));
  const parsedDailyReports = sheets
    .filter((sheet) => sheet !== monthlySheet)
    .filter((sheet) => {
      const day = dayNumberFromSheetName(sheet.name);
      return day ? dateFromCurrentMonthDay(day) : parseSheetDate(sheet.name);
    })
    .map((sheet) => parseGfDailyReport(sheet.rows, sheet.name))
    .filter(Boolean);
  const monthlyReport = monthlySheet ? parseGfMonthlyReport(monthlySheet.rows, monthlySheet.name) : null;

  if (!parsedDailyReports.length) warnings.push("Дневные листы не распознаны");
  if (!monthlyReport) warnings.push("Финальный лист месяца не распознан");

  const countsByDay = new Map();
  const countsByDate = new Map();
  for (const report of parsedDailyReports) {
    const record = report.records[0];
    if (record?.dayNumber) countsByDay.set(record.dayNumber, record.membershipsCount || 0);
    if (record?.date) countsByDate.set(record.date, record.membershipsCount || 0);
  }

  const records = (monthlyReport?.records || parsedDailyReports.flatMap((report) => report.records)).map((record) => ({
    ...record,
    membershipsCount: countsByDate.get(record.date) || countsByDay.get(record.dayNumber) || record.membershipsCount || 0,
  }));
  const totals = monthlyReport?.totals || null;
  const reportWarnings = monthlyReport
    ? warnings
    : [...warnings, ...parsedDailyReports.flatMap((report) => report.warnings || [])];

  return {
    records,
    dailyRecords: parsedDailyReports.flatMap((report) => report.records),
    totals,
    warnings: [...reportWarnings, ...(monthlyReport?.warnings || [])],
  };
}

function findColumn(headers, patterns, used = new Set()) {
  return headers.findIndex((header, index) => !used.has(index) && patterns.some((pattern) => pattern.test(header)));
}

function valueByColumn(row, index) {
  return index >= 0 ? parseNumber(row[index]) : 0;
}

function makeRecord(row, indexes) {
  const income = {
    memberships: valueByColumn(row, indexes.membershipsIncome),
    singleTraining: valueByColumn(row, indexes.singleTrainingIncome),
    drinks: valueByColumn(row, indexes.drinksIncome),
    sportFood: valueByColumn(row, indexes.sportFoodIncome),
    other: valueByColumn(row, indexes.otherIncome),
  };
  const expenses = {
    rent: valueByColumn(row, indexes.rent),
    salary: valueByColumn(row, indexes.salary),
    marketing: valueByColumn(row, indexes.marketing),
    utilities: valueByColumn(row, indexes.utilities),
    household: valueByColumn(row, indexes.household),
    other: valueByColumn(row, indexes.other),
  };
  const totalIncome = Object.values(income).reduce((sum, item) => sum + item, 0);
  const totalExpense = Object.values(expenses).reduce((sum, item) => sum + item, 0);

  return {
    date: parseDate(row[indexes.date]),
    rawDate: cleanText(row[indexes.date]),
    membershipsCount: valueByColumn(row, indexes.membershipsCount),
    income,
    expenses,
    totalIncome,
    totalExpense,
    netProfit: totalIncome - totalExpense,
    balance: totalIncome - totalExpense,
  };
}

export function normalizeRows(rows) {
  if (!rows.length) return { records: [], totals: null, warnings: ["Таблица пустая"] };

  const gfReport = parseGfDailyReport(rows);
  if (gfReport) return gfReport;

  const headerRowIndex = rows.findIndex((row) => row.some((cell) => /дата|day|date/i.test(cleanText(cell))));
  const headerRow = rows[headerRowIndex >= 0 ? headerRowIndex : 0].map((cell) => cleanText(cell));
  const used = new Set();
  const dateIndex = findColumn(headerRow, [/дата/i, /date/i, /день/i]);
  used.add(dateIndex);

  const indexes = { date: dateIndex };
  for (const [key, patterns] of Object.entries(incomeMatchers)) {
    indexes[key] = findColumn(headerRow, patterns, used);
    if (indexes[key] >= 0) used.add(indexes[key]);
  }
  for (const [key, patterns] of Object.entries(expenseMatchers)) {
    indexes[key] = findColumn(headerRow, patterns, used);
    if (indexes[key] >= 0) used.add(indexes[key]);
  }

  const dataRows = rows.slice((headerRowIndex >= 0 ? headerRowIndex : 0) + 1);
  const records = [];
  let totals = null;

  for (const row of dataRows) {
    const firstCell = cleanText(row[indexes.date] || row[0]);
    if (!row.some((cell) => cleanText(cell))) continue;
    const record = makeRecord(row, indexes);
    if (/итог|total|финал/i.test(firstCell)) {
      totals = record;
      continue;
    }
    if (record.date || record.totalIncome || record.totalExpense) records.push(record);
  }

  const warnings = [];
  if (indexes.date < 0) warnings.push("Не найден столбец даты");
  if (indexes.membershipsIncome < 0) warnings.push("Не найден доход от абонементов");
  if (indexes.singleTrainingIncome < 0) warnings.push("Не найден доход от разовых тренировок");

  return { records, totals, warnings };
}
