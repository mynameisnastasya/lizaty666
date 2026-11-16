# Состояния: доступ, заказ, выполнение, генерация, доставка

Это разные состояния; ни одно не заменяется общим флагом `success`.

**Доступ** (`liz_subscriptions`): `valid_until > now()` — активен. `source`: `yookassa` (оплата), `yookassa_test`,
`astroday_tester_trial` / `tester_*` (тест). Продление считается от текущего `valid_until`, если он в будущем.
Повторная активация тестера использует `GREATEST` — оплаченный срок не сокращается.

**Заказ** (`liz_orders.status`): `creating` → `pending` (есть платёж YooKassa) → `paid` (+`activated_at`) | `canceled` |
`refunded`; `needs_review=true` — расхождение суммы/магазина/метаданных, автоматическая выдача остановлена.
Восстановление: планировщик каждые 5 минут сверяет `creating/pending` с YooKassa (закрытый браузер, потерянный webhook).

**Выполнение заказа** (`astroday_fulfillment_jobs.state`): `paid` → `notifying` → `notified` → `first_queued` → `done`;
`waiting_profile` (оплачено, анкеты нет — продолжится автоматически после анкеты); `review` (неизвестно, дошло ли
сообщение — вручную, повторно не шлём). `kind`: `first_purchase` | `renewal` (без повторного «первого результата»).

**Генерация прогноза** (`liz_daily_messages.generation_state`): `generating` (аренда 3 мин; после падения процесса
подхватывается) → `ready` | `waiting_editorial` (OpenAI не дал валидный текст; `next_editorial_at` с бэкоффом 5→10→20→40→60 мин)
| `failed` (ошибка движка и т.п.; повтор на следующем проходе). `text_source`: `openai` | `tester_approved` |
`calculated_fallback` (OpenAI недоступен дольше крайнего срока, политика `calculated_after_deadline`) | `calculated`
(OpenAI выключен).

**Доставка** (`liz_daily_messages.status`): `pending` → `sending` → `sent` | `failed_permanent` (Telegram 400/403) |
`needs_review` (сетевой сбой, исход неизвестен) | `cancelled` (пауза/анкета изменилась). Части длинного текста
отслеживаются `telegram_next_part_index` — уже отправленные части не повторяются. `delivery_purpose='first_result'`
— первый прогноз после оплаты.

**Тестеры** (`astroday_daily_delivery_claims.status`): `sending` → `sent` | `retry` (до 3 попыток) | `blocked` (403) |
`review` | `cancelled`.

**Уведомления владельцам** (`astroday_admin_outbox`): запись → отправка пачками; старше 24 часов не досылаются.
