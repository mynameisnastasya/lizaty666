# PROJECT_AUDIT — LIZ_TY666 migration

> Рабочий документ; только подтверждённые факты. Обновлять **после каждого этапа**. Этот GitHub-репозиторий публичный: не сохранять здесь секреты, персональные данные, дампы БД или пригодные к эксплуатации подробности критических уязвимостей. Чувствительные материалы — только в отдельно согласованном приватном хранилище.

## Метаданные
- План создан: 2026-11-13, около 22:45 WITA (Asia/Makassar; UTC+08:00).
- GitHub: `mynameisnastasya/lizaty666`, ветка `audit/full-migration-2026-11-13`; `main` не меняется.
- Railway: проект `liz-ty666-migration`, окружение `staging`. Production изменения запрещены до отдельного согласования.
- Источник приложения: Floot, проект «LIZ_TY666 — разборы, соляр и обучение» (среди доступных проектов также одноимённый архивный/второй проект; связь ещё не доказана).
- Правила: только разрешённый доступ; никакого реального платежа, деплоя, переноса/удаления данных или изменения production без явного согласия; все значимые исправления с тестами/регрессией; backup — только подтверждённый и в безопасном хранилище.
- Классификация дефектов: Critical / High / Medium / Low. Статусы: Planned / In progress / Blocked / Verified / Closed.

## Фактическая автоматизация
- Активно **одно** расписание ChatGPT: первое выполнение **2026-11-13 23:05 WITA**, далее **каждый час**, максимум **24 запуска** (ограниченное повторение). Расписание подтверждено планировщиком, но результат будущих запусков зависит от доступа и состояния задач.
- Шесть GitHub Issues — самостоятельные этапы, выполняемые строго последовательно из того же расписания. Каждый hourly-run выбирает **первый** незавершённый этап; если он требует продолжения, следующие этапы сдвигаются.
- Почему не шесть отдельных автоматизаций: лимит аккаунта — **5 активных задач всего**, в том числе ранее созданная сторонняя задача; Railway Automations для пользователя **не включён**. Три временные отдельные автозадачи этапов 2–4 при переходе к координатору **приостановлены**, чтобы не было конфликтующих запусков. Этапы 5–6 самостоятельных расписаний не имеют, но находятся в едином автоматическом цикле.
- Безопасность: координатор должен проверять журнал и GitHub Issues до каждого запуска, не работать параллельно над одним этапом, фиксировать checkpoints и не делать production/deploy/data-migration без разрешения.
- **Ограничение:** после 24 запусков дальнейшая работа автоматически не гарантируется, если к этому времени задачи не завершены. Потребуется явное продление расписания.

## Почасовой запуск — 2026-11-13, этап 1 (#6), checkpoint 1

