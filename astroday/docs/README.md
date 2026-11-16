# ASTRODAY — бэкенд (бот, API, планировщик, рассылка тестерам)

Ветка `astroday-backend` хранит исходники сервисов Railway, которые раньше существовали только
в упакованном виде внутри конфигурации функций. Сборка воспроизводима: `tools/build-release.mjs`
применяет проверяемые патчи к развёрнутой версии, сверенной по SHA-256.

## Карта компонентов (Railway, проект `liz-ty666-migration`, окружение `staging`)

| Компонент | Сервис | Роль |
|---|---|---|
| Telegram-бот + API | `liz-ty666-payment-api` (Bun function, домен `lizty666-api-stage.up.railway.app`) | Вебхук бота `@Lizty666bot`, вход через Telegram (Mini App / ссылка), анкета, оплата YooKassa, вебхук YooKassa, прогноз по запросу, статус заказа |
| Планировщик | `liz-ty666-scheduler` (cron */5) | Сверка платежей с YooKassa, выполнение оплаченных заказов (первый результат), подготовка прогнозов (OpenAI), доставка покупателям, отправка уведомлений владельцам |
| Рассылка тестерам | `astroday-daily-7am-consented-notify` (cron */5) | 07:00 по Кемерово, тексты из `liz_tester_forecasts`, позднее окно до 12:00 |
| Приветствие тестерам | `astroday-tester-welcome-and-kiss` (cron */5) | Приветствие + стикер новым подтверждённым тестерам, синхронизация тестового доступа |
| Расчётный движок | `liz-astro-v2-placidus` (Python, только приватная сеть) | Swiss Ephemeris (Moshier), тропический зодиак, Placidus, аспекты и события дня |
| Сайт | `liz-ty666-preview` (домен `lizty666-stage.up.railway.app`) | Снимок фронтенда Floot из GitHub (закреплённый коммит) + встроенные страницы входа/оплаты, прокси к API |
| База | `Postgres` | Все данные |
| OpenAI | Responses API | Авторский текст Лизы по рассчитанным фактам (`shared/liza-editorial.mjs`) |
| Уведомления владельцам | бот `@paymenlizty_bot` → закрытая группа | Заказы, оплаты, каждый отправленный прогноз с текстом, ошибки |

Поток данных прогноза: анкета → движок (`/v2/forecast`) → `getEditorialBrief` (структурированные факты)
→ OpenAI (только смысл фактов, без персональных данных) → детерминированная проверка → сборка разделов
с фактами из расчёта → `liz_daily_messages` → доставка частями с дедупликацией.

## Сборка и тесты

```
bun tools/build-release.mjs        # release/api.mjs, release/scheduler.mjs из original/* + shared/*
bun tools/build-testkit.mjs        # модуль для модульных тестов редакционной части
bun test test/                     # нужен локальный PostgreSQL на 127.0.0.1:55432 (см. test/harness.mjs)
```
Тесты запускают настоящий код сервисов против локальной базы; Telegram, YooKassa, движок и OpenAI имитируются
(`test/preload.mjs` перехватывает исходящие запросы). Сверка движка с независимым расчётом —
`test/engine-reference.test.mjs` (данные движка захвачены с работающего сервиса).

Документы: `docs/problems.md` (что было сломано и как исправлено), `docs/bot-registry.md`,
`docs/states.md`, `docs/buyer-path.md`, `docs/liza-editorial-prompt-v1.md`, `docs/config.example.env`,
`docs/runbook.md` (развёртывание, откат, инструкция владельцу), `docs/verification.md`.
