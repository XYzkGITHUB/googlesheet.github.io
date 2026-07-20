-- Replaces data/monthly-archive.json as the store for the yearly report.
create table if not exists public.monthly_archive (
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  label text not null,
  period_start text not null default '',
  period_end text not null default '',
  active_days integer not null default 0,
  totals jsonb not null,
  ranking jsonb not null default '[]'::jsonb,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.monthly_archive enable row level security;

-- Dashboard is unauthenticated (same trust model as the old server.js endpoint,
-- which accepted writes from anyone who could reach it). Anon key can read/write,
-- but never delete, rows.
create policy "monthly_archive_select_anon" on public.monthly_archive
  for select to anon using (true);

create policy "monthly_archive_insert_anon" on public.monthly_archive
  for insert to anon with check (true);

create policy "monthly_archive_update_anon" on public.monthly_archive
  for update to anon using (true) with check (true);

-- Seed with the history that used to live in data/monthly-archive.json.
insert into public.monthly_archive (month, label, period_start, period_end, active_days, totals, ranking, saved_at, updated_at)
values
  (
    '2026-06',
    'июнь 2026 г.',
    '2026-06-01',
    '2026-06-30',
    9,
    '{"membershipsCount":0,"income":{"memberships":66000,"singleTraining":20250,"drinks":11110,"sportFood":18500,"other":0},"expenses":{"rent":0,"salary":0,"marketing":0,"utilities":0,"household":0,"sportFood":0,"drinks":0,"other":91090},"totalIncome":115860,"totalExpense":91090,"netProfit":24770,"balance":24770}'::jsonb,
    '[{"key":"memberships","label":"Абонементы","value":66000,"share":56.965302951838424},{"key":"singleTraining","label":"Разовые","value":20250,"share":17.47799067840497},{"key":"sportFood","label":"Спортпит","value":18500,"share":15.96754703953047},{"key":"drinks","label":"Напитки","value":11110,"share":9.589159330226135}]'::jsonb,
    '2026-07-09T17:37:49.685Z',
    '2026-07-09T19:34:09.948Z'
  ),
  (
    '2026-07',
    'июль 2026 г.',
    '2026-07-01',
    '2026-07-31',
    11,
    '{"membershipsCount":0,"income":{"memberships":70000,"singleTraining":24000,"drinks":12900,"sportFood":21320,"other":0},"expenses":{"rent":0,"salary":0,"marketing":0,"utilities":0,"household":0,"sportFood":0,"drinks":0,"other":95933},"totalIncome":128220,"totalExpense":95933,"netProfit":32287,"balance":32287}'::jsonb,
    '[{"key":"memberships","label":"Абонементы","value":70000,"share":54.59366713461239},{"key":"singleTraining","label":"Разовые","value":24000,"share":18.717828731867105},{"key":"sportFood","label":"Спортпит","value":21320,"share":16.627671190141943},{"key":"drinks","label":"Напитки","value":12900,"share":10.060832943378568}]'::jsonb,
    '2026-07-11T11:58:35.205Z',
    '2026-07-11T17:19:53.991Z'
  )
on conflict (month) do nothing;