- **Статус:** In progress; Floot read-access восстановлен после заявленного сброса лимита. Gate этапа 1 ещё **не** выполнен; #7–#11 не запускались.
- **Конкуренция:** перед работой прочитаны PROJECT_AUDIT.md и Issues #6–#11. Все issues open/Planned, новых отметок In progress за предыдущий час не обнаружено. Рабочая ветка только `audit/full-migration-2026-11-13`.
- **Исследовано (read-only):** `Floot.list_files` для проекта «LIZ_TY666 — разборы, соляр и обучение» (ID в закрытом контексте подключения, без секретов). Получено дерево компонентов, endpoints, helpers, pages, static, зависимостей; отдельно прочитаны `static/__dev/dependencies.json`, `helpers/schema.tsx`, `helpers/db.tsx`, `pages/_index.tsx`, `endpoints/orders/create_POST.ts`, `endpoints/payments/yookassa-webhook_POST.ts`, `static/__dev/migrations/mini-auth-20261110.sql`.
- **Подтверждённая структура:** исходный Floot — React 19 / React Router 6, TSX, PostgreSQL через Kysely и postgres-js, SSR включён; есть библиотеки Stripe, YooKassa-интеграция в helpers, Telegram, astronomy-engine, Zod, bcryptjs, jose. Это **не** просто статический GitHub Pages сайт, описанный в README другого репозитория. Используется переменная окружения **по имени** `FLOOT_DATABASE_URL`; значение не читалось и не записывалось.
- **Карта страниц (по дереву, маршруты требуют runtime-верификации):** `/`, `/app`, `/daily-forecast`, `/daily`, `/fortune`, `/login`, `/payment`, `/payment-return`, `/orders-admin`, `/order-consent`, `/privacy`, `/offer`, `/refunds`, `/requisites`, `/delivery`; семейство `/ezhednevka*` (mini, oplata, legal/consent/cookies/terms/refunds/payments/delivery и др.). Некоторые TSX-файлы короткие и могут быть редиректами — не считать отдельной работающей функцией без проверки.
- **API inventory (по файлам, без вызова):** группы `auth` (login, register, reset, logout, session), `forecast` (register, preview, mini-auth, Telegram, dispatch, checkout, status, settings, places, today, chart, verify), `orders` (create, admin, fulfillment), `payments` (YooKassa checkout/status/webhook, Stripe config, Telegram settings, return, event), `visitor` (events, opt-out, admin). Наличие файлов не означает доступность API.
- **DB inventory (по сгенерированным типам, не live DB):** `Users`, `Sessions`, `LoginAttempts`, `PasswordResetCodes`, `SiteOrderRequests`, `SiteOrderRefunds`, `ForecastClients`, `ForecastOrders`, `ForecastPaymentEvents`, `ForecastMiniSessions`, `ForecastConsentRecords`, `ForecastMessages`, `ForecastTelegramOrders`, `PaymentNotificationOutbox`, `MerchantPaymentSettings`, `MerchantFulfillmentSettings` и другие. Реальные ограничения, индексы и количество строк **не** проверены. SQL-миграция `mini-auth-20261110.sql` описывает мини-сессии и согласия; факт применения в БД неизвестен.
- **Платёжный read-only обзор:** `endpoints/orders/create_POST.ts` проверяет origin, content-type, размер тела, каталог, контакт, лимит заявок; `endpoints/payments/yookassa-webhook_POST.ts` принимает уведомления и передаёт их на серверную сверку с провайдером. **Не утверждается**, что защита от дублей, валидация и все состояния платежей доказанно корректны: необходимы изучение helpers и sandbox-тесты в #9.
- **Особенность версии:** Floot сообщил, что после последней публикации имеются неопубликованные изменения в четырёх helper/endpoint-файлах. Это риск несоответствия исходного рабочего дерева опубликованной версии; необходима отдельная сверка, **не** выполнять publish.
- **Подтверждённые дефекты продукта:** пока нет. **Риски:** MIG-002 и MIG-003 сохраняются, MIG-001 (лимит) снят для чтения; новый риск MIG-005 **High / Open / неподтверждённый дефект** — несоответствие опубликованной версии Floot и текущих файлов, требуются версии и diff.
- **Исправления:** только документирование в рабочей Git-ветке, без правок исходного приложения, DB, Railway или Floot.
- **Тесты:** PASS — чтение дерева Floot и семи файлов; PASS — статическая инвентаризация API/страниц/типов БД; NOT RUN — build, typecheck, unit/integration/E2E, живые запросы к API, платежи, backup/restore. PASS означает лишь доступность и анализ файлов, не работоспособность приложения.
- **Блокеры:** резервные копии в приватном согласованном хранилище и restore proof отсутствуют; полный экспорт и схема live БД ещё не выполнены. Потребуется продолжение этапа 1.
- **Согласовать:** место безопасного хранения резервной копии и разрешённый способ выгрузки; никаких дампов в публичный GitHub.
- **Следующий checkpoint:** на следующем часовом запуске продолжить **только #6**: исследовать оставшиеся важные helpers/endpoints, schema relations, интеграции, diff published vs working и список обязательных функций; не начинать #7 до закрытия gate.


## Почасовой запуск — 2026-11-14 01:05 WITA, этап 1 (#6), checkpoint 2

