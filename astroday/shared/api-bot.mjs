// ---------------------------------------------------------------------------
// ASTRODAY bot (patch 2026-11-17): общие экраны покупателя, обработка всех кнопок,
// повтор апдейта при сбое, прогноз по запросу без блокировки вебхука.
// Тестерские сценарии (Я в деле, join_test, /day, контакт) сохранены как были.
// ---------------------------------------------------------------------------
var AD_SITE = "https://lizty666-stage.up.railway.app";
var AD_MENU_ROWS = {
  cabinet: [{ text: "🌙 Анкета и кабинет", web_app: { url: AD_SITE + "/login" } }],
  plans: [{ text: "💳 Тарифы и оплата", callback_data: "ad_plans" }],
  today: [{ text: "🔮 Мой прогноз на сегодня", callback_data: "ad_today" }],
  status: [{ text: "ℹ️ Мой доступ", callback_data: "ad_status" }]
};
function adKeyboard(...rows) {
  return { reply_markup: { inline_keyboard: rows.map((r) => AD_MENU_ROWS[r]).filter(Boolean) } };
}
async function adAccount(id) {
  const rows = await db.unsafe("SELECT c.notify_enabled,c.chat_started_at,p.telegram_id IS NOT NULL AS has_profile,p.time_zone,p.delivery_hour_local,p.consented_to_daily,p.birth_time_verified,s.valid_until,s.source FROM liz_clients c LEFT JOIN liz_birth_profiles p ON p.telegram_id=c.telegram_id LEFT JOIN liz_subscriptions s ON s.telegram_id=c.telegram_id WHERE c.telegram_id=$1", [id]);
  const a = rows[0] || {};
  const until = Date.parse(a.valid_until || "");
  return { ...a, active: Number.isFinite(until) && until > Date.now(), until: Number.isFinite(until) ? new Date(until) : null };
}
function adDate(d, zone) {
  try {
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: zone || "Europe/Moscow" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(d);
  }
}
function adCatalog() {
  return Object.values(PLANS).map((p) => p.months + " " + (p.months === 1 ? "месяц" : "месяцев") + " — " + new Intl.NumberFormat("ru-RU").format(p.rub) + " ₽").join("\n");
}
function adHour(a) {
  const h = Number(a.delivery_hour_local);
  return (Number.isInteger(h) ? String(h).padStart(2, "0") : "08") + ":00";
}
function adSourceLabel(source) {
  return String(source || "").startsWith("yookassa") ? "оплаченная подписка" : String(source || "").includes("tester") ? "тестовый доступ" : "доступ";
}
async function adSendStart(id, repeat) {
  const a = await adAccount(id);
  if (a.active && a.has_profile)
    return sendBotMessage(id, "Ты в ASTRODAY 🖤\n" + (adSourceLabel(a.source) === "тестовый доступ" ? "Тестовый доступ" : "Доступ") + " до " + adDate(a.until, a.time_zone) + ". Прогноз приходит каждый день в " + adHour(a) + " по твоему времени" + (a.notify_enabled && a.consented_to_daily ? "." : ", но сейчас рассылка на паузе — вернуть: /resume."), adKeyboard("today", "cabinet"));
  if (a.has_profile)
    return sendBotMessage(id, "Анкета у тебя уже есть ✅\nОсталось открыть доступ — и каждое утро сюда будет прилетать личный прогноз по твоей натальной карте.\n\n" + adCatalog() + "\nЭто разовая оплата за выбранный срок, без автосписаний.", adKeyboard("plans", "cabinet"));
  if (repeat)
    return sendBotMessage(id, "Начнём с анкеты рождения — без неё я не смогу посчитать твою карту 🔮", adKeyboard("cabinet", "plans"));
  return sendBotMessage(id, "Привет! Это ASTRODAY — личные прогнозы Лизы 🖤\n\nНе гороскоп «для всех Скорпионов», а прогноз на каждый день по твоей натальной карте: дата, время и город рождения + что происходит на небе сегодня.\n\nКак начать:\n1. Заполни анкету рождения (пара минут).\n2. Выбери срок доступа и оплати на сайте.\n3. Получай прогноз сюда каждое утро в удобное время.\n\nЕсли не знаешь точное время рождения — тоже можно, просто без домов и асцендента.", adKeyboard("cabinet", "plans"));
}
async function adSendStatus(id) {
  const a = await adAccount(id);
  const lines = [];
  lines.push(a.has_profile ? "Анкета: заполнена" + (a.birth_time_verified ? " ✅" : " (без точного времени рождения — дома не учитываются)") : "Анкета: не заполнена");
  lines.push(a.active ? "Доступ: " + adSourceLabel(a.source) + " до " + adDate(a.until, a.time_zone) + " ✅" : a.until ? "Доступ: закончился " + adDate(a.until, a.time_zone) : "Доступ: ещё не оформлен");
  if (a.has_profile) lines.push("Рассылка: " + (a.notify_enabled && a.consented_to_daily ? "включена, в " + adHour(a) + " (" + (a.time_zone || "твой часовой пояс") + ")" : "на паузе — вернуть: /resume"));
  if (a.active && a.has_profile) {
    const day = localForecastDay(a.time_zone);
    const row = (await db.unsafe("SELECT generation_state,status,text_source FROM liz_daily_messages WHERE telegram_id=$1 AND forecast_date=$2::date", [id, day]))[0];
    lines.push("Прогноз на сегодня: " + (!row ? "ещё не готовился" : row.status === "sent" ? "отправлен" : row.generation_state === "ready" ? "готов" : row.generation_state === "failed" ? "не получился, я повторю попытку" : "готовится"));
  }
  return sendBotMessage(id, lines.join("\n"), a.active ? adKeyboard("today", "cabinet") : adKeyboard(a.has_profile ? "plans" : "cabinet", a.has_profile ? "cabinet" : "plans"));
}
var adTodayInFlight = new Map();
function adToday(id) {
  // Не держим вебхук: генерация может занять до минуты.
  if (adTodayInFlight.has(id)) return sendBotMessage(id, "Уже готовлю твой прогноз — ещё чуть-чуть 🔮");
  const job = (async () => {
    try {
      const a = await adAccount(id);
      if (!a.has_profile) return await sendBotMessage(id, "Сначала заполни анкету рождения — без неё я не посчитаю твою карту 🔮", adKeyboard("cabinet"));
      if (!a.active) return await sendBotMessage(id, "Ежедневный прогноз открывается с доступом ASTRODAY 🖤", adKeyboard("plans", "cabinet"));
      const day = localForecastDay(a.time_zone);
      const ready = (await db.unsafe("SELECT 1 FROM liz_daily_messages WHERE telegram_id=$1 AND forecast_date=$2::date AND generation_state='ready'", [id, day])).length > 0;
      if (!ready) await sendBotMessage(id, "Секунду, считаю твою карту на сегодня 🔮");
      const item = await ensureDailyForecast(db, id, day);
      await sendTesterForecast(id, item.body);
      await adminNotify(db, "forecast_on_request", "👁 <b>Прогноз по запросу</b>\n" + adminEsc(await adminWho(db, id)) + "\n" + day + " · " + adminEsc(item.text_source || item.text_mode || "") + "\n\n" + adminEsc(item.body));
      kickAdminDrain();
    } catch (e) {
      console.error("AD_TODAY_FAIL " + JSON.stringify({ code: String(e?.code || e?.message || "unknown").slice(0, 60) }));
      await sendBotMessage(id, e?.code === "forecast_preparing_retry" ? "Прогноз ещё готовится — нажми «Мой прогноз» через пару минут 🖤" : forecastErrorText(e), adKeyboard("today")).catch(() => {});
    } finally {
      adTodayInFlight.delete(id);
    }
  })();
  adTodayInFlight.set(id, job);
  return Promise.resolve();
}
var adminDrainRunning = false;
function kickAdminDrain() {
  if (!db || adminDrainRunning) return;
  adminDrainRunning = true;
  drainAdminOutbox(db, 5).catch(() => {}).finally(() => { adminDrainRunning = false; });
}
async function adFailureBudget(updateId) {
  const r = await db.unsafe("INSERT INTO liz_tg_update_failures(update_id,failures) VALUES($1::bigint,1) ON CONFLICT(update_id) DO UPDATE SET failures=liz_tg_update_failures.failures+1,updated_at=NOW() RETURNING failures", [updateId]);
  return Number(r[0]?.failures || 99);
}
// ---------------------------------------------------------------------------
