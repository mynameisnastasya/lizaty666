# RELEASE_CHECKLIST — безопасная выкладка ASTRODAY 2.0

## Принципы
- Выкладка **не меняет поведение** для всех: `ASTRODAY_V2_MODE=allowlist`. Работает только у тех, кто отправил боту `/v2 <код>` или добавлен в `astroday_v2_users`.
- Цены, тарифы, YooKassa, транзакция выдачи доступа — **не меняются**.
- Схема БД — только `CREATE TABLE/INDEX IF NOT EXISTS` (новые таблицы `astroday_v2_*`). Старые таблицы не изменяются, данные не удаляются.
- Откат: прежние деплойменты Railway (id ниже) или прежний код загрузчиков. Таблицы v2 можно оставить, они ни на что не влияют.

## Перед выкладкой
- [ ] `bun test test/v2/` — 48/48; `python3 -m pytest engine/` — 9/9; `bun test test/*.test.mjs` — 63/70 (те же 7 известных).
- [ ] `bun tools/build-v2.mjs` — SHA в `release-v2/MANIFEST.json`.
- [ ] Коммит и **push** ветки `astroday-2.0` (нужен доступ записи к `mynameisnastasya/lizaty666` в этой сессии).
- [ ] `bun tools/package-git-v2.mjs <commit>` → `release-v2/deploy/{api,scheduler}-loader.ts`, код с GitHub по коммиту, проверка SHA, копия в БД.

## Выкладка (staging)
1. Переменные `liz-ty666-payment-api` и `liz-ty666-scheduler` (с `skipDeploys`):
   `ASTRODAY_V2_MODE=allowlist`, `ASTRODAY_V2_MODEL=gpt-6.2-astra`, `ASTRODAY_V2_ENGINE_URL=http://astroday-engine-v2c.railway.internal:8080`, `ASTRODAY_V2_DELIVERY=on`, `ASTRODAY_V2_DAILY_BUDGET=600`, `ASTRODAY_V2_INVITE=<случайные ≥12 символов>` (только API).
2. Код функции `liz-ty666-scheduler` ← `scheduler-loader.ts`, затем `liz-ty666-payment-api` ← `api-loader.ts`.
3. Код функции `astroday-daily7-7am-consented-notify` ← `release-v2/daily7.ts` (пропускает пользователей v2).
4. Логи: `ASTRODAY_SOURCE_OK` (from github), `PAYMENT_API_SECURITY_SELFTEST pass:true`, `ASTRODAY_V2_TICK {mode:"allowlist"…}`.

## Проверка после выкладки
- [ ] Обычный `/start` у тестера вне allowlist — старое поведение.
- [ ] Владелец отправляет `/v2 <код>`: меню, «Сегодня», «Завтра», «Грабитель», «Лунный календарь», «Время 08:00».
- [ ] Через 5–10 минут в «Профиле» «готово N из M» растёт; в логах `ASTRODAY_V2_TICK work.ready>0`.
- [ ] В выбранное время приходит одно сообщение; повторного утром из `daily7` нет.
- [ ] Расход: `SELECT * FROM astroday_openai_usage ORDER BY usage_day DESC LIMIT 2`.

## Расширение
`ASTRODAY_V2_MODE=all` переводит всех с анкетой и активным доступом. Для 19 тестеров это около 550 генераций за первые тики (≈ $11 по сторонней оценке цены). Делать только после проверки на allowlist.

## Откат
- API: redeploy `6f996b0e-9b18-42e6-a34c-292f0e460feb` (текущий `claude-polish1`) или прежний код загрузчика (`ASTRODAY_API_PKG_*` не удаляются).
- Scheduler: redeploy `db8dcd2f-eee3-4864-bea7-c7387b15447f` (загрузчик `c33aa437…`).
- daily7: redeploy `e8964c11-cff1-4a7d-98c4-bb03902d1a42`.
- Быстрое выключение без деплоя кода: `ASTRODAY_V2_MODE=off` на API и scheduler — бот и планировщик сразу ведут себя как раньше, пользователи v2 возвращаются в старые конвейеры генерации и доставки (тест «выключатель»). Для `daily7` (своей переменной режима нет) дополнительно выполнить `UPDATE astroday_v2_users SET enabled=false` или вернуть прежний деплоймент daily7.
- Сервис `astroday-engine-v2-candidate` можно удалить, на старый код он не влияет.