- **Статус:** In progress; #6 остаётся первым незавершённым, #7–#11 не допущены. Проверены журнал и все шесть issues; в GitHub Issue #6 комментариев о свежей параллельной работе не обнаружено, последняя запись checkpoint 1 от 23:05 WITA. Запуск начат после истечения часового защитного окна.
- **Read-only факты Floot:** повторно получено дерево проекта (version `1794534939312`), подтверждённые React/TSX страницы, endpoint-файлы, серверные helpers, spec-файлы и зависимости; прочитан `static/__dev/history.md`, а также код `helpers/yooKassa.tsx`, `helpers/yooKassaReconcile.tsx`, `helpers/forecastRubPayments.tsx`, `helpers/forecastSession.tsx`, `helpers/getServerUserSession.tsx`, `helpers/forecastMiniAuth.tsx`, `helpers/forecastPlans.tsx`, `helpers/forecastDispatch.tsx` (только статический просмотр, без вызова API). Названия/значения чувствительных данных в публичный журнал не переносились.
- **Опубликованная версия подтверждена Floot:** live URL `https://liz-ty666-academy.floot.app`, published `2026-11-13T01:41:43Z`, source digest SHA-256 `9abd6f24259e605bbf4463dd28cdf011ba200619752c6b801a0a537af7f3fd6d`, 464 файлов. История подтверждает **четыре неопубликованных изменённых/созданных файла**: `helpers/forecastPilot`, `endpoints/forecast/rub-status_GET`, `helpers/forecastOwnerTest`, `endpoints/forecast/owner-test_POST`. Это **различие версий**, а не подтверждённый баг; публикацию не выполнять.
- **Блокер MIG-005 уточнён:** Floot сообщает, что **скачивание или сравнение опубликованного релиза доступно только на платном плане**. По текущему доступу невозможно подтвердить полный byte-for-byte diff или проверенную резервную копию published snapshot. Не обходить ограничение; запросить у пользователя согласованный легальный способ экспорта/upgrade и приватное хранилище.
- **Функциональность, подлежащая сохранению (дополнение к реестру):** формы регистрации/входа/сброса пароля; личный прогноз/астрологические данные; Telegram-бот и mini-app; web checkout и возврат; YooKassa и предусмотренные Stripe-компоненты; заявки, админ-заказы, fulfillment/delivery, юридические страницы; согласие на аналитику и opt-out. Наличие в дереве не означает успешный runtime.
- **История релиза:** предыдущие Floot checkpoints описывают проверку отдельных тестовых наборов и typecheck, но **это исторические заявления**, не результат текущего запуска. Список семи endpoints, не вызываемых страницами/компонентами, отмечен Floot как потенциально внешние/неиспользуемые; не удалять без трассировки и подтверждения владельца.
- **Дефекты:** новых подтверждённых runtime-дефектов нет. Риски MIG-002, MIG-003, MIG-004, MIG-005 остаются High (risk, not confirmed defect). Отдельно не проверены реальные constraints/indexes, строки БД, экспорт и восстановление.
- **Изменения:** только PROJECT_AUDIT.md и отчёт в Issue #6 на рабочей Git-ветке; Floot/Railway/production не изменены. **Тесты:** PASS — доступность read-only tree/history/publish status и статический просмотр helpers; BLOCKED — downloaded published release, full diff, verified backup/restore; NOT RUN — build, typecheck, E2E, payments, DB writes, live payment API.
- **Следующий checkpoint:** продолжить #6, детализировать связи таблиц и реестр функций; подготовить безопасный план экспорта и согласовать приватное хранилище. Не переходить к #7 до подтверждённого gate.

