import { timingSafeEqual } from "node:crypto";

const env = () => ({
  url: process.env.SHEET_BRIDGE_URL,
  secret: process.env.SHEET_BRIDGE_SECRET,
  adminToken: process.env.DASHBOARD_ADMIN_TOKEN,
});
const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});
const sameToken = (given, expected) => {
  const a = Buffer.from(given || "");
  const b = Buffer.from(expected || "");
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function handler(event) {
  const settings = env();
  if (event.httpMethod !== "POST") return json(405, { error: "Требуется запрос POST." });
  if (!settings.url || !settings.secret || !settings.adminToken) {
    return json(503, { error: "Создание месяцев пока не подключено. См. настройку Google Apps Script в README.md." });
  }
  const suppliedToken = (event.headers.authorization || event.headers.Authorization || "")
    .replace(/^Bearer\s+/i, "");
  if (!sameToken(suppliedToken, settings.adminToken)) {
    return json(401, { error: "Неверный ключ администратора." });
  }
  let request;
  try {
    request = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Некорректный запрос." });
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(request.period || "")) {
    return json(400, { error: "Выберите корректный месяц." });
  }
  try {
    const capabilitiesResponse = await fetch(settings.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "capabilities", secret: settings.secret }),
      signal: AbortSignal.timeout(10000),
    });
    if (!capabilitiesResponse.ok) throw new Error(`Google Apps Script returned ${capabilitiesResponse.status}`);
    const capabilities = await capabilitiesResponse.json();
    if (!capabilities.ok || capabilities.archiveFormat !== "single-tab-v1") {
      return json(409, { error: "Обновите и заново разверните Apps Script из файла google-apps-script/Code.gs. Старый код сохраняет архив в отдельные вкладки." });
    }
    const response = await fetch(settings.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "setupMonth",
        period: request.period,
        secret: settings.secret,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Google Apps Script returned ${response.status}`);
    const result = await response.json();
    if (!result.ok) return json(409, { error: result.error || "Не удалось создать месяц." });
    return json(200, result);
  } catch (error) {
    console.error("Month setup failed:", error);
    return json(502, { error: "Нет связи с Google Apps Script. Повторите попытку: уже созданные новые вкладки будут использованы." });
  }
}
