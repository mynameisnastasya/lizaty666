# Эксплуатация ASTRODAY

## Как код попадает в Railway

1. Изменения — в `shared/*.mjs` или патчах `tools/build-release.mjs` (база — `original/*`, развёрнутые версии, SHA-256 сверены).
2. `bun tools/build-release.mjs` → `release/api.mjs`, `release/scheduler.mjs`; `bun test test/` (локальный PostgreSQL).
3. Коммит в ветку `astroday-backend` (репозиторий `mynameisnastasya/lizaty666`), push.
4. `bun tools/package-git.mjs <commit>` → маленькие загрузчики `release/deploy/{api,scheduler}-loader.ts`.
5. Railway: функция `liz-ty666-payment-api` ← `api-loader.ts`, функция `liz-ty666-scheduler` ← `scheduler-loader.ts`,
   функция `astroday-daily-7am-consented-notify` ← `release/daily7.ts` (самодостаточный файл).
   Загрузчик скачивает код по закреплённому коммиту, проверяет SHA-256, сохраняет копию в `astroday_release_artifacts`
   и при недоступности GitHub запускает проверенную копию из базы.
6. Проверка после выкладки: логи `ASTRODAY_SOURCE_OK`, `GET /health` (поле `release`), `GET /v1/release-readiness`
   (`lastSchedulerTick` свежий), `/start` и `/status` в боте с тестового аккаунта.

## Откат

- API: `redeploy` предыдущего деплоя (`acae37a3-d964-4e2c-a731-9bf12f5accfb` — версия до 17.11) или загрузчик с прошлым коммитом.
- Планировщик: `18e7cf39-8d74-4dcf-8188-1dc6c47da040`. Рассылка тестерам: `790cb27f-089e-48c6-a293-e27e3c285905`.
- Схема БД меняется только добавлением (`ADD COLUMN IF NOT EXISTS`, новые таблицы) — старая версия кода с ней работает.
- Переменные OpenAI можно выключить без отката: `OPENAI_EDITORIAL_ENABLED=false` → расчётный текст.

## Инструкция владельцу: где что видно

**В группе с ботом @paymenlizty_bot** (автоматически): 🛒 создан заказ · 💳 оплата прошла (сумма, срок, первая/продление)
· 📝 сохранена анкета · ✅ отправлен прогноз (кому, день, источник текста и сам текст) · 👁 прогноз по запросу
· 📬 итог рассылки тестерам · ⚠️/🟠/🚨 ошибки: OpenAI не ответил, ушёл расчётный текст, не доставлено (403 — бот заблокирован),
неясный исход отправки, платёж не совпал с заказом.

**SQL (Railway → Postgres → Data → Query)**:

```sql
-- оплаты и выдача
SELECT o.created_at, c.telegram_username, o.plan_code, o.amount_kopeks/100 AS rub, o.status, o.activated_at, o.needs_review, j.state AS fulfillment, j.last_error
FROM liz_orders o JOIN liz_clients c ON c.telegram_id=o.telegram_id LEFT JOIN astroday_fulfillment_jobs j ON j.order_id=o.id ORDER BY o.created_at DESC LIMIT 30;

-- доступ конкретного человека
SELECT c.telegram_username, s.valid_until, s.source, c.notify_enabled, p.consented_to_daily, p.time_zone, p.delivery_hour_local
FROM liz_clients c LEFT JOIN liz_subscriptions s USING(telegram_id) LEFT JOIN liz_birth_profiles p USING(telegram_id) WHERE c.telegram_username ILIKE 'ник';

-- ошибки генерации сегодня
SELECT telegram_id, forecast_date, generation_state, text_source, editorial_attempts, editorial_error, error_code FROM liz_daily_messages
WHERE forecast_date >= CURRENT_DATE - 1 AND (generation_state <> 'ready' OR text_source = 'calculated_fallback');

-- проблемы доставки
SELECT telegram_id, forecast_date, status, error_code, attempt_count FROM liz_daily_messages WHERE status IN ('failed_permanent','needs_review') ORDER BY forecast_date DESC;
SELECT * FROM astroday_daily_delivery_claims WHERE status NOT IN ('sent') ORDER BY forecast_day DESC;

-- расходы OpenAI
SELECT * FROM astroday_openai_usage ORDER BY usage_day DESC LIMIT 14;
```

**Логи Railway** (без персональных данных): `PAYMENT_ACTIVATED`, `FULFILLMENT_*`, `FORECAST_READY`, `FORECAST_EDITORIAL_FAIL`,
`ASTRODAY_WORKER_DELIVERY`, `DAILY7_AUDIT`, `TG_UPDATE_FAILED`.

## Безопасность

Секреты — только в переменных Railway. Ключ бота уведомлений, присланный в чат 17.11, следует перевыпустить:
@BotFather → /mybots → @paymenlizty_bot → API Token → Revoke, новое значение — в `ADMIN_NOTIFY_BOT_TOKEN`
у `liz-ty666-payment-api` и `liz-ty666-scheduler` (и в сайт, если он использует этот бот для оплат).
