import {SQL} from "bun";

// ASTRODAY_DAILY7_V2 (2026-11-18): чистка повторов в тексте и проверка актуальности анкеты.
// astroday-daily7-20261118-v2-r1: пользователи ASTRODAY 2.0 (astroday_v2_users) получают прогнозы своей рассылкой — здесь пропускаются.
import {createHash} from "crypto";
const ENGINE_VERSION="astro-v2-placidus-swe-2.10", EDITORIAL_VERSION="astroday-editorial-v6-20261115";
function adCleanForecast(text) {
  const src = String(text || "");
  const isHeader = (t) => t.length > 0 && t.length < 115 && (t.startsWith("🔮") || /^[^\p{Ll}]{0,5}[\p{Lu}\d][^\p{Ll}]*$/u.test(t));
  const norm = (s) => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  let seen = " ";
  const out = src.split("\n").map((line) => {
    const t = line.trim();
    if (!t || isHeader(t)) return line;
    const parts = t.match(/[^.!?…]+(?:[.!?…]+[»"”)]*|$)/g) || [t];
    const kept = [];
    for (const raw of parts) {
      const s = raw.trim();
      if (!s) continue;
      const n = norm(s);
      if (n.length >= 24 && seen.includes(" " + n + " ")) continue;
      kept.push(raw);
      seen += n + " ";
    }
    return kept.length ? line.slice(0, line.length - line.trimStart().length) + kept.join("").trim() : line;
  }).join("\n");
  return out.replace(/(запомни|спроси себя|подумай): ([А-ЯЁ])(?=[а-яё])/g, (m, w, c) => w + ": " + c.toLowerCase());
}
function profileFingerprint(p){return createHash("sha256").update(JSON.stringify([String(p.birth_at_iso),String(p.birth_day||p.birth_local_date).slice(0,10),Number(p.birth_lat),Number(p.birth_lon),p.birth_time_verified===true,p.birth_timezone,p.time_zone,Number(p.delivery_hour_local)])).digest("hex")}
// Совпадает ли расчёт по содержанию: час доставки на текст не влияет, поэтому перебираем его.
function sameChart(p,fp){if(!p||!fp)return true;for(let h=0;h<24;h++)if(profileFingerprint({...p,delivery_hour_local:h})===fp)return true;return false}
const PROFILE_CHANGED_TEXT="Твоя анкета обновилась 🖤\n\nУтренний прогноз был посчитан по прежним данным, поэтому присылать его не буду. Нажми «Мой прогноз на сегодня» — посчитаю заново по новой анкете 🔮";
async function pickForecast(db,user,day){
  const rows=await db.unsafe("SELECT body,profile_fingerprint FROM liz_tester_forecasts WHERE handle_key=$1 AND forecast_day=$2::date ORDER BY created_at DESC LIMIT 1",[user.handle_key,day]);
  const cached=rows[0];
  const p=(await db.unsafe("SELECT *,birth_local_date::text AS birth_day FROM liz_birth_profiles WHERE telegram_id=$1",[user.chat_id]))[0];
  if(!p||sameChart(p,cached?.profile_fingerprint))return {body:cached?.body,source:"tester"};
  const fresh=(await db.unsafe("SELECT body FROM liz_daily_messages WHERE telegram_id=$1 AND forecast_date=$2::date AND generation_state='ready' AND profile_fingerprint=$3 AND engine_version=$4 AND editorial_version=$5 LIMIT 1",[user.chat_id,day,profileFingerprint(p),ENGINE_VERSION,EDITORIAL_VERSION]))[0];
  if(fresh?.body)return {body:fresh.body,source:"fresh"};
  return {body:PROFILE_CHANGED_TEXT,source:"profile_changed",markup:{inline_keyboard:[[{text:"🔮 Мой прогноз на сегодня",callback_data:"astroday_today"}]]}};
}

const DELIVERY_ZONE = "Asia/Novokuznetsk";
function deliveryDay(now = new Date()) {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:DELIVERY_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {day:p.year+'-'+p.month+'-'+p.day,due:Number(p.hour)===7 && Number(p.minute)<20};
}
function trialActive(user,day){return typeof user.trial_start==='string' && typeof user.trial_end==='string' && day>=user.trial_start && day<user.trial_end}
function telegramText(body){return String(body).split('\n').map(line=>{const t=line.trim();let out=line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>').replace(/\*\*/g,'');if(t.length>0 && t.length<115 && (t.startsWith('🔮') || /^[^\p{Ll}]{0,5}[\p{Lu}\d][^\p{Ll}]*$/u.test(t)) && !out.includes('<b>'))out='<b>'+out+'</b>';return out}).join('\n')}

export {runDaily,adCleanForecast,sameChart,profileFingerprint};
async function runDaily(db,token,send=fetch,now=new Date()) {
  const {day,due}=deliveryDay(now);
  const stats={eligible:0,due:0,sent:0,errors:0,review:0,skipped:0};
  // Keep the existing launch date and delivery window.
  if(day<'2026-11-17' || !due)return stats;
  if(!token)throw Error('telegram_not_configured');
  await db.unsafe("CREATE TABLE IF NOT EXISTS astroday_daily_delivery_claims(handle_key text NOT NULL,forecast_day date NOT NULL,status text NOT NULL,attempts int NOT NULL DEFAULT 1,message_id text,error_code text,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(handle_key,forecast_day))");
  await db.unsafe("CREATE TABLE IF NOT EXISTS astroday_v2_users(telegram_id TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT TRUE, added_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  const people=await db.unsafe("SELECT t.handle_key,t.verified_telegram_id::text AS chat_id,t.trial_start::date::text AS trial_start,t.trial_end_exclusive::date::text AS trial_end FROM liz_astro_testers t WHERE t.consent_status='confirmed_by_account_holder' AND t.verified_telegram_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM astroday_tester_joins j WHERE j.telegram_id=t.verified_telegram_id AND j.notifications_enabled=false) AND NOT EXISTS(SELECT 1 FROM liz_clients c WHERE c.telegram_id=t.verified_telegram_id AND c.notify_enabled=false) AND NOT EXISTS(SELECT 1 FROM astroday_v2_users v WHERE v.telegram_id=t.verified_telegram_id AND v.enabled)");
  stats.eligible=people.length;
  for(const user of people){
    if(!trialActive(user,day)){stats.skipped++;continue}
    stats.due++;
    const key='daily7:2026:'+user.handle_key+':'+day;
    const previous=await db.unsafe("SELECT status FROM liz_manual_telegram_tests WHERE test_key=$1 AND status='sent'",[key]);
    if(previous.length){stats.skipped++;continue}
    const picked=await pickForecast(db,user,day);
    const cleaned=typeof picked.body==='string'?adCleanForecast(picked.body).trim():'';
    if(!cleaned||cleaned.length>4000){stats.errors++;console.error('DAILY7_FORECAST_INVALID');continue}
    if(picked.source!=='tester'){stats[picked.source]=(stats[picked.source]||0)+1}
    const text=telegramText(cleaned);
    const claim=await db.unsafe("INSERT INTO astroday_daily_delivery_claims(handle_key,forecast_day,status) VALUES($1,$2::date,'sending') ON CONFLICT(handle_key,forecast_day) DO UPDATE SET status='sending',attempts=astroday_daily_delivery_claims.attempts+1,updated_at=now() WHERE astroday_daily_delivery_claims.status='retry' AND astroday_daily_delivery_claims.attempts<3 RETURNING handle_key",[user.handle_key,day]);
    if(!claim.length){stats.skipped++;continue}
    // Re-check consent after claiming to respect /stop while this run was waiting.
    const allowed=await db.unsafe("SELECT 1 FROM liz_astro_testers t WHERE t.handle_key=$1 AND t.verified_telegram_id=$2 AND t.consent_status='confirmed_by_account_holder' AND t.trial_start<=$3::date AND t.trial_end_exclusive>$3::date AND NOT EXISTS(SELECT 1 FROM astroday_tester_joins j WHERE j.telegram_id=$2 AND j.notifications_enabled=false) AND NOT EXISTS(SELECT 1 FROM liz_clients c WHERE c.telegram_id=$2 AND c.notify_enabled=false)",[user.handle_key,user.chat_id,day]);
    if(!allowed.length){await db.unsafe("UPDATE astroday_daily_delivery_claims SET status='cancelled',updated_at=now() WHERE handle_key=$1 AND forecast_day=$2::date",[user.handle_key,day]);stats.skipped++;continue}
    let response;
    try{
      const result=await send('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:user.chat_id,text,parse_mode:'HTML',disable_notification:false,disable_web_page_preview:true,...(picked.markup?{reply_markup:picked.markup}:{})}),signal:AbortSignal.timeout(14000)});
      response=await result.json();
    }catch{
      // Telegram may have accepted a request whose response was lost. Never resend blindly.
      await db.unsafe("UPDATE astroday_daily_delivery_claims SET status='review',error_code='delivery_outcome_unknown',updated_at=now() WHERE handle_key=$1 AND forecast_day=$2::date",[user.handle_key,day]);stats.review++;continue;
    }
    if(response.ok===true && Number.isSafeInteger(response.result?.message_id)){
      const message=String(response.result.message_id);
      await db.begin(async tx=>{
        await tx.unsafe("UPDATE astroday_daily_delivery_claims SET status='sent',message_id=$3,updated_at=now() WHERE handle_key=$1 AND forecast_day=$2::date",[user.handle_key,day,message]);
        await tx.unsafe("INSERT INTO liz_manual_telegram_tests(test_key,handle_key,forecast_date,status,telegram_message_id,sent_at) VALUES($1,$2,$3::date,'sent',$4,now()) ON CONFLICT(test_key) DO NOTHING",[key,user.handle_key,day,message]);
      });stats.sent++;
    }else{
      const state=response.ok===false?'retry':'review';
      await db.unsafe("UPDATE astroday_daily_delivery_claims SET status=$3,error_code=$4,updated_at=now() WHERE handle_key=$1 AND forecast_day=$2::date",[user.handle_key,day,state,'telegram_'+String(response.error_code||'invalid_response')]);stats.errors++;
    }
  }
  return stats;
}
if(Bun.env.ASTRODAY_UNIT_TEST!=='true'){
  const db=new SQL(Bun.env.DATABASE_URL);
  try{console.log('DAILY7_AUDIT '+JSON.stringify(await runDaily(db,Bun.env.TELEGRAM_BOT_TOKEN)))}
  catch(e){console.error('DAILY7_FATAL '+String(e?.message||'unknown'));process.exitCode=1}
  finally{await db.close()}
}
