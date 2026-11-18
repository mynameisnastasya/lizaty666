// ASTRODAY 2.0 — очередь предварительной генерации прогнозов, хранение, восстановление.
// Спецификация: docs/FORECAST_QUEUE_SPEC.md, docs/FORECAST_GENERATION_SPEC.md.
import { createHash } from "node:crypto";
import { localDay, addDays, daysBetween, validZone } from "./timefmt.mjs";
import { selectTopics, TOPICS_VERSION } from "./topics.mjs";
import { writeForecast, PROMPT_VERSION } from "./editorial.mjs";
import { addressName, grammaticalGender } from "./names.mjs";
import { dayMaster, jieCaiCalendar, BAZI_VERSION } from "./bazi.mjs";

export const QUEUE_VERSION = "astroday-queue-v1";
export const STATES = ["pending", "calculating", "generating", "validating", "ready", "failed", "invalidated"];

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS astroday_v2_users(telegram_id TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT TRUE, added_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS astroday_v2_prefs(telegram_id TEXT PRIMARY KEY, delivery_time TEXT NOT NULL DEFAULT '08:00' CHECK (delivery_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE, address_mode TEXT NOT NULL DEFAULT 'original' CHECK (address_mode IN ('original','affectionate','custom','none')), address_value TEXT, awaiting TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS astroday_v2_periods(id BIGSERIAL PRIMARY KEY, telegram_id TEXT NOT NULL, source TEXT NOT NULL, source_ref TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), processed_at TIMESTAMPTZ, UNIQUE(source, source_ref))`,
  `CREATE TABLE IF NOT EXISTS astroday_v2_forecasts(
     telegram_id TEXT NOT NULL, forecast_date DATE NOT NULL, generation_key TEXT NOT NULL,
     profile_fp TEXT NOT NULL, time_zone TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','calculating','generating','validating','ready','failed','invalidated')),
     priority INTEGER NOT NULL DEFAULT 100, attempts INTEGER NOT NULL DEFAULT 0, lease_until TIMESTAMPTZ, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     notify_on_ready TEXT, facts JSONB, topics JSONB, lunar JSONB, model_output JSONB, body_html TEXT, validation JSONB,
     prompt_version TEXT NOT NULL, model TEXT NOT NULL, engine_version TEXT, lunar_version TEXT, topics_version TEXT,
     openai_response_id TEXT, input_tokens INTEGER, output_tokens INTEGER, error TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY(telegram_id, forecast_date, generation_key))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS astroday_v2_forecasts_current ON astroday_v2_forecasts(telegram_id, forecast_date) WHERE status <> 'invalidated'`,
  `CREATE INDEX IF NOT EXISTS astroday_v2_forecasts_work ON astroday_v2_forecasts(priority, forecast_date) WHERE status IN ('pending','calculating','generating','validating','failed')`,
  `CREATE TABLE IF NOT EXISTS astroday_v2_lunar(location_key TEXT NOT NULL, day DATE NOT NULL, lunar_version TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(location_key, day, lunar_version))`,
  `CREATE TABLE IF NOT EXISTS astroday_v2_bazi(telegram_id TEXT NOT NULL, birth_fp TEXT NOT NULL, start_day DATE NOT NULL, end_day DATE NOT NULL, day_master JSONB NOT NULL, days JSONB NOT NULL, bazi_version TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(telegram_id, birth_fp, bazi_version))`,
  `CREATE TABLE IF NOT EXISTS astroday_v2_deliveries(telegram_id TEXT NOT NULL, forecast_date DATE NOT NULL, status TEXT NOT NULL CHECK (status IN ('sending','sent','failed','review','skipped')), message_ids JSONB, attempts INTEGER NOT NULL DEFAULT 1, error TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(telegram_id, forecast_date))`,
  `CREATE TABLE IF NOT EXISTS astroday_v2_alerts(alert_key TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS astroday_openai_usage(usage_day DATE PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0, input_tokens BIGINT NOT NULL DEFAULT 0, output_tokens BIGINT NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
];
const schemaReady = new WeakMap();
export async function ensureSchema(db) {
  if (!schemaReady.has(db)) schemaReady.set(db, (async () => { for (const s of SCHEMA) await db.unsafe(s); })());
  try { await schemaReady.get(db); } catch (e) { schemaReady.delete(db); throw e; }
}

const sha = (s) => createHash("sha256").update(s).digest("hex");
// Отпечаток данных, от которых зависит РАСЧЁТ (время доставки сюда не входит).
export function chartFingerprint(p) {
  return sha(JSON.stringify([String(p.birth_at_iso), String(p.birth_day || p.birth_local_date).slice(0, 10), Number(p.birth_lat), Number(p.birth_lon), p.birth_time_verified === true, p.birth_timezone, p.time_zone, p.current_lat == null ? null : Number(p.current_lat), p.current_lon == null ? null : Number(p.current_lon)])).slice(0, 24);
}
export function birthFingerprint(p) {
  return sha(JSON.stringify([String(p.birth_day || p.birth_local_date).slice(0, 10), String(p.birth_at_iso), p.birth_time_verified === true, p.birth_timezone])).slice(0, 24);
}
export function generationKey({ profileFp, engineVersion, lunarVersion, model }) {
  return sha([profileFp, engineVersion, lunarVersion, PROMPT_VERSION, TOPICS_VERSION, model].join("|")).slice(0, 20);
}

export async function loadUser(db, id) {
  const r = await db.unsafe(`SELECT p.*, p.birth_local_date::text AS birth_day, s.valid_until, s.source AS access_source,
      COALESCE(c.notify_enabled, TRUE) AS notify_enabled, c.bot_blocked_at, COALESCE(g.daily_delivery, p.consented_to_daily, FALSE) AS consent,
      pr.delivery_time, pr.delivery_enabled, pr.address_mode, pr.address_value, (u.telegram_id IS NOT NULL AND u.enabled) AS v2
    FROM liz_birth_profiles p LEFT JOIN liz_subscriptions s USING(telegram_id) LEFT JOIN liz_clients c USING(telegram_id)
    LEFT JOIN liz_tg_consents g USING(telegram_id) LEFT JOIN astroday_v2_prefs pr USING(telegram_id) LEFT JOIN astroday_v2_users u USING(telegram_id)
    WHERE p.telegram_id=$1`, [id]);
  return r[0] || null;
}

// Последняя локальная дата доступа: дата D доступна, если локальная полночь D раньше конца доступа.
export function lastAccessDay(validUntil, zone) {
  const end = Date.parse(validUntil || "");
  if (!Number.isFinite(end)) return null;
  return localDay(zone, end - 1);
}
export function accessCovers(user, day, now = Date.now()) {
  if (!user?.valid_until) return false;
  const last = lastAccessDay(user.valid_until, user.time_zone);
  const today = localDay(user.time_zone, now);
  return !!last && day <= last && day >= addDays(today, -1);
}

// Окно генерации: от сегодня до конца доступа, но не дальше windowDays (скользящее окно для 6/12 мес).
export function generationWindow(user, now = Date.now(), windowDays = 31) {
  if (!user?.time_zone || !validZone(user.time_zone)) return null;
  const today = localDay(user.time_zone, now);
  const last = lastAccessDay(user.valid_until, user.time_zone);
  if (!last || last < today) return null;
  const capped = addDays(today, windowDays - 1);
  return { start: today, end: last < capped ? last : capped, accessEnd: last };
}

export async function invalidateStale(db, id, { profileFp, engineVersion, lunarVersion }, fromDay) {
  // Пересчёт нужен, только если изменились ДАННЫЕ расчёта (анкета/город/часовой пояс) или версия движка.
  // Смена промпта/модели готовые тексты не трогает (экономия); новые дни пишутся новой версией.
  const r = await db.unsafe(`UPDATE astroday_v2_forecasts SET status='invalidated', lease_until=NULL, updated_at=NOW()
     WHERE telegram_id=$1 AND forecast_date>=$2::date AND status<>'invalidated'
       AND (profile_fp<>$3 OR engine_version IS DISTINCT FROM $4 OR lunar_version IS DISTINCT FROM $5)
       AND NOT EXISTS(SELECT 1 FROM astroday_v2_deliveries d WHERE d.telegram_id=$1 AND d.forecast_date=astroday_v2_forecasts.forecast_date AND d.status IN ('sent','sending','review'))
     RETURNING forecast_date`, [id, fromDay, profileFp, engineVersion, lunarVersion]);
  return r.length;
}

export async function enqueueRange(db, user, { start, end, key, model, engineVersion, lunarVersion, today }) {
  const n = daysBetween(start, end) + 1;
  if (n <= 0) return 0;
  let inserted = 0;
  for (let i = 0; i < n; i++) {
    const day = addDays(start, i);
    const off = daysBetween(today, day);
    const priority = off <= 0 ? 0 : off === 1 ? 1 : 10 + off;
    const r = await db.unsafe(`INSERT INTO astroday_v2_forecasts(telegram_id, forecast_date, generation_key, profile_fp, time_zone, status, priority, prompt_version, model, engine_version, lunar_version, topics_version)
       VALUES($1,$2::date,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING RETURNING forecast_date`,
      [user.telegram_id, day, key, chartFingerprint(user), user.time_zone, priority, PROMPT_VERSION, model, engineVersion, lunarVersion, TOPICS_VERSION]);
    inserted += r.length;
  }
  return inserted;
}

// Синхронизация: для каждого пользователя v2 с анкетой и активным доступом гарантирует строки на окно
// и календарь Грабителя на весь период доступа. Идемпотентно: повтор ничего не дублирует.
export async function syncUsers(db, cfg, { now = Date.now(), onlyId = null } = {}) {
  await ensureSchema(db);
  const ids = onlyId ? [onlyId] : (await db.unsafe(`SELECT u.telegram_id FROM astroday_v2_users u JOIN liz_birth_profiles p USING(telegram_id) JOIN liz_subscriptions s USING(telegram_id) WHERE u.enabled AND s.valid_until>NOW()`)).map((r) => r.telegram_id);
  const out = { users: 0, enqueued: 0, invalidated: 0, bazi: 0 };
  for (const id of ids) {
    const user = await loadUser(db, id);
    if (!user || !user.v2) continue;
    const win = generationWindow(user, now, cfg.windowDays || 31);
    if (!win) continue;
    out.users++;
    const key = generationKey({ profileFp: chartFingerprint(user), engineVersion: cfg.engineVersion, lunarVersion: cfg.lunarVersion, model: cfg.model });
    out.invalidated += await invalidateStale(db, id, { profileFp: chartFingerprint(user), engineVersion: cfg.engineVersion, lunarVersion: cfg.lunarVersion }, win.start);
    out.enqueued += await enqueueRange(db, user, { ...win, key, model: cfg.model, engineVersion: cfg.engineVersion, lunarVersion: cfg.lunarVersion, today: win.start });
    out.bazi += await ensureBazi(db, user, win.start, win.accessEnd);
  }
  await db.unsafe("UPDATE astroday_v2_periods SET processed_at=NOW() WHERE processed_at IS NULL" + (onlyId ? " AND telegram_id=$1" : ""), onlyId ? [onlyId] : []);
  return out;
}

export async function ensureBazi(db, user, startDay, endDay) {
  const fp = birthFingerprint(user);
  const have = (await db.unsafe("SELECT start_day::text AS s, end_day::text AS e FROM astroday_v2_bazi WHERE telegram_id=$1 AND birth_fp=$2 AND bazi_version=$3", [user.telegram_id, fp, BAZI_VERSION]))[0];
  if (have && have.s <= startDay && have.e >= endDay) return 0;
  const timeMatch = /T(\d{2}:\d{2})/.exec(String(user.birth_at_iso || ""));
  // Время рождения → местное время места рождения.
  let localTime = null;
  if (user.birth_time_verified === true && user.birth_timezone) {
    try { localTime = new Intl.DateTimeFormat("en-GB", { timeZone: user.birth_timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(user.birth_at_iso)); } catch { localTime = timeMatch?.[1] || null; }
  }
  const dm = dayMaster({ birthLocalDate: user.birth_day, birthLocalTime: localTime, timeKnown: user.birth_time_verified === true });
  const s = have && have.s < startDay ? have.s : startDay;
  const days = jieCaiCalendar({ dm, startDay: s, endDay });
  await db.unsafe(`INSERT INTO astroday_v2_bazi(telegram_id, birth_fp, start_day, end_day, day_master, days, bazi_version) VALUES($1,$2,$3::date,$4::date,$5::jsonb,$6::jsonb,$7)
     ON CONFLICT(telegram_id, birth_fp, bazi_version) DO UPDATE SET start_day=EXCLUDED.start_day, end_day=EXCLUDED.end_day, day_master=EXCLUDED.day_master, days=EXCLUDED.days, created_at=NOW()`,
    [user.telegram_id, fp, s, endDay, dm, days, BAZI_VERSION]);
  return 1;
}

// ---------------------------------------------------------------- worker
export async function claim(db, { limit = 3, leaseSec = 240, onlyId = null, onlyDay = null } = {}) {
  const filter = onlyId ? " AND telegram_id=$2 AND forecast_date=$3::date" : "";
  return db.unsafe(`UPDATE astroday_v2_forecasts f SET status='calculating', lease_until=NOW()+make_interval(secs=>$1::int), attempts=f.attempts+1, updated_at=NOW()
     WHERE (f.telegram_id, f.forecast_date, f.generation_key) IN (
       SELECT telegram_id, forecast_date, generation_key FROM astroday_v2_forecasts
        WHERE ((status='pending' AND next_attempt_at<=NOW()) OR (status IN ('calculating','generating','validating') AND lease_until<NOW()) OR (status='failed' AND attempts<6 AND next_attempt_at<=NOW()))` + filter + `
        ORDER BY priority, forecast_date LIMIT ` + Math.max(1, Math.min(20, limit | 0)) + ` FOR UPDATE SKIP LOCKED)
     RETURNING f.*, f.forecast_date::text AS day`, onlyId ? [leaseSec, onlyId, onlyDay] : [leaseSec]);
}

const BACKOFF_MIN = [2, 5, 15, 45, 120, 360];
async function fail(db, row, err) {
  const retry = row.attempts < 6;
  await db.unsafe(`UPDATE astroday_v2_forecasts SET status='failed', lease_until=NULL, error=$4, next_attempt_at=NOW()+make_interval(mins=>$5::int), updated_at=NOW()
     WHERE telegram_id=$1 AND forecast_date=$2::date AND generation_key=$3 AND status<>'invalidated'`, [row.telegram_id, row.day, row.generation_key, String(err?.message || err).slice(0, 200), retry ? BACKOFF_MIN[Math.min(row.attempts, 5)] : 100000]);
}
async function setState(db, row, status, extra = {}) {
  const cols = Object.keys(extra);
  const sets = cols.map((c, i) => c + "=$" + (i + 5) + (["facts", "topics", "lunar", "model_output", "validation"].includes(c) ? "::jsonb" : "")).join(",");
  const vals = cols.map((c) => extra[c]); // Bun SQL кодирует объекты в jsonb сам (строку закодировал бы как JSON-строку)
  const r = await db.unsafe(`UPDATE astroday_v2_forecasts SET status=$4, updated_at=NOW()` + (sets ? "," + sets : "") + ` WHERE telegram_id=$1 AND forecast_date=$2::date AND generation_key=$3 AND status NOT IN ('invalidated','ready') RETURNING status`, [row.telegram_id, row.day, row.generation_key, status, ...vals]);
  if (!r.length) { const e = Error("row_invalidated_during_processing"); e.stop = true; throw e; }
}

async function budgetOk(db, max) {
  const r = await db.unsafe("SELECT requests FROM astroday_openai_usage WHERE usage_day=(NOW() AT TIME ZONE 'UTC')::date");
  return Number(r[0]?.requests || 0) < max;
}
async function recordUsage(db, usage, failed = false) {
  await db.unsafe(`INSERT INTO astroday_openai_usage(usage_day, requests, input_tokens, output_tokens, failures) VALUES((NOW() AT TIME ZONE 'UTC')::date, 1, $1, $2, $3)
     ON CONFLICT(usage_day) DO UPDATE SET requests=astroday_openai_usage.requests+1, input_tokens=astroday_openai_usage.input_tokens+$1, output_tokens=astroday_openai_usage.output_tokens+$2, failures=astroday_openai_usage.failures+$3, updated_at=NOW()`,
    [Number(usage?.input_tokens || 0), Number(usage?.output_tokens || 0), failed ? 1 : 0]);
}

export function locationOf(user, geoFallback = {}) {
  const lat = Number(user.current_lat), lon = Number(user.current_lon);
  if (Number.isFinite(lat) && Number.isFinite(lon) && user.current_lat != null) return { lat, lon, approx: false, city: user.current_city_name || null };
  const g = geoFallback[user.time_zone];
  if (g) return { lat: g[0], lon: g[1], approx: true, city: g[2] };
  return { lat: Number(user.birth_lat), lon: Number(user.birth_lon), approx: true, city: user.birth_city_name || null };
}
export const ZONE_CAPITALS = { "Europe/Moscow": [55.7558, 37.6173, "Москва"], "Asia/Novokuznetsk": [55.3547, 86.0873, "Кемерово"], "Asia/Novosibirsk": [55.0084, 82.9357, "Новосибирск"], "Asia/Krasnoyarsk": [56.0153, 92.8932, "Красноярск"], "Asia/Ho_Chi_Minh": [10.8231, 106.6297, "Хошимин"], "Asia/Yekaterinburg": [56.8389, 60.6057, "Екатеринбург"], "Asia/Omsk": [54.9885, 73.3242, "Омск"], "Asia/Irkutsk": [52.2870, 104.3050, "Иркутск"], "Asia/Vladivostok": [43.1155, 131.8855, "Владивосток"], "Europe/Kaliningrad": [54.7104, 20.4522, "Калининград"], "Europe/Samara": [53.1959, 50.1002, "Самара"], "Asia/Makassar": [-8.6705, 115.2126, "Денпасар"], "Asia/Bangkok": [13.7563, 100.5018, "Бангкок"], "Asia/Tomsk": [56.4846, 84.9476, "Томск"], "Asia/Barnaul": [53.3474, 83.7784, "Барнаул"] };

export async function lunarFor(db, deps, user, day) {
  const loc = locationOf(user, ZONE_CAPITALS);
  const key = user.time_zone + "|" + loc.lat.toFixed(2) + "|" + loc.lon.toFixed(2);
  const hit = (await db.unsafe("SELECT data FROM astroday_v2_lunar WHERE location_key=$1 AND day=$2::date AND lunar_version=$3", [key, day, deps.lunarVersion]))[0];
  if (hit) return { ...hit.data, location: loc };
  // Один запрос на 35 дней вперёд, кэшируется по месту.
  const cal = await deps.engine.lunar({ startDay: day, days: 35, timeZone: user.time_zone, latitude: loc.lat, longitude: loc.lon });
  if (cal?.lunarVersion !== deps.lunarVersion || !Array.isArray(cal.days)) throw Error("lunar_contract_invalid");
  for (const d of cal.days) await db.unsafe("INSERT INTO astroday_v2_lunar(location_key, day, lunar_version, data) VALUES($1,$2::date,$3,$4::jsonb) ON CONFLICT DO NOTHING", [key, d.day, deps.lunarVersion, d]);
  const row = cal.days.find((d) => d.day === day);
  if (!row) throw Error("lunar_day_missing");
  return { ...row, location: loc };
}

async function recentOpenings(db, id, day) {
  const r = await db.unsafe("SELECT model_output->>'headline' AS h, model_output->>'opening' AS o FROM astroday_v2_forecasts WHERE telegram_id=$1 AND status='ready' AND forecast_date BETWEEN $2::date-7 AND $2::date+7 AND forecast_date<>$2::date ORDER BY abs(forecast_date-$2::date) LIMIT 8", [id, day]);
  return r.flatMap((x) => [x.h, x.o]).filter(Boolean);
}

export async function processRow(db, row, deps) {
  try {
    const user = await loadUser(db, row.telegram_id);
    if (!user) throw Object.assign(Error("profile_missing"), { stop: true });
    if (chartFingerprint(user) !== row.profile_fp) { await db.unsafe("UPDATE astroday_v2_forecasts SET status='invalidated', lease_until=NULL, updated_at=NOW() WHERE telegram_id=$1 AND forecast_date=$2::date AND generation_key=$3", [row.telegram_id, row.day, row.generation_key]); return { status: "invalidated" }; }
    // 1. расчёт (детерминированно; при повторе используем сохранённый)
    let calc = row.facts;
    if (!calc) {
      calc = await deps.engine.forecast({ day: row.day, timeZone: user.time_zone, localHour: 12, includeSky: true, birth: { at: user.birth_at_iso, accurateBirthTime: user.birth_time_verified === true, latitude: Number(user.birth_lat), longitude: Number(user.birth_lon) } });
      if (calc?.version !== deps.engineVersion || calc?.day !== row.day || calc?.calculationStatus !== "verified_v2") throw Error("engine_contract_invalid");
    }
    const lunar = row.lunar || await lunarFor(db, deps, user, row.day);
    const selection = selectTopics(calc);
    await setState(db, row, "generating", { facts: calc, lunar, topics: selection, engine_version: calc.version, lunar_version: deps.lunarVersion });
    // 2. текст
    if (!(await budgetOk(db, deps.dailyRequestBudget || 600))) { const e = Error("openai_daily_budget_reached"); throw e; }
    const name = addressName({ profileName: user.preferred_name, mode: user.address_mode || "original", custom: user.address_value, affectionate: user.address_value });
    const ctx = { day: row.day, zone: user.time_zone, cityName: lunar.location?.city || user.current_city_name, name, gender: grammaticalGender(user.preferred_name), selection, lunar, voc: lunar.voidOfCourse || [], recentOpenings: await recentOpenings(db, row.telegram_id, row.day) };
    const res = await deps.writer(ctx, { onUsage: (u) => recordUsage(db, u) });
    await setState(db, row, "validating", { validation: { attempts: res.attempts } });
    if (!res.ok) { await recordUsage(db, null, true); throw Error("validation_failed:" + (res.attempts.at(-1)?.problems || []).slice(0, 4).join(",")); }
    const last = res.attempts.at(-1);
    await db.unsafe(`UPDATE astroday_v2_forecasts SET status='ready', lease_until=NULL, error=NULL, model_output=$4::jsonb, body_html=$5, validation=$6::jsonb, model=$7, openai_response_id=$8, input_tokens=$9, output_tokens=$10, prompt_version=$11, updated_at=NOW()
       WHERE telegram_id=$1 AND forecast_date=$2::date AND generation_key=$3 AND status='validating'`,
      [row.telegram_id, row.day, row.generation_key, res.output, res.html, { ok: true, attempts: res.attempts }, res.model || row.model, res.responseId, Number(last?.usage?.input_tokens || 0), Number(last?.usage?.output_tokens || 0), PROMPT_VERSION]);
    return { status: "ready", html: res.html };
  } catch (e) {
    if (e?.stop) return { status: "stopped", error: e.message };
    await fail(db, row, e);
    return { status: "failed", error: String(e?.message || e) };
  }
}

export async function runWorker(db, deps, { budgetMs = 200000, concurrency = 3, maxRows = 60 } = {}) {
  await ensureSchema(db);
  const started = Date.now();
  const stats = { processed: 0, ready: 0, failed: 0 };
  const lane = async () => {
    while (Date.now() - started < budgetMs && stats.processed < maxRows) {
      const [row] = await claim(db, { limit: 1 });
      if (!row) return;
      stats.processed++;
      const r = await processRow(db, row, deps);
      if (r.status === "ready") { stats.ready++; if (row.notify_on_ready && deps.onReady) await deps.onReady(row, r).catch(() => {}); }
      else if (r.status === "failed") stats.failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, lane));
  return stats;
}

// ---------------------------------------------------------------- read side
export async function currentForecast(db, id, day) {
  return (await db.unsafe("SELECT *, forecast_date::text AS day FROM astroday_v2_forecasts WHERE telegram_id=$1 AND forecast_date=$2::date AND status<>'invalidated'", [id, day]))[0] || null;
}
export async function prioritize(db, id, day, notifyChat = null) {
  await db.unsafe("UPDATE astroday_v2_forecasts SET priority=0, next_attempt_at=LEAST(next_attempt_at, NOW()), notify_on_ready=COALESCE($3, notify_on_ready) WHERE telegram_id=$1 AND forecast_date=$2::date AND status IN ('pending','failed','calculating','generating','validating')", [id, day, notifyChat]);
}
export async function periodStatus(db, id) {
  return db.unsafe("SELECT status, count(*)::int AS n, min(forecast_date)::text AS first, max(forecast_date)::text AS last FROM astroday_v2_forecasts WHERE telegram_id=$1 AND status<>'invalidated' GROUP BY status ORDER BY status", [id]);
}
export async function baziFor(db, user) {
  return (await db.unsafe("SELECT *, start_day::text AS s, end_day::text AS e FROM astroday_v2_bazi WHERE telegram_id=$1 AND birth_fp=$2 AND bazi_version=$3", [user.telegram_id, birthFingerprint(user), BAZI_VERSION]))[0] || null;
}
