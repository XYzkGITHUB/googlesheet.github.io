/*
 * GymFitTrack spreadsheet bridge.
 * Install as a bound Apps Script project in the source spreadsheet and deploy
 * as a Web app that executes as the owner. Set Script Property SHARED_SECRET.
 * It reads existing tabs. Setup actions create new tabs only.
 */
const GYM_SHEET_ID = "16WmzN44H6jCYjgyUQ9WBX58FERS3cTKKjDBThntWs1U";
const GYM_FIRST_MONTH = "2026-09";
const GYM_GOAL = 100;
const GYM_BATCH_SIZE = 4;

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || "{}");
    const secret = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
    if (!secret || request.secret !== secret) throw new Error("Доступ запрещён.");
    let result;
    if (request.action === "dashboard") result = gymDashboard_();
    else if (request.action === "capabilities") result = { archiveFormat: "single-tab-v1" };
    else if (request.action === "setupMonth") result = gymSetupMonth_(request.period);
    else throw new Error("Неизвестная операция.");
    return gymJson_(Object.assign({ ok: true }, result));
  } catch (error) {
    return gymJson_({ ok: false, error: String(error.message || error) });
  }
}

function gymJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function gymSpreadsheet_() {
  return SpreadsheetApp.openById(GYM_SHEET_ID);
}

function gymActiveMonth_() {
  return PropertiesService.getScriptProperties().getProperty("ACTIVE_MONTH")
    || GYM_FIRST_MONTH;
}

function gymNextMonth_(period) {
  const parts = period.split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1], 1));
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0");
}

function gymDaysInMonth_(period) {
  const parts = period.split("-").map(Number);
  return new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
}

function gymDayTabName_(period, day) {
  return period === GYM_FIRST_MONTH
    ? "День " + day
    : period + "-" + String(day).padStart(2, "0");
}

function gymNumber_(value) {
  const clean = String(value == null ? "" : value).replace(/[^\d.-]/g, "");
  return clean ? Number(clean) || 0 : 0;
}

function gymLastNumber_(row) {
  for (let i = row.length - 1; i >= 0; i--) {
    if (/\d/.test(String(row[i] || ""))) return gymNumber_(row[i]);
  }
  return 0;
}

function gymReadDay_(sheet, period, day) {
  if (!sheet) throw new Error("Не найдена ежедневная вкладка: " + gymDayTabName_(period, day));
  const rows = sheet.getRange(1, 1, 56, 19).getDisplayValues();
  if (String(rows[0][0]).indexOf("ФИТНЕС") < 0) {
    throw new Error("Неожиданный формат вкладки: " + sheet.getName());
  }
  const row = function(n) { return rows[n - 1]; };
  const categories = {
    members: gymLastNumber_(row(26)),
    dropIns: gymLastNumber_(row(29)) + gymLastNumber_(row(30)),
    drinks: gymLastNumber_(row(33)) + gymLastNumber_(row(34)),
    nutrition: gymLastNumber_(row(37)) + gymLastNumber_(row(38))
  };
  const count = rows.slice(5, 25).filter(function(entry) {
    return String(entry[1] || "").trim() !== "";
  }).length;
  return {
    day: day,
    date: period + "-" + String(day).padStart(2, "0"),
    subscriptions: count,
    revenue: categories.members + categories.dropIns + categories.drinks + categories.nutrition,
    expenses: gymLastNumber_(row(47)),
    subscriptionRevenue: categories.members,
    categories: categories,
    expenseCategories: [42, 43, 44, 45, 46].map(function(n) {
      return gymLastNumber_(row(n));
    })
  };
}

function gymReadMonth_(spreadsheet, period) {
  const days = [];
  const count = gymDaysInMonth_(period);
  for (let day = 1; day <= count; day++) {
    days.push(gymReadDay_(spreadsheet.getSheetByName(gymDayTabName_(period, day)), period, day));
  }
  return days;
}

function gymTotals_(days) {
  return days.reduce(function(total, day) {
    total.subscriptions += day.subscriptions;
    total.revenue += day.revenue;
    total.expenses += day.expenses;
    return total;
  }, { subscriptions: 0, revenue: 0, expenses: 0 });
}

function gymArchives_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName("Архив");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  const archive = [];
  let current = null;
  rows.forEach(function(row) {
    if (row[0] === "Итог" && /^\d{4}-\d{2}$/.test(String(row[1]))) {
      current = {
        period: String(row[1]),
        goal: gymNumber_(row[4]) || GYM_GOAL,
        subscriptions: gymNumber_(row[3]),
        revenue: gymNumber_(row[5]),
        expenses: gymNumber_(row[6]),
        profit: gymNumber_(row[7]),
        days: []
      };
      archive.push(current);
    } else if (row[0] === "День" && current && row[1] === current.period) {
      current.days.push({
        date: String(row[2]),
        subscriptions: gymNumber_(row[3]),
        revenue: gymNumber_(row[5]),
        expenses: gymNumber_(row[6])
      });
    }
  });
  return archive.sort(function(a, b) { return b.period.localeCompare(a.period); });
}

