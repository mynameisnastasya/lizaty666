// ASTRODAY 2.0 — Telegram-бот: меню, «Сегодня/Завтра», Грабитель богатства, время рассылки,
// лунный календарь, натальная карта, профиль, настройки. Все тексты — на русском, без мата.
// Модуль не знает о бандле: всё внешнее приходит через deps (db, tg, legacy-функции, воркер).
import { ensureSchema, loadUser, generationWindow, accessCovers, currentForecast, prioritize, periodStatus, baziFor, syncUsers, lastAccessDay, ZONE_CAPITALS, locationOf } from "./queue.mjs";
import { localDay, localHM, tomorrowOf, addDays, ruDate, zoneLabel, formatVoc } from "./timefmt.mjs";
import { renderJieCaiMessages, stemLabel } from "./bazi.mjs";
import { nameOptions, addressName, firstName, cleanName } from "./names.mjs";
import { esc } from "./editorial.mjs";
import { SIGN_RU_IN, PLANET_RU } from "./topics.mjs";
import { isClean } from "./profanity.mjs";

export const BOT_VERSION = "astroday-bot-v2";
const P = "v2:";
const btn = (text, data) => ({ text, callback_data: P + data });
export function mainMenu(site) {
  const rows = [
    [btn("🔮 Прогноз на сегодня", "today"), btn("✨ Прогноз на завтра", "tomorrow")],
    [btn("💰 Дни Грабителя богатства", "bazi:0")],
    [btn("🌙 Лунный календарь", "lunar"), btn("🌌 Натальная карта", "natal")],
    [btn("⏰ Время прогнозов", "time"), btn("👤 Мой профиль", "profile")],
    [btn("⚙️ Настройки", "settings")],
  ];
  if (site) rows.push([{ text: "🖤 Личный кабинет", web_app: { url: site + "/app" } }]);
  return { reply_markup: { inline_keyboard: rows } };
}
const back = (extra = []) => ({ reply_markup: { inline_keyboard: [...extra, [btn("☰ Меню", "menu")]] } });
export const TIME_CHOICES = ["06:00", "07:00", "08:00", "09:00", "10:00"];

export function splitHtml(html, limit = 4000) {
  if (html.length <= limit) return [html];
  const out = [];
  let cur = "";
  for (const block of html.split("\n\n")) {
    if ((cur + "\n\n" + block).length > limit && cur) { out.push(cur); cur = block; } else cur = cur ? cur + "\n\n" + block : block;
  }
  if (cur) out.push(cur);
  return out;
}

