# FORECAST_QUEUE_SPEC — очередь, идемпотентность, хранение, восстановление

## Таблицы (создаются аддитивно, `CREATE … IF NOT EXISTS`; старые таблицы не меняются)
| Таблица | Назначение | Ключ |
|---|---|---|
| `astroday_v2_users` | Кто обслуживается v2 (rollout) | `telegram_id` |
| `astroday_v2_prefs` | Время рассылки `HH:MM`, вкл/выкл, обращение, ожидание ввода | `telegram_id` |
| `astroday_v2_forecasts` | Прогноз на дату: статус, факты, темы, луна, ответ модели, HTML, проверка, версии, токены, ошибка | PK `(telegram_id, forecast_date, generation_key)` + **уникальный частичный индекс `(telegram_id, forecast_date) WHERE status<>'invalidated'`** |
| `astroday_v2_lunar` | Кэш лунного календаря по месту | `(location_key, day, lunar_version)` |
| `astroday_v2_bazi` | Календарь Грабителя на период | `(telegram_id, birth_fp, bazi_version)` |
| `astroday_v2_deliveries` | Факт рассылки на дату | `(telegram_id, forecast_date)` |
| `astroday_v2_alerts` | Однократные предупреждения админам | `alert_key` |
| `astroday_v2_periods` | Журнал событий доступа (резерв для аудита) | `(source, source_ref)` |

`generation_key = sha256(profile_fp | engine_version | lunar_version | PROMPT_VERSION | TOPICS_VERSION | model)[:20]`.

## Состояния строки прогноза
`pending → calculating → generating → validating → ready`, ошибка → `failed` (повтор с бэкоффом, до 6 попыток), неактуальна → `invalidated`.
Каждый переход — условный `UPDATE … WHERE status NOT IN ('invalidated','ready')`. Если строку инвалидировали во время обработки, результат не сохранится.

## Захват и конкуренция
`claim()`: `UPDATE … WHERE (key) IN (SELECT … ORDER BY priority, forecast_date LIMIT n FOR UPDATE SKIP LOCKED)` с арендой `lease_until = now()+240 s`.
Захватываются `pending`, просроченные аренды и `failed` с наступившим `next_attempt_at`. Параллельные планировщики и `processNow` из API не берут одну строку дважды.

## Идемпотентность
- Повторный webhook, повторный тик, рестарт, повторное «Я в деле» → `INSERT … ON CONFLICT DO NOTHING`, дублей нет (тесты `queue`, `integration`).
- Расчёт движка сохраняется в `facts` до вызова OpenAI. При повторе после сбоя движок повторно не вызывается.
- Готовая строка не регенерируется. Повторная обработка не делает запросов (тест: число запросов не растёт).
- Рассылка: `INSERT INTO astroday_v2_deliveries … ON CONFLICT DO UPDATE … WHERE status='failed' AND attempts<3 RETURNING`. Ровно одна отправка даже при двух параллельных тиках (тест). Потерянный ответ Telegram → `review`, вслепую не переотправляется. Частично ушедший многочастный текст тоже → `review`.

## Восстановление
- Сбой на 17-м из 30 → 16 готовых остаются, 17-й в `failed` с бэкоффом, остальные продолжаются (тест «сбой на части дней»).
- Упал процесс → аренда истекает, строку подхватывает следующий тик (тест).
- Нет готового текста ко времени рассылки → приоритет 0, предупреждение админам через 30 минут. Непроверенный текст не уходит.
- К 20:00 местного проверяется готовность прогноза на завтра: если не готов — приоритет и предупреждение.

## Статус периода
`periodStatus(db, id)` — количество строк по состояниям. Показывается в «👤 Мой профиль»: «готово N из M».
