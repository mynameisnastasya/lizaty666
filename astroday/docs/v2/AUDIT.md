# AUDIT — ASTRODAY: аудит действующей системы (18.11.2026)

Все утверждения ниже проверены инструментами в этой сессии: Railway MCP, read-only пробы в Railway, логи, GitHub. Где проверка не удалась, это сказано прямо.

## 1. Инфраструктура (Railway, проект `liz-ty666-migration`, окружение `staging` — единственное)

| Сервис | Тип | Роль | Источник кода |
|---|---|---|---|
| `liz-ty666-payment-api` | Bun Function (`function-bun:1.4.4`), HTTP | Telegram-бот @Lizty666bot (webhook), API кабинета, YooKassa, вход через Telegram | Загрузчик распаковывает `ASTRODAY_API_PKG_1..6` (brotli+base64), сверяет SHA-256 и импортирует. Релиз `astroday-api-20261118-claude-polish1`, **SHA `33744dc6…`** |
| `liz-ty666-scheduler` | Bun Function, cron `*/5` | Сверка платежей, выполнение заказов, подготовка и доставка прогнозов покупателям, уведомления админам | Загружает код из таблицы `astroday_release_artifacts` по SHA **`c33aa437…`** (`astroday-scheduler-20261118-facts-fix1`) |
| `astroday-daily-7am-consented-notify` | Bun Function, cron `*/5` | Рассылка тестерам в 07:00 по Кемерово (окно 07:00–07:19) из `liz_tester_forecasts` | Исходник в самой функции (`ASTRODAY_DAILY7_V2`) |
| `astroday-tester-welcome-and-kiss` | Bun Function, cron `*/5` | Приветствие и стикер новым тестерам | Исходник в функции |
| `astroday-join-test-readiness-check` | Bun Function, без cron | Служебная диагностика. В этой сессии использовалась для read-only проб | — |
| `liz-astro-v2-placidus` | `python:3.12`, приватная сеть `liz-astro-v2:8080` | Расчётный движок: Swiss Ephemeris (Moshier), тропический зодиак, Placidus | `engine.py`/`api.py` из `ASTRO_V2_ENGINE_B64`/`ASTRO_V2_API_B64`; версия `astro-v2-placidus-swe-2.10` |
| `liz-ty666-preview` | Bun Function | Сайт `lizty666-stage.up.railway.app` (+ `/app`) | Не менялся |
| `Postgres` | postgres-ssl:18, том 500 MB | Все данные | — |
| **новый:** `astroday-engine-v2-candidate` | `python:3.12`, приватная сеть `astroday-engine-v2c:8080` | Тот же движок + модуль `lunar.py` (лунные сутки, Луна без курса) | `ASTRO_V2C_*_GZ`; создан в этой сессии с разрешения владельца |

## 2. Исходники