export function createBot(deps) {
  const { db, tg, site = null, cfg } = deps;
  const debounce = new Map();
  const send = (id, text, extra = {}) => tg("sendMessage", { chat_id: id, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
  const nameFor = (u) => addressName({ profileName: u?.preferred_name, mode: u?.address_mode || "original", custom: u?.address_value, affectionate: u?.address_value });

  async function isV2(id) {
    await ensureSchema(db);
    const r = await db.unsafe("SELECT enabled FROM astroday_v2_users WHERE telegram_id=$1", [id]);
    if (r[0]) return r[0].enabled;
    if (cfg.enableForAll) {
      const p = await db.unsafe("SELECT 1 FROM liz_birth_profiles WHERE telegram_id=$1", [id]);
      if (p.length) { await db.unsafe("INSERT INTO astroday_v2_users(telegram_id, added_by) VALUES($1,'auto') ON CONFLICT DO NOTHING", [id]); return true; }
    }
    return false;
  }
  async function prefs(id) {
    await db.unsafe("INSERT INTO astroday_v2_prefs(telegram_id) VALUES($1) ON CONFLICT DO NOTHING", [id]);
    return (await db.unsafe("SELECT * FROM astroday_v2_prefs WHERE telegram_id=$1", [id]))[0];
  }

  async function menu(id, intro) {
    const u = await loadUser(db, id);
    const n = nameFor(u);
    return send(id, intro || ((n ? esc(n) + ", " : "") + "что смотрим? 🖤"), mainMenu(site));
  }

  async function start(id, tester) {
    const u = await loadUser(db, id);
    const n = nameFor(u);
    if (tester && !tester.joined) {
      return send(id, "Привет" + (n ? ", " + esc(n) : "") + "! Это ASTRODAY — личные прогнозы Лизы по твоей натальной карте 🖤\n\nТвою анкету я уже нашла, заполнять ничего не нужно. Жми «Я в деле» — подключу тестовый доступ и покажу меню.", { reply_markup: { inline_keyboard: [[{ text: "🖤 Я в деле", callback_data: "astroday_join" }]] } });
    }
    if (!u) {
      const kb = [[{ text: "🌙 Заполнить анкету рождения", web_app: { url: (site || "") + "/app" } }], [{ text: "💳 Тарифы", callback_data: "ad_plans" }]];
      return send(id, "Привет! Это ASTRODAY — личные прогнозы Лизы 🖤\n\nНе гороскоп «для всех Скорпионов», а прогноз на каждый день по твоей натальной карте. Для расчёта нужны дата, время и город рождения — анкета заполняется один раз.", { reply_markup: { inline_keyboard: kb } });
    }
    const active = u.valid_until && Date.parse(u.valid_until) > Date.now();
    if (!active) return send(id, (n ? esc(n) + ", а" : "А") + "нкета у тебя уже есть ✅ Осталось открыть доступ — и прогнозы будут приходить сюда каждый день.", { reply_markup: { inline_keyboard: [[{ text: "💳 Тарифы и оплата", callback_data: "ad_plans" }], [btn("👤 Мой профиль", "profile")]] } });
    await syncUsers(db, cfg, { onlyId: id }).catch(() => {});
    return menu(id, "С возвращением" + (n ? ", " + esc(n) : "") + " 🖤 Анкета и доступ на месте — ничего заново заполнять не нужно.\n\nЧто смотрим?");
  }

  async function showForecast(id, which) {
    const key = id + ":" + which;
    const t = debounce.get(key);
    if (t && Date.now() - t < 4000) return;
    debounce.set(key, Date.now());
    const u = await loadUser(db, id);
    if (!u) return send(id, "Сначала нужна анкета рождения — без неё я не посчитаю твою карту 🔮", { reply_markup: { inline_keyboard: [[{ text: "🌙 Заполнить анкету", web_app: { url: (site || "") + "/app" } }]] } });
    const day = which === "tomorrow" ? tomorrowOf(u.time_zone) : localDay(u.time_zone);
    if (!accessCovers(u, day)) {
      const last = lastAccessDay(u.valid_until, u.time_zone);
      const msg = !last ? "Ежедневные прогнозы открываются с доступом ASTRODAY 🖤" : last < localDay(u.time_zone) ? "Твой доступ закончился " + ruDate(last) + ". Продлить можно в «Тарифах» 🖤" : "Завтра (" + ruDate(day) + ") уже за пределами твоего доступа — он действует по " + ruDate(last) + " включительно. Продлить можно в «Тарифах» 🖤";
      return send(id, esc(msg), { reply_markup: { inline_keyboard: [[{ text: "💳 Тарифы", callback_data: "ad_plans" }], [btn("☰ Меню", "menu")]] } });
    }
    let f = await currentForecast(db, id, day);
    if (!f) { await syncUsers(db, cfg, { onlyId: id }); f = await currentForecast(db, id, day); }
    if (f?.status === "ready" && f.body_html) {
      const parts = splitHtml(which === "tomorrow" ? f.body_html.replace("ТВОЙ ПРОГНОЗ НА ", "ТВОЙ ПРОГНОЗ НА ЗАВТРА, ") : f.body_html);
      for (let i = 0; i < parts.length; i++) await send(id, parts[i], i === parts.length - 1 ? { reply_markup: { inline_keyboard: [[which === "today" ? btn("✨ Прогноз на завтра", "tomorrow") : btn("🔮 Прогноз на сегодня", "today")], [btn("☰ Меню", "menu")]] } } : {});
      return;
    }
    await prioritize(db, id, day, id);
    deps.processNow?.(id, day);
    return send(id, (which === "tomorrow" ? "Прогноз на завтра" : "Твой прогноз на сегодня") + " ещё готовится 🔮 Я поставила его первым в очередь — пришлю сюда, как только он пройдёт проверку. Обычно это пара минут.", back());
  }

  async function bazi(id, page) {
    const u = await loadUser(db, id);
    if (!u) return send(id, "Сначала нужна анкета рождения 🖤", back());
    if (!u.valid_until || Date.parse(u.valid_until) <= Date.now()) return send(id, "Календарь Грабителя богатства открывается вместе с доступом ASTRODAY 🖤", { reply_markup: { inline_keyboard: [[{ text: "💳 Тарифы", callback_data: "ad_plans" }], [btn("☰ Меню", "menu")]] } });
    let b = await baziFor(db, u);
    if (!b) { await syncUsers(db, cfg, { onlyId: id }); b = await baziFor(db, u); }
    if (!b) return send(id, "Календарь ещё считается — загляни через минуту 🖤", back());
    const today = localDay(u.time_zone);
    const days = (b.days || []).filter((x) => x.day >= today);
    const msgs = renderJieCaiMessages({ name: nameFor(u), dm: b.day_master, days, startDay: today > b.s ? today : b.s, endDay: b.e });
    // страницы: [шапка+первый месяц], далее по месяцу, последний — легенда
    const head = msgs[0], legend = msgs[msgs.length - 1], months = msgs.slice(1, -1);
    const pages = months.length ? months.map((m, i) => (i === 0 ? head + "\n\n" + m : m)) : [head];
    const p = Math.max(0, Math.min(pages.length - 1, Number(page) || 0));
    const nav = [];
    if (p > 0) nav.push(btn("◀️ Назад", "bazi:" + (p - 1)));
    if (p < pages.length - 1) nav.push(btn("Дальше ▶️", "bazi:" + (p + 1)));
    const text = pages[p] + (p === pages.length - 1 ? "\n\n" + legend : "");
    return send(id, text, back(nav.length ? [nav] : []));
  }

  async function timeScreen(id, note) {
    const u = await loadUser(db, id);
    const pr = await prefs(id);
    const city = zoneLabel(u?.time_zone, u?.current_city_name);
    const rows = [TIME_CHOICES.slice(0, 3).map((t) => btn((pr.delivery_time === t ? "✅ " : "") + t, "time:" + t)), TIME_CHOICES.slice(3).map((t) => btn((pr.delivery_time === t ? "✅ " : "") + t, "time:" + t)).concat([btn("Другое время", "time:custom")]), [pr.delivery_enabled ? btn("🔕 Отключить рассылку", "time:off") : btn("🔔 Включить рассылку", "time:on")]];
    const text = (note ? note + "\n\n" : "") + "⏰ <b>ВРЕМЯ ПРОГНОЗОВ</b>\n" + (pr.delivery_enabled ? "Сейчас прогноз приходит каждый день в <b>" + pr.delivery_time + "</b> по времени: " + esc(city) + " (" + esc(u?.time_zone || "") + ")." : "Рассылка выключена. Кнопки «Сегодня» и «Завтра» работают как обычно.") + "\n\nВыбери удобное время:";
    return send(id, text, back(rows));
  }
  async function setTime(id, hm) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hm)) return send(id, "Не поняла время 🙈 Напиши в формате ЧЧ:ММ, например 07:30.", back());
    await prefs(id);
    await db.unsafe("UPDATE astroday_v2_prefs SET delivery_time=$2, delivery_enabled=TRUE, awaiting=NULL, updated_at=NOW() WHERE telegram_id=$1", [id, hm]);
    await deps.legacyConsent?.(id, true);
    const u = await loadUser(db, id);
    const n = nameFor(u);
    return send(id, (n ? esc(n) + ", т" : "Т") + "вой прогноз будет приходить каждый день в <b>" + hm + "</b> по времени: " + esc(zoneLabel(u?.time_zone, u?.current_city_name)) + " 🖤", back());
  }
  async function setDelivery(id, on) {
    await prefs(id);
    await db.unsafe("UPDATE astroday_v2_prefs SET delivery_enabled=$2, awaiting=NULL, updated_at=NOW() WHERE telegram_id=$1", [id, on]);
    await deps.legacyConsent?.(id, on);
    return timeScreen(id, on ? "Рассылка включена 🔔" : "Рассылка выключена 🔕 Прогнозы по кнопкам доступны как раньше.");
  }

  async function lunar(id) {
    const u = await loadUser(db, id);
    if (!u) return send(id, "Сначала нужна анкета 🖤", back());
    const today = localDay(u.time_zone);
    const loc = locationOf(u, ZONE_CAPITALS);
    const key = u.time_zone + "|" + loc.lat.toFixed(2) + "|" + loc.lon.toFixed(2);
    let rows = await db.unsafe("SELECT data FROM astroday_v2_lunar WHERE location_key=$1 AND day BETWEEN $2::date AND $2::date+6 AND lunar_version=$3 ORDER BY day", [key, today, cfg.lunarVersion]);
    if (rows.length < 7 && deps.engine) {
      const cal = await deps.engine.lunar({ startDay: today, days: 35, timeZone: u.time_zone, latitude: loc.lat, longitude: loc.lon }).catch(() => null);
      if (cal?.days) { for (const d of cal.days) await db.unsafe("INSERT INTO astroday_v2_lunar(location_key, day, lunar_version, data) VALUES($1,$2::date,$3,$4::jsonb) ON CONFLICT DO NOTHING", [key, d.day, cfg.lunarVersion, d]); rows = cal.days.slice(0, 7).map((d) => ({ data: d })); }
    }
    if (!rows.length) return send(id, "Лунный календарь сейчас недоступен — попробуй чуть позже 🌙", back());
    const city = zoneLabel(u.time_zone, loc.city);
    const lines = ["🌙 <b>ЛУННЫЙ КАЛЕНДАРЬ НА НЕДЕЛЮ</b>", "Время — " + esc(city) + (loc.approx ? " (по столице часового пояса)" : "") + "."];
    for (const { data: d } of rows) {
      let s = "\n<b>" + esc(ruDate(d.day, true)) + "</b> — " + (d.lunarDayAtNoon ? d.lunarDayAtNoon + "-е лунные сутки" : "нет данных");
      const changes = (d.segments || []).filter((x) => localDay(u.time_zone, x.startTs * 1000) === d.day);
      for (const c of changes) s += "\n· с " + localHM(u.time_zone, c.startTs * 1000) + " — " + c.number + "-е" + (c.startKind === "new_moon" ? " (новолуние)" : "");
      for (const v of d.voidOfCourse || []) s += "\n· Луна без курса " + esc(formatVoc({ startMs: v.startTs * 1000, endMs: v.endTs * 1000, zone: u.time_zone, cityName: city, forecastDay: d.day }).local);
      lines.push(s);
    }
    lines.push("\nНомер в прогнозе — сутки, которые идут в 12:00 по твоему времени.");
    return send(id, lines.join("\n"), back());
  }

  async function natal(id) {
    const u = await loadUser(db, id);
    if (!u) return send(id, "Сначала нужна анкета 🖤", back());
    const row = (await db.unsafe("SELECT facts->'natalProfile' AS n FROM astroday_v2_forecasts WHERE telegram_id=$1 AND facts IS NOT NULL AND status<>'invalidated' ORDER BY forecast_date DESC LIMIT 1", [id]))[0];
    let n = row?.n;
    if (!n && deps.engine?.natal) n = await deps.engine.natal({ at: u.birth_at_iso, accurateBirthTime: u.birth_time_verified === true, latitude: Number(u.birth_lat), longitude: Number(u.birth_lon) }).catch(() => null);
    if (!n?.natalPositions) return send(id, "Натальная карта ещё считается — загляни через пару минут 🌌", back());
    const order = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
    const signOf = (lon) => ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"][Math.floor((((lon % 360) + 360) % 360) / 30)];
    const lines = ["🌌 <b>ТВОЯ НАТАЛЬНАЯ КАРТА</b>", "Тропический зодиак, дома Плацидуса" + (n.houseKnown ? "." : " — без домов: время рождения не подтверждено.")];
    if (n.axes?.ascendant != null) lines.push("Асцендент " + SIGN_RU_IN[signOf(n.axes.ascendant)].replace(/^в[о]? /, "") + ", MC " + SIGN_RU_IN[signOf(n.axes.mc)].replace(/^в[о]? /, ""));
    for (const p of order) {
      const x = n.natalPositions[p];
      if (!x) continue;
      lines.push("· " + PLANET_RU[p] + " " + SIGN_RU_IN[x.sign] + (Number.isFinite(x.degree) ? ", " + Math.floor(x.degree) + "°" : ""));
    }
    if (!n.natalPositions.Moon) lines.push("· Луна не показана: без точного времени рождения её знак может быть неточным.");
    return send(id, lines.join("\n"), back());
  }

  async function profile(id) {
    const u = await loadUser(db, id);
    if (!u) return send(id, "Анкеты пока нет 🖤", { reply_markup: { inline_keyboard: [[{ text: "🌙 Заполнить анкету", web_app: { url: (site || "") + "/app" } }], [btn("☰ Меню", "menu")]] } });
    const st = Object.fromEntries((await periodStatus(db, id)).map((r) => [r.status, r]));
    const win = generationWindow(u);
    const ready = st.ready?.n || 0, total = Object.values(st).reduce((a, r) => a + r.n, 0);
    const last = lastAccessDay(u.valid_until, u.time_zone);
    const birthTime = u.birth_time_verified ? new Intl.DateTimeFormat("ru-RU", { timeZone: u.birth_timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(u.birth_at_iso)) : "не указано";
    const lines = ["👤 <b>МОЙ ПРОФИЛЬ</b>", "Обращение: " + esc(nameFor(u) || "без имени"), "Дата рождения: " + esc(ruDate(u.birth_day)) + " " + u.birth_day.slice(0, 4), "Время рождения: " + esc(birthTime), "Город рождения: " + esc(u.birth_city_name || "—"), "Текущий город: " + esc(zoneLabel(u.time_zone, u.current_city_name)) + " (" + esc(u.time_zone) + ")",
      "Доступ: " + (last && last >= localDay(u.time_zone) ? (String(u.access_source || "").includes("tester") ? "тестовый" : "оплаченный") + " — по " + esc(ruDate(last)) + " включительно ✅" : "не активен"),
      win ? "Прогнозы на период: готово " + ready + " из " + total + (st.failed ? " (часть пересчитывается)" : "") : ""];
    return send(id, lines.filter(Boolean).join("\n"), back([[btn("💬 Как к тебе обращаться", "name")], [{ text: "✏️ Изменить анкету", web_app: { url: (site || "") + "/app" } }]]));
  }

  async function nameScreen(id) {
    const u = await loadUser(db, id);
    const opts = nameOptions(u?.preferred_name);
    const rows = opts.map((o, i) => [btn((nameFor(u) === o.value ? "✅ " : "") + o.value, "name:" + i)]);
    rows.push([btn("✍️ Своё обращение", "name:custom")], [btn("Без имени", "name:none")]);
    return send(id, "💬 <b>КАК К ТЕБЕ ОБРАЩАТЬСЯ?</b>\nВыбери вариант — так я буду писать в прогнозах.", back(rows));
  }
  async function setName(id, arg) {
    const u = await loadUser(db, id);
    await prefs(id);
    if (arg === "custom") { await db.unsafe("UPDATE astroday_v2_prefs SET awaiting='name' WHERE telegram_id=$1", [id]); return send(id, "Напиши, как к тебе обращаться (одно-два слова) ✍️", back()); }
    if (arg === "none") await db.unsafe("UPDATE astroday_v2_prefs SET address_mode='none', address_value=NULL, awaiting=NULL, updated_at=NOW() WHERE telegram_id=$1", [id]);
    else {
      const o = nameOptions(u?.preferred_name)[Number(arg)];
      if (!o) return nameScreen(id);
      await db.unsafe("UPDATE astroday_v2_prefs SET address_mode=$2, address_value=$3, awaiting=NULL, updated_at=NOW() WHERE telegram_id=$1", [id, o.mode, o.mode === "original" ? null : o.value]);
    }
    const u2 = await loadUser(db, id);
    const n = nameFor(u2);
    return send(id, n ? "Договорились, " + esc(n) + " 🖤 Новые прогнозы будут с этим обращением." : "Договорились — без имени 🖤", back());
  }

  async function settings(id) {
    const pr = await prefs(id);
    const u = await loadUser(db, id);
    const text = "⚙️ <b>НАСТРОЙКИ</b>\nРассылка: " + (pr.delivery_enabled ? "включена, в " + pr.delivery_time : "выключена") + "\nОбращение: " + esc(nameFor(u) || "без имени") + "\nЧасовой пояс: " + esc(u?.time_zone || "—");
    return send(id, text, back([[btn("⏰ Время прогнозов", "time")], [btn("💬 Как к тебе обращаться", "name")], [btn(pr.delivery_enabled ? "🔕 Отключить рассылку" : "🔔 Включить рассылку", pr.delivery_enabled ? "time:off" : "time:on")]]));
  }

  async function onText(id, text) {
    const pr = (await db.unsafe("SELECT awaiting FROM astroday_v2_prefs WHERE telegram_id=$1", [id]))[0];
    if (pr?.awaiting === "time") {
      const m = /^\s*(\d{1,2})[:.\s](\d{2})\s*$/.exec(text);
      return setTime(id, m ? String(Number(m[1])).padStart(2, "0") + ":" + m[2] : "x");
    }
    if (pr?.awaiting === "name") {
      const c = cleanName(text);
      if (!/^[\p{L}][\p{L}\- ]{0,30}$/u.test(c) || !isClean(c)) return send(id, "Давай что-нибудь попроще — одно-два слова, только буквы 🙂", back());
      await db.unsafe("UPDATE astroday_v2_prefs SET address_mode='custom', address_value=$2, awaiting=NULL, updated_at=NOW() WHERE telegram_id=$1", [id, c]);
      return send(id, "Договорились, " + esc(c) + " 🖤", back());
    }
    return false;
  }

  // Возвращает true, если апдейт обработан ботом v2.
  async function handleUpdate(up) {
    const q = up?.callback_query;
    const msg = up?.message;
    const id = String(q?.from?.id ?? msg?.from?.id ?? "");
    const chat = String(q?.message?.chat?.id ?? msg?.chat?.id ?? "");
    const type = q?.message?.chat?.type ?? msg?.chat?.type;
    if (!/^\d{1,20}$/.test(id) || id !== chat || type !== "private") return false;
    if (!(await isV2(id))) return false;
    if (q) {
      const data = String(q.data || "");
      const ours = data.startsWith(P) || ["astroday_today", "ad_today", "ad_status"].includes(data);
      if (data === "astroday_join") {
        await tg("answerCallbackQuery", { callback_query_id: q.id, text: "🖤" }).catch(() => {});
        const ok = await deps.legacyJoin?.(id, q.from?.username);
        if (ok === false) return true;
        await syncUsers(db, cfg, { onlyId: id }).catch(() => {});
        await menu(id, "Ты в деле 🖤 Тестовый доступ подключён, прогнозы на весь период уже готовятся.\n\nЧто смотрим?");
        return true;
      }
      if (!ours) return false;
      await tg("answerCallbackQuery", { callback_query_id: q.id }).catch(() => {});
      const [cmd, arg] = (data.startsWith(P) ? data.slice(P.length) : data === "ad_status" ? "profile" : "today").split(/:(.*)/s);
      return route(id, cmd, arg).then(() => true);
    }
    if (!msg) return false;
    const text = String(msg.text || "").trim();
    const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();
    const map = { "/today": "today", "/tomorrow": "tomorrow", "/menu": "menu", "/time": "time", "/bazi": "bazi", "/lunar": "lunar", "/natal": "natal", "/profile": "profile", "/settings": "settings", "/status": "profile", "/help": "menu" };
    if (command === "/start") { await deps.markStarted?.(id); const tester = await deps.testerState?.(id, msg.from?.username); await start(id, tester); return true; }
    if (command === "/stop") { await setDelivery(id, false); return true; }
    if (command === "/resume") { await setDelivery(id, true); return true; }
    if (map[command]) { await route(id, map[command], command === "/bazi" ? "0" : undefined); return true; }
    if (text && !text.startsWith("/")) { const r = await onText(id, text); if (r !== false) return true; }
    return false; // остальное (оплата, контакт, /day, /plans) — старый обработчик
  }

  async function route(id, cmd, arg) {
    switch (cmd) {
      case "today": return showForecast(id, "today");
      case "tomorrow": return showForecast(id, "tomorrow");
      case "bazi": return bazi(id, arg);
      case "time":
        if (arg === "custom") { await prefs(id); await db.unsafe("UPDATE astroday_v2_prefs SET awaiting='time' WHERE telegram_id=$1", [id]); return send(id, "Напиши время в формате ЧЧ:ММ, например <b>07:30</b> ✍️", back()); }
        if (arg === "off") return setDelivery(id, false);
        if (arg === "on") return setDelivery(id, true);
        return arg ? setTime(id, arg) : timeScreen(id);
      case "lunar": return lunar(id);
      case "natal": return natal(id);
      case "profile": return profile(id);
      case "name": return arg ? setName(id, arg) : nameScreen(id);
      case "settings": return settings(id);
      default: return menu(id);
    }
  }

  return { handleUpdate, route, showForecast, start, menu };
}
