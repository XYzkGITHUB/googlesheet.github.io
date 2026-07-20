# Gym Owner Dashboard

Одностраничный dashboard для мониторинга статистики спортзала.

## Запуск (локально)

```bash
node server.js
```

После запуска открыть:

```text
http://localhost:4173
```

`server.js` теперь только раздает статику из `public/`. Загрузка данных
и хранение годового архива идут напрямую из браузера в Supabase.

## Подключение Google Sheet

Ссылка на таблицу настроена в `public/js/config.js` (`SHEET_SOURCE`).

Чтобы сайт получал живые данные, таблица должна быть доступна для чтения без входа:

1. Открыть Google Sheet.
2. Нажать `Поделиться`.
3. Выбрать `Все, у кого есть ссылка`.
4. Права: `Просмотр`.

Если таблица закрыта, сайт показывает демо-данные и предупреждение.

## Supabase (бэкенд)

Backend теперь полностью на Supabase — сервера-посредника на Node в
проде не нужно, только для локальной раздачи статики.

- `supabase/migrations/0001_monthly_archive.sql` — таблица `monthly_archive`
  (замена `data/monthly-archive.json`) с RLS-политиками для анонимного
  чтения/записи (без удаления) — та же модель доверия, что была у старого
  `/api/monthly-archive` эндпоинта.
- `supabase/functions/gym-report` — Edge Function, которая проксирует
  Google Sheet (замена `/api/gym-report` из старого `server.js`). Нужен
  серверный прокси, потому что запрос к `docs.google.com` не проходит
  из браузера напрямую (CORS + разбор HTML вкладок листа).
- `public/js/config.js` — `SUPABASE_URL` и `SUPABASE_ANON_KEY`. Anon key
  безопасно светить в браузере: доступ ограничен политиками RLS, не
  правами ключа.
- `public/js/supabaseClient.js` — клиент `@supabase/supabase-js`
  (подключается прямо с CDN, без сборщика).
- `public/js/api.js` — обращается к Edge Function за отчетом и к таблице
  `monthly_archive` через Supabase REST/JS-клиент.

### Применить схему и функцию к своему проекту

```bash
supabase link --project-ref <ваш-project-ref>
supabase db push                       # применяет supabase/migrations
supabase functions deploy gym-report   # деплоит Edge Function
```

Если нет доступа к CLI/логину проекта — можно вставить содержимое
`supabase/migrations/0001_monthly_archive.sql` в SQL Editor в дашборде
Supabase, а код `supabase/functions/gym-report/index.ts` — в раздел
Edge Functions через веб-интерфейс.

## Архитектура

- `server.js` — локальный статический сервер (только для разработки).
- `supabase/` — SQL-схема и Edge Function (бэкенд в проде).
- `public/js/api.js` — загрузка данных из Supabase.
- `public/js/supabaseClient.js` — инициализация Supabase-клиента.
- `public/js/csv.js` — CSV-парсер.
- `public/js/normalizer.js` — приведение строк таблицы к единой структуре.
- `public/js/analytics.js` — расчет итогов, динамики, сравнений и выводов.
- `public/js/ui.js` — отрисовка интерфейса.
- `public/css/styles.css` — визуальный стиль dashboard.

## Расширение

Новые категории доходов и расходов добавляются через matcher-списки в `public/js/normalizer.js` и подписи в `public/js/ui.js`.