- GitHub `mynameisnastasya/lizaty666`, ветка `astroday-backend`: исходники (`original/*`, `shared/*`, `tools/build-release.mjs`, тесты) до релиза r4 (17.11).
- **Расхождение:** в Railway работают два более поздних релиза (`profile-fix1`, `claude-polish1`), которых нет в GitHub. Они были собраны прошлыми сессиями и задеплоены напрямую.
- **Восстановление:** read-only проба получила точный текст развёрнутых API и scheduler (через reference-переменные и таблицу `astroday_release_artifacts`) и выдала diff к артефактам r4. Применение diff к `release/*.mjs` из git даёт **побайтно те же SHA-256** (`33744dc6…`, `c33aa437…`). Результат лежит в `astroday/deployed/` ветки `astroday-2.0` вместе с diff (`api.patch`, `scheduler.patch`) и исходником движка (`deployed/engine/*`, sha `0b12474b…`).
- Проверить, что `ENGINE_SRC_B64` пробы равен `ASTRO_V2_ENGINE_B64` движка, напрямую не удалось. Косвенная проверка: кандидат, собранный из этого исходника, на одинаковом запросе `/v2/forecast` даёт ответ, **побайтно равный** ответу боевого движка (проба #4, `parity.same=true`).
- Приватный репозиторий `mynameisnastasya/astro` этой сессии недоступен.
- **Пуш в GitHub из этой сессии невозможен:** репозиторий не входит в разрешённые источники сессии (403 от git-прокси). Ветка `astroday-2.0` пока существует только локально в рабочей копии сессии.

## 3. База данных (64 таблицы)

Ключевые таблицы: `liz_clients` (20), `liz_birth_profiles` (13), `liz_subscriptions`, `liz_astro_testers` (19), `astroday_tester_joins`, `liz_tester_forecasts` (665 одобренных текстов тестеров), `liz_daily_messages` (покупатели), `astroday_daily_delivery_claims`, `liz_orders`, `astroday_fulfillment_jobs`, `astroday_openai_usage`, `liz_geo_cities` (70 030 городов), `astroday_release_artifacts`. Кроме них — 15+ таблиц-бэкапов от прошлых импортов.
Состояние тестеров: 17 `verified_via_bot / confirmed / trial_granted`, 1 `username_only_unverified / confirmed / trial_granted`, 1 `pending_individual_confirmation / not_granted`.

## 4. OpenAI (подробно — `OPENAI_MODEL_AUDIT.md`)

- Ключ `OPENAI_API_KEY` есть в API, scheduler и пробе. `GET /v1/models` → 200.
- В бою: `OPENAI_EDITORIAL_MODEL = gpt-6-sol`, Responses API + JSON Schema (`shared/liza-editorial.mjs`).
- В каталоге проекта есть `gpt-6.2-astra` и `gpt-6.2-sol` (созданы 2026-11), более новых моделей нет.

## 5. Как работают прогнозы сейчас

- **Тестеры:** 665 заранее одобренных текстов в `liz_tester_forecasts`. Рассылка в 07:00 Кемерово для всех, независимо от часового пояса. При изменении анкеты утренний текст не отправляется, вместо него приходит «посчитаю заново» и генерация по кнопке.
- **Покупатели:** генерация по дням через scheduler (`ensureDailyForecast`), один день за раз; OpenAI `gpt-6-sol`; доставка в `delivery_hour_local` (только целые часы).
- **Нет:** предварительной генерации на весь период, «прогноза на завтра», расчёта лунных суток и Луны без курса в рантайме (docs/problems.md это признаёт), дней Грабителя богатства, выбора минут доставки, выбора обращения.

## 6. Диагностические события из логов

| Событие | Что означает (по коду) | Вывод |
|---|---|---|
| `ASTRO_JOIN_OK` | Тестер впервые привязан к анкете (`astrodayJoinOnce` → `previousJoin.length===0`) | Норма |
| `ASTRO_BUTTON_OK {action}` | Нажатие кнопки тестером (`astroday_join`/`astroday_today`) | Норма. Повторные `astroday_join` от одного id (491395351, 1007070241 и др.) — это повторные нажатия «Я в деле»: человек не понимал, что уже подключён |
| `WELCOME_SKIPPED` | Приветствие не отправлено: уже было или профиль не готов | Норма, не ошибка |
| `ASTRODAY_ACCESS_SYNC` с нулями | Синхронизация доступа без изменений | Норма |
| HTTP 401 | Вход в Mini App с новым полем `signature` (исправлено в r4) и попытки без валидной сессии | После r4 401 означает только невалидную подпись или сессию |
| `INVITE_ERROR profile_not_match` (readiness-check, 05:33) | Диагностическая функция прошлой сессии | Не продуктовая ошибка |

## 7. Безопасность (проверено самотестом API при каждом старте: 16/16)

HMAC Telegram initData (+ поле signature), отказ на подделку/дубликаты/устаревание, валидация часовых поясов и DST, YooKassa: точная сумма, без дробных копеек, стабильный idempotency payload. Секреты MCP-инструментом не читаются (OAuth возвращает только имена переменных). В этой сессии значения секретов не выводились и не сохранялись.

## 8. Базовый прогон старых тестов на развёрнутом коде

`bun test test/` (локальный PostgreSQL 16): **62 pass / 8 fail**. Причины падений:
- loader/packaged (3): тесты ждут SHA r4, а развёрнут более новый релиз. Ожидаемо.
- «Кнопка “Мой прогноз” у тестера отдаёт одобренный текст тестера»: поведение изменено в `profile-fix1`, теперь проверяется актуальность анкеты.
- 4 сценария «original/артефакт планировщика»: завязаны на r4-артефакты.
Продуктовых регрессий среди падений не найдено.
