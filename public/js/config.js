export const SHEET_SOURCE = {
  spreadsheetId: "16WmzN44H6jCYjgyUQ9WBX58FERS3cTKKjDBThntWs1U",
  gid: "38748627",
  url: "https://docs.google.com/spreadsheets/d/16WmzN44H6jCYjgyUQ9WBX58FERS3cTKKjDBThntWs1U/edit?gid=38748627#gid=38748627",
};

// Anon/public key: safe to ship to the browser, access is scoped by the
// project's row-level security policies (see supabase/migrations).
export const SUPABASE_URL = "https://vhqwvorgsxwoayuwbrzr.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZocXd2b3Jnc3h3b2F5dXdicnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MTYyOTIsImV4cCI6MjA5OTE5MjI5Mn0.G2eJ8rCpS4Rtm6QswkzEtQX-7mRLJGmcsv5DuQmMejg";

export const MONEY_FORMAT = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

export const NUMBER_FORMAT = new Intl.NumberFormat("ru-RU");
