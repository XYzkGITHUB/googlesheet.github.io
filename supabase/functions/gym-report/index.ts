// Replaces the /api/gym-report proxy that used to live in server.js.
// Deployed as a Supabase Edge Function so the browser never has to talk to
// docs.google.com directly (that request needs a server-side hop for CORS
// and to scrape the sheet-tab names out of the workbook HTML).

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
};

const defaultSource = {
  spreadsheetId: "16WmzN44H6jCYjgyUQ9WBX58FERS3cTKKjDBThntWs1U",
  gid: "38748627",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders,
    },
  });
}

function getParam(url: URL, name: string, fallback: string) {
  return url.searchParams.get(name) || fallback;
}

async function fetchTextWithRetry(url: string, attempts = 3) {
  let lastError: unknown;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      return { response, text: await response.text() };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchGoogleSheet(url: URL) {
  const spreadsheetId = getParam(url, "spreadsheetId", defaultSource.spreadsheetId);
  const gid = getParam(url, "gid", defaultSource.gid);
  const workbookUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit?gid=${encodeURIComponent(gid)}`;
  const { text: workbookHtml } = await fetchTextWithRetry(workbookUrl);
  const sheetNames = [...workbookHtml.matchAll(/docs-sheet-tab-caption">([^<]+)<\/div>/g)]
    .map((match) => match[1].replace(/&amp;/g, "&").trim())
    .filter(Boolean);

  if (sheetNames.length) {
    const sheets = await mapWithConcurrency(sheetNames, 8, async (name) => {
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
      const { text: csv } = await fetchTextWithRetry(sheetUrl);
      return { name, csv };
    });

    return json(200, {
      ok: true,
      source: { spreadsheetId, gid },
      fetchedAt: new Date().toISOString(),
      sheets,
    });
  }

  const csvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  const { response, text } = await fetchTextWithRetry(csvUrl);
  const looksLikeLogin = text.includes("ServiceLogin") || text.includes("Войдите в свой аккаунт Google");
  const looksLikeCsv = response.ok && !looksLikeLogin && !text.trimStart().startsWith("<!DOCTYPE html");

  if (!looksLikeCsv) {
    return json(403, {
      ok: false,
      code: "GOOGLE_SHEET_NOT_PUBLIC",
      message: "Google Sheet не отдает CSV без входа. Откройте доступ по ссылке: Просмотр для всех, у кого есть ссылка.",
      source: { spreadsheetId, gid },
    });
  }

  return json(200, {
    ok: true,
    source: { spreadsheetId, gid },
    fetchedAt: new Date().toISOString(),
    csv: text,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    return await fetchGoogleSheet(url);
  } catch (error) {
    return json(500, {
      ok: false,
      code: "SERVER_ERROR",
      message: error instanceof Error ? error.message : "Unknown server error",
    });
  }
});
