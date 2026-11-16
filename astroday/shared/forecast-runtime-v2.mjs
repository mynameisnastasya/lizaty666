async function calculateProfileForecast(p, day, recentTexts = [], options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
    throw new ForecastError("invalid_forecast_day", 400);
  const token = Bun.env.ASTRO_INTERNAL_TOKEN || "";
  if (token.length < 32)
    throw new ForecastError("forecast_engine_not_configured");
  const ask = (accurate) => fetch("http://liz-astro-v2.railway.internal:8080/v2/forecast", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ day, timeZone: p.time_zone, birth: { at: new Date(p.birth_at_iso).toISOString(), latitude: Number(p.birth_lat), longitude: Number(p.birth_lon), accurateBirthTime: accurate } }), signal: AbortSignal.timeout(45000) });
  let accurate = p.birth_time_verified === true, polar = false;
  let r = await ask(accurate);
  if (r.status === 422 && accurate) {
    // За полярным кругом система Placidus не определена. Не подменяем её другой системой домов:
    // считаем без домов и без натальной Луны и честно помечаем это в расчёте.
    const detail = await r.json().catch(() => null);
    if (/placidus/i.test(String(detail?.error || detail?.detail || ""))) {
      polar = true;
      accurate = false;
      r = await ask(false);
    }
  }
  if (!r.ok)
    throw new ForecastError("forecast_engine_http_" + r.status);
  const calc = await r.json();
  if (calc.version !== FORECAST_ENGINE_VERSION || calc.houseSystem !== "placidus" || calc.day !== day || calc.timeZone !== p.time_zone || calc.houseKnown !== accurate || calc.natalMoonReliable !== accurate)
    throw new ForecastError("forecast_calculation_contract_mismatch");
  if (polar) calc.housesUnavailableReason = "placidus_undefined_at_birth_latitude";
  const opts = { preferredName: p.preferred_name || "", recentTexts };
  if (options.editorial === "openai") {
    const written = await lizaWriteForecast(options.db, getEditorialBrief(calc, opts), opts);
    return { calculation: calc, text: written.text, mode: "openai_editorial", factIds: written.factIds, source: "openai", editorialMeta: written.meta, profile_fingerprint: profileFingerprint(p) };
  }
  const rendered = renderDailyForecast(calc, opts);
  return { calculation: calc, ...rendered, source: options.editorial === "fallback" ? "calculated_fallback" : "calculated", editorialMeta: options.fallbackReason ? { fallbackReason: options.fallbackReason, attempts: options.fallbackAttempts || null } : null, profile_fingerprint: profileFingerprint(p) };
}
var FORECAST_ACCEPTED_SOURCES = new Set(["tester_approved", "openai", "calculated_fallback"]);
async function ensureDailyForecast(db, id, day, options = {}) {
  await ensureForecastSchema(db);
  const loadProfile = async () => (await db.unsafe("SELECT p.*,p.birth_local_date::text AS birth_day,s.valid_until FROM liz_birth_profiles p LEFT JOIN liz_subscriptions s ON s.telegram_id=p.telegram_id WHERE p.telegram_id=$1 LIMIT 1", [id]))[0];
  const p = await loadProfile();
  if (!p)
    throw new ForecastError("birth_profile_required", 404);
  if (options.requireSubscription !== false && (!p.valid_until || Date.parse(p.valid_until) <= Date.now()))
    throw new ForecastError("active_subscription_required", 403);
  if (day !== localForecastDay(p.time_zone))
    throw new ForecastError("only_current_local_day_available", 400);
  const fp = profileFingerprint(p), due = forecastDueAt(day, p.time_zone, Number(p.delivery_hour_local));
  const cfg = lizaEditorialConfig();
  const wantOpenAI = cfg.enabled && options.editorial !== "off";
  const load = async () => (await db.unsafe("SELECT *,forecast_date::text AS day FROM liz_daily_messages WHERE telegram_id=$1 AND forecast_date=$2::date", [id, day]))[0];
  let cached = await load();
  const base = (x) => x?.generation_state === "ready" && x.engine_version === FORECAST_ENGINE_VERSION && x.editorial_version === FORECAST_EDITORIAL_VERSION && x.profile_fingerprint === fp && typeof x.body === "string" && x.body.length >= 150;
  // Уже отправленный (полностью или частично) текст не переписываем.
  const good = (x) => base(x) && (!wantOpenAI || FORECAST_ACCEPTED_SOURCES.has(x.text_source) || !!x.sent_at || Number(x.telegram_next_part_index || 0) > 0);
  if (good(cached))
    return cached;
  const sameProfile = cached?.profile_fingerprint === fp;
  const priorAttempts = sameProfile ? Number(cached?.editorial_attempts || 0) : 0;
  // Крайний срок отсчитывается от более позднего из: времени доставки и первой попытки генерации.
  const firstAttemptAt = sameProfile && cached?.editorial_first_attempt_at ? Date.parse(cached.editorial_first_attempt_at) : Date.now();
  const graceAt = Math.max(Date.parse(due), firstAttemptAt) + cfg.fallbackGraceMinutes * 60000;
  if (wantOpenAI && cached?.generation_state === "waiting_editorial" && cached.profile_fingerprint === fp && cached.next_editorial_at && Date.parse(cached.next_editorial_at) > Date.now() && !(cfg.fallbackPolicy !== "hold" && Date.now() >= graceAt))
    throw new ForecastError("forecast_preparing_retry", 202);
  const token = randomUUID();
  const lease = await db.unsafe("INSERT INTO liz_daily_messages(telegram_id,forecast_date,body,due_at,generation_state,generation_token,generation_started_at) VALUES($1,$2::date,'Прогноз готовится.',$3::timestamptz,'generating',$4::uuid,NOW()) ON CONFLICT(telegram_id,forecast_date) DO UPDATE SET generation_state='generating',generation_token=$4::uuid,generation_started_at=NOW(),due_at=CASE WHEN liz_daily_messages.status='pending' AND liz_daily_messages.due_at<$3::timestamptz AND liz_daily_messages.delivery_purpose='first_result' THEN liz_daily_messages.due_at ELSE $3::timestamptz END WHERE liz_daily_messages.generation_state<>'generating' OR liz_daily_messages.generation_started_at<NOW()-INTERVAL '3 minutes' RETURNING id", [id, day, due, token]);
  if (!lease.length) {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 800));
      cached = await load();
      if (good(cached))
        return cached;
    }
    throw new ForecastError("forecast_preparing_retry", 202);
  }
  let parked = false;
  try {
    const tester = await db.unsafe("SELECT f.body,f.calculation,f.fact_ids,f.text_mode FROM liz_tester_forecasts f JOIN liz_astro_testers t ON t.handle_key=f.handle_key WHERE t.verified_telegram_id=$1 AND f.forecast_day=$2::date AND f.profile_fingerprint=$3 AND f.engine_version=$4 AND f.editorial_version=$5 LIMIT 1", [id, day, fp, FORECAST_ENGINE_VERSION, FORECAST_EDITORIAL_VERSION]);
    let generated, attemptsUsed = 0, lastEditorialError = null;
    if (tester[0])
      generated = { text: tester[0].body, calculation: tester[0].calculation, factIds: tester[0].fact_ids, mode: tester[0].text_mode, source: "tester_approved", editorialMeta: null };
    else {
      const recent = await db.unsafe("SELECT body FROM liz_daily_messages WHERE telegram_id=$1 AND forecast_date<$2::date AND generation_state='ready' ORDER BY forecast_date DESC LIMIT 3", [id, day]);
      const recentBodies = recent.map((x) => x.body);
      if (wantOpenAI) {
        try {
          generated = await calculateProfileForecast(p, day, recentBodies, { editorial: "openai", db });
          attemptsUsed = priorAttempts + 1;
        } catch (e) {
          if (!(e instanceof LizaEditorialError))
            throw e;
          attemptsUsed = priorAttempts + 1;
          lastEditorialError = e.code;
          const allowFallback = cfg.fallbackPolicy !== "hold" && (attemptsUsed >= cfg.maxAttemptsPerDay || Date.now() >= graceAt);
          console.error("FORECAST_EDITORIAL_FAIL " + JSON.stringify({ code: e.code, attempts: attemptsUsed, fallback: allowFallback }));
          if (attemptsUsed === 1 || allowFallback)
            await adminNotify(db, "alert", (allowFallback ? "🟠 <b>Прогноз уйдёт расчётным текстом без OpenAI</b>" : "⚠️ <b>OpenAI не выдал текст — повторю позже</b>") + "\n" + adminEsc(await adminWho(db, id)) + "\n" + day + " · попытка " + attemptsUsed + " · " + adminEsc(e.code), "editorial:" + id + ":" + day + ":" + (allowFallback ? "fallback" : "first"));
          if (!allowFallback) {
            const backoff = Math.min(60, 5 * 2 ** (attemptsUsed - 1)) * 60000;
            const next = new Date(Date.now() + Math.max(backoff, Number(e.detail?.retryAfterSec || 0) * 1000)).toISOString();
            await db.unsafe("UPDATE liz_daily_messages SET generation_state='waiting_editorial',generation_token=NULL,editorial_attempts=$3,next_editorial_at=$4::timestamptz,editorial_error=$5,profile_fingerprint=$6,editorial_meta=($7::text)::jsonb,editorial_first_attempt_at=COALESCE(CASE WHEN profile_fingerprint=$6 THEN editorial_first_attempt_at END,$8::timestamptz) WHERE id=$1::uuid AND generation_token=$2::uuid", [lease[0].id, token, attemptsUsed, next, e.code, fp, JSON.stringify({ lastError: e.code, attempts: e.detail?.attempts || null }), new Date(firstAttemptAt).toISOString()]);
            parked = true;
            throw new ForecastError("forecast_preparing_retry", 202);
          }
          generated = await calculateProfileForecast(p, day, recentBodies, { editorial: "fallback", fallbackReason: e.code, fallbackAttempts: attemptsUsed });
        }
      } else
        generated = await calculateProfileForecast(p, day, recentBodies, {});
    }
    const now = await loadProfile();
    if (!now || profileFingerprint(now) !== fp || options.requireSubscription !== false && (!now.valid_until || !Number.isFinite(Date.parse(now.valid_until)) || Date.parse(now.valid_until) <= Date.now()))
      throw new ForecastError("profile_changed_during_calculation", 409);
    const meta = generated.editorialMeta || null;
    const saved = await db.unsafe("UPDATE liz_daily_messages SET body=$2,calculation=($3::text)::jsonb,fact_ids=($4::text)::jsonb,engine_version=$5,editorial_version=$6,profile_fingerprint=$7,text_mode=$8,text_source=$10,editorial_prompt_version=$11,editorial_model=$12,editorial_meta=($13::text)::jsonb,editorial_attempts=$14,editorial_error=$15,next_editorial_at=NULL,generation_state='ready',generation_token=NULL,prepared_at=NOW(),error_code=NULL,status=CASE WHEN status='cancelled' AND sent_at IS NULL AND telegram_next_part_index=0 THEN 'pending' ELSE status END,telegram_html_parts=CASE WHEN sent_at IS NULL AND telegram_next_part_index=0 THEN NULL ELSE telegram_html_parts END WHERE id=$1::uuid AND generation_token=$9::uuid RETURNING *,forecast_date::text AS day", [lease[0].id, generated.text, JSON.stringify(generated.calculation), JSON.stringify(generated.factIds), FORECAST_ENGINE_VERSION, FORECAST_EDITORIAL_VERSION, fp, generated.mode, token, generated.source, meta?.promptVersion || null, meta?.model || null, meta ? JSON.stringify(meta) : null, attemptsUsed, lastEditorialError]);
    if (!saved.length)
      throw new ForecastError("forecast_generation_claim_lost");
    console.log("FORECAST_READY " + JSON.stringify({ day, source: generated.source, attempts: attemptsUsed, model: meta?.model || null }));
    return saved[0];
  } catch (e) {
    if (!parked)
      await db.unsafe("UPDATE liz_daily_messages SET generation_state='failed',generation_token=NULL,error_code=$2 WHERE id=$1::uuid AND generation_token=$3::uuid", [lease[0].id, String(e?.code || e?.message || "generation_failed").slice(0, 160), token]);
    throw e;
  }
}