## Шесть этапов и зависимости
| № | GitHub Issue | План WITA | Зависимость | Статус |
|---|---|---|---|---|
| 1 | [#6 — инвентаризация](https://github.com/mynameisnastasya/lizaty666/issues/6) | 13 ноя 23:05 | Доступ к Floot/после сброса лимита | In progress — checkpoint 1 |
| 2 | [#7 — архитектура и миграция](https://github.com/mynameisnastasya/lizaty666/issues/7) | 14 ноя 00:05 | Результат этапа 1 | Planned — gate pending |
| 3 | [#8 — бизнес-логика](https://github.com/mynameisnastasya/lizaty666/issues/8) | 14 ноя 01:05 | Результат этапов 1–2 | Planned — gate pending |
| 4 | [#9 — платежи/безопасность](https://github.com/mynameisnastasya/lizaty666/issues/9) | 14 ноя 02:05 | Результат этапов 1–3 | Planned — gate pending |
| 5 | [#10 — UX/UI](https://github.com/mynameisnastasya/lizaty666/issues/10) | 14 ноя 03:05 | Результат этапов 1–4 | Planned — gate pending |
| 6 | [#11 — регрессия/релиз](https://github.com/mynameisnastasya/lizaty666/issues/11) | 14 ноя 04:05 | Результат этапов 1–5 | Planned — gate pending |

**Правило gate:** если текущий этап не завершён или предыдущий остаётся In progress/Blocked, следующий этап **не** начинает конфликтующие изменения. Он фиксирует причину и переносит выполнение/инициирует новую проверку доступным способом. Запланированное время — момент проверки возможности начать, а не обязательство завершить этап за час. Одновременное изменение файлов/БД несколькими этапами запрещено.

## Предварительные наблюдения (read-only, 2026-11-13)

### Подтверждено
1. GitHub-доступ к `mynameisnastasya/lizaty666`: `main`, root содержит HTML-страницы, `app.js`, CSS, `tests/`, `playwright.config.js`, `package.json`. README описывает статический сайт (HTML5/CSS3/vanilla JS, GitHub Pages). **Не доказано**, что этот репозиторий содержит полный исходный код Floot-приложения или Railway Functions.
2. Railway `staging`: обнаружены сервисы `liz-ty666-scheduler`, `migration-readiness-smoke`, `liz-ty666-payment-api`, `liz-ty666-preview`, `Postgres`. У всех пяти на момент проверки последняя Railway deployment state `SUCCESS` и среда не сообщала активных warning/critical; это **не** является доказательством успешных E2E-проверок или готовности к продажам.
3. У PostgreSQL в staging имеется присоединённый persistent volume. **Не проверены** содержимое, миграции, согласованность, целостность, наличие или восстановимость резервных копий.
4. У Railway Functions в этой среде в источнике указан образ Bun Function, не Git-репозиторий. Код функций частично прочитан; полный аудит backend/API ещё не проведён.
5. Во Floot виден проект «LIZ_TY666 — разборы, соляр и обучение»; попытка `list_files` отклонена с сообщением о лимите 100 actions/day. Сообщённый Floot сброс: `2026-11-13T15:00:00Z` = **23:00 WITA**. Вызов не обходит блокировку.

### Реестр блокеров и рисков
| ID | Приоритет | Статус | Компонент | Подтверждённый факт / риск | Следующее действие |
|---|---|---|---|---|---|
| MIG-001 | High | Read access restored; export incomplete | Floot export/read | `list_files` возвращает «Daily build limit reached» до заявленного reset. Следовательно, текущая полная инвентаризация исходников недоступна. | Чтение доступно; продолжить безопасную инвентаризацию, экспорт/backup пока не подтверждены. |
| MIG-002 | High (риск, **не подтверждённый дефект**) | Open | Source parity | GitHub README описывает статический сайт, а Railway содержит отдельные функции и БД. Соответствие исходного Floot-кода и миграционной версии не доказано. | Карта функций, diff и traceability после доступа. |
| MIG-003 | High (риск, **не подтверждённый дефект**) | Open | Backup/restore | Подтверждённых backup и restore verification **нет** в результатах текущей проверки. | Согласовать приватное хранилище и разрешённый метод, затем проверить контрольные суммы/восстановление без нарушения production. |
| MIG-005 | High (риск, **не подтверждённый дефект**) | Open | Floot version parity | Floot сообщает о неопубликованных изменениях в четырёх файлах; состав опубликованной версии ещё не сопоставлен. | Проверить версионный diff без публикации. |\n| MIG-004 | High (риск, **не подтверждённый дефект**) | Open | Payment release gate | Staging payment-api существует, но реальные сценарии оплаты, webhook/idempotency и release readiness не проверялись. | Только sandbox-тесты; production payment выключен до допуска. |

Никаких дефектов продукта пока не объявлено подтверждёнными. Указанные риски не равны проверенным уязвимостям.

## Инвентарь функциональности для сохранения
Статус: **черновик по README, требуется сверка с Floot**. Статический сайт перечисляет: главная, быстрый разбор, астрология, руны, свечи, обучение, отзывы, о проекте, FAQ, контакты, оферта, privacy. Railway Functions указывают на дополнительные компоненты astro, оплату, scheduler и preview. Нужно сверить реальные страницы, Telegram mini app, роли/авторизацию, платежи, подписки, БД и API; пока не считать этот список полным.

## Резервные копии
- Снимок исходного Floot-кода: **не создан / не подтверждён**.
- Снимок staging/старой БД: **не создан / не подтверждён**.
- Проверка восстановления: **не выполнялась**.
- Путь защищённого хранилища: **не согласован**.

## Тестовые прогоны
| Дата | Тест/проверка | Результат | Доказательство/примечание |
|---|---|---|---|
| 2026-11-13 | GitHub доступ и список файлов | PASS (инвентарь только) | Список root, README, package.json |
| 2026-11-13 | Railway inventory и health статусы | PASS (проверка инфраструктурных статусов) | describe_environment, environment_status, пять сервисов |
| 2026-11-13 | Floot `list_files` | BLOCKED | Внешний лимит до 15:00 UTC |
| 2026-11-13 | Build, unit, integration, browser E2E, платежи | NOT RUN | Требуют анализа кода/тестовой среды |

## Форма отчёта по каждому этапу
### Этап N — YYYY-MM-DD
- **Статус:** Planned / In progress / Blocked / Verified
- **Исследовано:** источники, файлы, endpoints, команды, ссылки на evidence
- **Найдено:** ID, Critical/High/Medium/Low, ожидаемое/фактическое, воспроизведение
- **Изменения:** commit hash / PR / какие файлы
- **Тесты:** PASS/FAIL/BLOCKED (точные команды и результаты)
- **Блокеры:** причины/владелец/перепроверка
- **Согласовать:** что требует разрешения и зачем
- **Следующий этап:** что разрешено начать, когда выполнены prerequisites

## Гейт готовности к запуску
Статус: **NOT READY / NOT VERIFIED**. Требуются успешная сборка, критические тесты и полные пользовательские сценарии, проверенные sandbox-платежи, отсутствие известных блокирующих Critical/High дефектов, проверенные план отката и backups, отдельно утверждённый cutover. Без этих фактов финальную готовность не подтверждать.


## Почасовой запуск — 2026-11-14 02:06 WITA, этап 1 (#6), checkpoint 3

- **Конкуренция / gate:** до чтения Floot проверены актуальные PROJECT_AUDIT.md и issues #6–#11, а также комментарии #6 (на момент проверки пусты). Последний зафиксированный checkpoint 2 — 01:05 WITA, то есть больше часа назад; иных свежих In progress записей не обнаружено. Этап #6 остаётся In progress, #7–#11 не начинать.
- **Исследовано (read-only):** повторное `Floot.list_files` успешно, версия дерева `1794534939312` не изменилась относительно checkpoint 2. Прочитаны полностью `helpers/schema.tsx`, `static/__dev/migrations/mini-auth-20261110.sql`, `helpers/flootAppExports.tsx`, `helpers/forecastConfig.tsx`, `helpers/forecastPlans.tsx`. Только чтение, никаких вызовов функций, SQL или платежей.
- **Статическая карта БД:** сгенерированный Kysely `DB` перечисляет **29 интерфейсов таблиц** (подсчёт по именам в коде, не проверка реальной БД). Группы: auth (`users`, `userPasswords`, `sessions`, `loginAttempts`, `passwordResetCodes`); прогнозы (`forecastClients`, `forecastOrders`, `forecastPaymentEvents`, `forecastTelegramOrders`, `forecastMessages`, `forecastMiniSessions`, `forecastWebSessions`, `forecastWebLinks`, `forecastConsentRecords`, `forecastBirthPlaces`, bot drafts/updates, trial/test/quota, dispatch heartbeat); merchant/orders (`siteOrderRequests`, `siteOrderRefunds`, `merchantPaymentSettings`, `merchantFulfillmentSettings`, `paymentNotificationOutbox`, `paymentNotificationSettings`); visitor analytics (`visitorAnalyticsSessions`, `visitorAnalyticsEvents`). **Это типы, а не доказательство наличия таблиц в live БД.**
- **Связи по полям, НЕ проверенные FK:** `sessions.userId`, `userPasswords.userId`, `passwordResetCodes.userId` → `users.id`; `forecastClients.userId` → `users.id`; `forecastOrders.clientId`, `forecastConsentRecords.clientId`, `forecastMessages.clientId`, `forecastTelegramOrders.clientId` → `forecastClients.id`; `siteOrderRefunds.orderId`, `paymentNotificationOutbox.orderId` → `siteOrderRequests.id`. Реальные foreign keys, uniqueness и индексы требуют отдельной разрешённой read-only проверки БД. **Подтверждённый FK только в файле миграции** `forecast_consent_records.client_id REFERENCES forecast_clients(id)`; также SQL объявляет `forecast_mini_sessions.token_hash` PRIMARY KEY, `init_hash` UNIQUE и два индекса. Применена ли миграция — неизвестно.
- **Функциональность/границы операций:** `helpers/flootAppExports.tsx` содержит read-only диагностику астродвижка и Telegram, а также **мутационные** owner-side действия: настройку webhook/брендинга бота, импорт городов, выпуск тестовых приглашений, отправку тестовых сообщений и включение уведомлений. Эти функции **не вызывались**. При дальнейшем аудите отличать безопасное чтение кода от вызовов с внешними побочными эффектами.
- **Тарифы из исходника (не runtime-проверка):** `helpers/forecastConfig.tsx` задаёт 1/6/12 месяцев за 3666/6666/8888 ₽ соответственно; `helpers/forecastPlans.tsx` формирует текст Telegram и указывает отсутствие автопродления. Цены и доступность оплаты в текущем опубликованном приложении **не проверены**; требуется сравнить с Railway в этапе #7, без изменения конфигурации.
- **Риски:** MIG-003 (неподтверждённые backup/restore) и MIG-005 (недоступный published snapshot diff) по-прежнему High/Blocked; MIG-002 feature parity и MIG-004 payments — High/Open как **риски, не дефекты**. Новых подтверждённых runtime-дефектов нет.
- **Исправления:** только обновление журнала и отчёт в Issue #6, код приложения не изменялся.
- **Тесты:** PASS — read-only дерево/пять исходных файлов, статическое извлечение таблиц, связей, миграции и тарифов. BLOCKED — скачивание/byte-for-byte diff опубликованного Floot release, backup и restore proof. NOT RUN — build, typecheck, unit/integration/E2E, платежи, live DB schema queries, API calls.
- **Согласовать:** приватное хранилище backup и законный экспорт опубликованной версии Floot (возможное ограничение платного плана); не переносить пользовательские данные в публичный GitHub.
- **Следующий checkpoint:** продолжить только #6, уточнить безопасный способ экспорта и карту зависимостей/обязательных функций, запросить согласование. Этап 1 **не Verified**, к #7 не переходить.


## Почасовой запуск — 2026-11-14 08:06 WITA, этап 1 (#6), checkpoint 4

- **Статус / конкуренция:** до действий прочитаны текущий PROJECT_AUDIT.md, issues #6–#11 и комментарии #6. Последний зафиксированный checkpoint 3 от 02:06 WITA; свежей записи In progress за предыдущий час в этих источниках нет. #6 остаётся первым незавершённым; #7–#11 не начинались.
- **Исследовано:** Floot `list_projects` (read-only) подтвердил проект «LIZ_TY666 — разборы, соляр и обучение». Попытка `list_files` получила актуальный отказ **Daily build limit reached**. Floot сообщает: 100/100 действий использовано, окно сброса **2026-11-14 15:00 UTC = 23:00 WITA**. Отказ зафиксирован в этом запуске; обход лимита не предпринимался.
- **Причина ограничения:** согласно диагностике Floot, расход за текущее окно распределён между ChatGPT (71 действие в проекте, 1 вне проекта) и Claude (28 действий в проекте), с пересечением активности. Это свидетельствует о возможной параллельной работе, но не доказывает одновременные записи или конкретные изменения. До восстановления доступа и проверки конкуренции новые действия в Floot запрещены.
- **Дефекты:** новых подтверждённых дефектов приложения нет. Лимит Floot — внешний блокер, не дефект продукта. Риски MIG-002, MIG-003, MIG-005 остаются открытыми; backup/restore не подтверждены.
- **Исправления:** код приложения не изменялся; только запись в аудит и комментарий #6.
- **Тесты:** PASS — чтение GitHub и Floot project metadata; BLOCKED — Floot file tree/source read, published release export/diff, backup/restore; NOT RUN — build, unit/integration/E2E, live DB, платежи.
- **Согласования:** приватное хранилище и законный способ экспорта published snapshot. Платный тариф/покупка действий без разрешения не оформлялись.
- **Следующий checkpoint:** после **23:00 WITA 14 ноября** повторить только разрешённый read Floot, проверить наличие других активных агентов, продолжить #6 при отсутствии конфликта; к #7 не переходить до Verified #6. Production, Railway, пользовательские данные и платежи не затрагивались.