function gymDashboard_() {
  const spreadsheet = gymSpreadsheet_();
  const period = gymActiveMonth_();
  const days = gymReadMonth_(spreadsheet, period);
  return {
    source: { spreadsheetId: GYM_SHEET_ID, period: period, goal: GYM_GOAL, dayTabs: days.length, archiveFormat: "single-tab-v1" },
    generatedAt: new Date().toISOString(),
    days: days,
    archives: gymArchives_(spreadsheet)
  };
}

function gymArchiveMonth_(spreadsheet, period) {
  let sheet = spreadsheet.getSheetByName("Архив");
  if (!sheet) {
    const report = spreadsheet.getSheetByName("Отчет_Сент_2026");
    sheet = report ? spreadsheet.insertSheet("Архив", report.getIndex()) : spreadsheet.insertSheet("Архив");
    sheet.getRange(1, 1, 1, 12).setValues([[
      "Тип", "Месяц", "Дата", "Абонементы", "Цель", "Выручка",
      "Расходы", "Прибыль / убыток", "Абонементы ₽", "Разовые ₽", "Напитки ₽", "Спортпит ₽"
    ]]);
    sheet.setFrozenRows(1);
  }
  const headers = sheet.getRange(1, 1, 1, 12).getValues()[0];
  if (headers[0] !== "Тип" || headers[1] !== "Месяц" || headers[2] !== "Дата") {
    throw new Error("Вкладка «Архив» имеет другой формат. Данные не изменены.");
  }
  const existing = gymArchives_(spreadsheet).some(function(item) { return item.period === period; });
  if (existing) return;
  const days = gymReadMonth_(spreadsheet, period);
  const totals = gymTotals_(days);
  const categoryTotal = function(key) {
    return days.reduce(function(sum, day) { return sum + day.categories[key]; }, 0);
  };
  const data = [[
    "Итог", period, "", totals.subscriptions, GYM_GOAL, totals.revenue,
    totals.expenses, totals.revenue - totals.expenses,
    categoryTotal("members"), categoryTotal("dropIns"),
    categoryTotal("drinks"), categoryTotal("nutrition")
  ]].concat(days.map(function(day) {
    return [
      "День", period, day.date, day.subscriptions, "", day.revenue,
      day.expenses, day.revenue - day.expenses, day.categories.members,
      day.categories.dropIns, day.categories.drinks, day.categories.nutrition
    ];
  }));
  const startRow = sheet.getLastRow() + 1;
  const missingRows = startRow + data.length - 1 - sheet.getMaxRows();
  if (missingRows > 0) sheet.insertRowsAfter(sheet.getMaxRows(), missingRows);
  sheet.getRange(startRow, 1, data.length, 12).setValues(data);
  sheet.getRange(startRow, 1, 1, 12).setBackground("#d9edc3").setFontWeight("bold");
  sheet.getRange(startRow, 6, data.length, 7).setNumberFormat('#,##0 "₽";-#,##0 "₽"');
}

function gymSetupMonth_(target) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(target || ""))) {
    throw new Error("Некорректный месяц.");
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const current = gymActiveMonth_();
    if (target !== gymNextMonth_(current)) {
      throw new Error("Следующий месяц должен быть " + gymNextMonth_(current) + ".");
    }
    const spreadsheet = gymSpreadsheet_();
    const template = spreadsheet.getSheetByName("День 31");
    if (!template) throw new Error("Не найдена пустая вкладка-шаблон «День 31».");
    const templateData = gymReadDay_(template, GYM_FIRST_MONTH, 31);
    if (templateData.subscriptions || templateData.revenue || templateData.expenses) {
      throw new Error("Вкладка «День 31» не пуста. Создание месяца остановлено.");
    }
    const pending = properties.getProperty("PENDING_MONTH");
    if (pending && pending !== target) throw new Error("Создание другого месяца ещё не завершено.");
    if (!pending) {
      for (let day = 1; day <= gymDaysInMonth_(target); day++) {
        if (spreadsheet.getSheetByName(gymDayTabName_(target, day))) {
          throw new Error("Ежедневная вкладка для нового месяца уже существует.");
        }
      }
      properties.setProperty("PENDING_MONTH", target);
    }
    gymArchiveMonth_(spreadsheet, current);

    const total = gymDaysInMonth_(target);
    let made = 0;
    for (let day = 1; day <= total && made < GYM_BATCH_SIZE; day++) {
      const name = gymDayTabName_(target, day);
      if (spreadsheet.getSheetByName(name)) continue;
      const copy = spreadsheet.insertSheet(name, { template: template });
      const date = new Date(Date.UTC(Number(target.slice(0, 4)), Number(target.slice(5)) - 1, day));
      const label = Utilities.formatDate(date, "UTC", "dd.MM.yyyy");
      copy.getRange("A2").setValue(label + "     День " + String(day).padStart(2, "0"));
      copy.getRange("A48").setValue("ИТОГ НА " + label);
      made++;
    }
    let created = 0;
    for (let day = 1; day <= total; day++) {
      if (spreadsheet.getSheetByName(gymDayTabName_(target, day))) created++;
    }
    const complete = created === total;
    if (complete) {
      properties.setProperty("ACTIVE_MONTH", target);
      properties.deleteProperty("PENDING_MONTH");
    }
    return { complete: complete, created: created, total: total, period: target };
  } finally {
    lock.releaseLock();
  }
}
