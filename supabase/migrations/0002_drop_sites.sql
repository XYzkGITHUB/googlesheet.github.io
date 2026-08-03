-- Teardown for the "sites" directory feature, which was built and then removed.
-- Safe to run whether or not the table was ever created: every statement is
-- guarded with IF EXISTS. Dropping the table drops its policies too, but they
-- are listed explicitly so the intent stays readable in migration history.
--
-- Run this only if you already applied the (now deleted) 0002_sites.sql.
-- If you never created the table, running it is a harmless no-op.

drop policy if exists "sites_select_anon" on public.sites;
drop policy if exists "sites_insert_anon" on public.sites;
drop policy if exists "sites_update_anon" on public.sites;
drop policy if exists "sites_delete_anon" on public.sites;

drop table if exists public.sites;
