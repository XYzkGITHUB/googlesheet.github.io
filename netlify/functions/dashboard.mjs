const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Требуется запрос GET." });
  const url = process.env.SHEET_BRIDGE_URL;
  const secret = process.env.SHEET_BRIDGE_SECRET;
  if (!url || !secret) return json(503, { error: "Google Apps Script пока не подключён." });
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "dashboard", secret }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error(`Google Apps Script returned ${response.status}`);
    const result = await response.json();
    if (!result.ok) return json(502, { error: result.error || "Не удалось получить данные." });
    delete result.ok;
    return json(200, result);
  } catch (error) {
    console.error("Google Apps Script dashboard failed:", error);
    return json(502, { error: "Нет связи с Google Apps Script." });
  }
}
