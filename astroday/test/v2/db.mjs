// Test helpers: fresh PostgreSQL database with the production columns ASTRODAY 2.0 reads.
import { SQL } from "bun";
const PG = "postgres://postgres@127.0.0.1:55432/";
export async function freshDb(name) {
  const admin = new SQL(PG + "postgres", { max: 1 });
  await admin.unsafe("DROP DATABASE IF EXISTS " + name + " WITH (FORCE)");
  await admin.unsafe("CREATE DATABASE " + name);
  await admin.close();
  const db = new SQL(PG + name, { max: 8 });
  await db.unsafe(`CREATE TABLE liz_clients(telegram_id TEXT PRIMARY KEY, telegram_username TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), notify_enabled BOOLEAN NOT NULL DEFAULT TRUE, chat_started_at TIMESTAMPTZ, bot_blocked_at TIMESTAMPTZ)`);
  await db.unsafe(`CREATE TABLE liz_birth_profiles(telegram_id TEXT PRIMARY KEY, birth_at_iso TEXT NOT NULL, birth_local_date DATE NOT NULL, birth_lat DOUBLE PRECISION NOT NULL, birth_lon DOUBLE PRECISION NOT NULL, birth_time_verified BOOLEAN NOT NULL, birth_timezone TEXT NOT NULL, time_zone TEXT NOT NULL, delivery_hour_local SMALLINT NOT NULL DEFAULT 8, consented_to_daily BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), preferred_name TEXT, birth_city_id BIGINT, current_city_id BIGINT, birth_city_name TEXT, current_city_name TEXT, current_lat DOUBLE PRECISION, current_lon DOUBLE PRECISION)`);
  await db.unsafe(`CREATE TABLE liz_subscriptions(telegram_id TEXT PRIMARY KEY, valid_until TIMESTAMPTZ NOT NULL, last_order_id UUID, source TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await db.unsafe(`CREATE TABLE liz_tg_consents(telegram_id TEXT PRIMARY KEY, terms_version TEXT, marketing BOOLEAN DEFAULT FALSE, daily_delivery BOOLEAN DEFAULT TRUE, accepted_at TIMESTAMPTZ DEFAULT NOW())`);
  return db;
}
export async function addUser(db, { id, name = "Анастасия Петрова", zone = "Asia/Novosibirsk", days = 30, birthAt = "1994-03-15T07:30:00Z", birthDay = "1994-03-15", timeKnown = true, city = null, lat = null, lon = null, v2 = true, source = "yookassa" }) {
  await db.unsafe("INSERT INTO liz_clients(telegram_id, chat_started_at) VALUES($1, NOW()) ON CONFLICT DO NOTHING", [id]);
  await db.unsafe("INSERT INTO liz_birth_profiles(telegram_id,birth_at_iso,birth_local_date,birth_lat,birth_lon,birth_time_verified,birth_timezone,time_zone,preferred_name,current_city_name,current_lat,current_lon) VALUES($1,$2,$3::date,55.35,86.08,$4,'Asia/Novokuznetsk',$5,$6,$7,$8,$9)", [id, birthAt, birthDay, timeKnown, zone, name, city, lat, lon]);
  await db.unsafe("INSERT INTO liz_subscriptions(telegram_id, valid_until, source) VALUES($1, NOW() + make_interval(days=>$2::int), $3)", [id, days, source]);
  await db.unsafe("INSERT INTO liz_tg_consents(telegram_id, daily_delivery) VALUES($1, TRUE)", [id]);
  if (v2) { await db.unsafe("CREATE TABLE IF NOT EXISTS astroday_v2_users(telegram_id TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT TRUE, added_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"); await db.unsafe("INSERT INTO astroday_v2_users(telegram_id) VALUES($1) ON CONFLICT DO NOTHING", [id]); }
}
