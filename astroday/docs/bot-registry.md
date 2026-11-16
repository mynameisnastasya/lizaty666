# Реестр команд, кнопок и маршрутов

Состояния пользователя: **Н** — новый (нет анкеты), **А** — анкета без доступа, **П** — оплаченный доступ,
**Т** — тестер (запись в `liz_astro_testers`), **И** — доступ истёк, **С** — рассылка на паузе.
Тестерам команды из списка `adCommand` обрабатываются тестерской веткой (поведение сохранено).

## Команды бота

| Команда | Состояния | Обработчик | Эффект | Проверка |
|---|---|---|---|---|
| `/start` | Н | `adSendStart` | Приветствие, что продаётся, 3 шага, кнопки «Анкета и кабинет», «Тарифы» | e2e #1 |
| `/start` повторно | Н/А/П | `adSendStart(repeat)` | Короткий экран по состоянию, без длинного приветствия, без новых записей | e2e #2 |
| `/start login_<код>` | любые | `liz_tg_auth_pairings` | Подтверждение входа на сайт (10 мин) | ручная |
| `/start test`, `/test` | любые | `testerConsentMessage` | Тестерское согласие | — |
| `/start forecast` | Т | `astrodayToday` | Прогноз тестера | — |
| `/today`, кнопка `ad_today` | П/С/И/Н | `adToday` (фон) | Готовый прогноз сразу; если нет — «считаю» и текст; Н → анкета; И → тарифы; рассылку не включает | e2e #4, #12 |
| `/today`, кнопка `astroday_today` | Т | `astrodayTodayCore` | Одобренный текст тестера на день | testers |
| `/day YYYY-MM-DD` | Т | `loadVerifiedTesterText` | Текст тестера на дату периода теста | — |
| `/status`, кнопка `ad_status` | все | `adSendStatus` | Анкета, вид и срок доступа, рассылка, состояние прогноза сегодня | e2e #13 |
| `/stop` | П/Т | общий / `adToggle` | Пауза во всех механизмах: `liz_clients.notify_enabled`, `consented_to_daily`, `liz_tg_consents`, `astroday_tester_joins` | e2e #12, editorial «/stop» |
| `/resume` | П/Т (с анкетой) | общий / `adToggle` | Возобновление; без анкеты — просьба заполнить | e2e #13, testers |
| `/help` | все | — | Список команд без `/join_test` для покупателей | — |
| `/plans`, `/buy_*`, кнопка `ad_plans` | все | `sendYooKassaPlans` | Тарифы из серверного каталога, «разовая оплата без автосписаний», кнопка на `/checkout` | — |
| `/join_test`, `join_test`, `/confirm_test`, `/activate_test`, кнопка «Я в деле» | Т | `astrodayJoinOnce` / `activateTester` | Подключение тестера сразу, повтор снимает паузу | testers |
| Контакт (`request_contact`) | Т (по телефону) | `activateTester` | Принимается только собственный контакт | testers |
| Любой текст | все | `adSendStart(repeat)` | Актуальное меню | — |
| Неизвестная/старая кнопка | все | ответ + меню | Кнопка не «зависает» | e2e #3, regressions |
| `my_chat_member` (блокировка/разблокировка) | все | `bot_blocked_at` | Учёт блокировки, доступ не трогаем | — |

## HTTP-маршруты API (`lizty666-api-stage.up.railway.app`)

| Маршрут | Назначение | Доступ |
|---|---|---|
| `POST /v1/telegram/webhook` | Апдейты бота | секрет `X-Telegram-Bot-Api-Secret-Token` |
| `/v1/tg-auth/{start,status,session,mini,logout}` | Вход на сайт через бот или Mini App | подпись Telegram / cookie сессии |
| `/v1/tg-forecast/{me,register,settings,chart,today,preview}` | Кабинет: анкета, настройки, карта, прогноз | cookie сессии; Origin сайта для POST |
| `GET /v1/geo/cities` | Поиск города (GeoNames) | публично |
| `GET /v1/plans` | Каталог тарифов | публично |
| `POST /v1/checkout` | Заказ в YooKassa (сумма с сервера, Idempotency-Key) | сессия |
| `POST /v1/order/status` | Статус заказа и выполнения (`fulfillment`, `firstResult`) | сессия |
| `POST /v1/subscription` | Состояние доступа | сессия |
| `POST /v1/yookassa/webhook` | Уведомления YooKassa (перепроверка через API YooKassa) | публично, данные не доверяются |
| `GET /health`, `/v1/app-status`, `/v1/release-readiness` | Здоровье и готовность (с фактическими отметками времени) | публично |

## Сайт (`lizty666-stage.up.railway.app`)

`/` (лендинг), `/login` (вход и анкета), `/app` (кабинет), `/checkout` (оплата), `/payment-return` (возврат с оплаты,
статус по серверу), `/daily`, `/daily-forecast`, юридические: `/offer`, `/privacy`, `/refunds`, `/delivery`,
`/requisites`, `/order-consent`; старые `/ezhednevka*` — перенаправления на актуальные страницы.
