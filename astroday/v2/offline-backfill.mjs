/**
 * ASTRODAY: one-off, transaction-safe editorial backfill with no paid AI API.
 * Daily originals backed up in the same private PostgreSQL database.
 * No unsolicited Telegram messages. Apply only after dry-run passes.
 */
import {authorDaily,authorMonthly,OFFLINE_EDITORIAL_VERSION} from "./offline-editorial.mjs";
const START="2026-11-21",DAILY_START="2026-11-22",DAILY_END="2026-12-18",MONTH_END="2026-12-17";
export async function backfill(db,{apply=false}={}){
 const rows=await db.unsafe("SELECT f.telegram_id,f.forecast_date::text AS forecast_date,f.generation_key,f.profile_fp,f.status,f.prompt_version,f.facts,f.topics,f.lunar FROM astroday_v2_forecasts f JOIN liz_subscriptions sub ON sub.telegram_id=f.telegram_id AND sub.valid_until>NOW() WHERE f.forecast_date BETWEEN $1::date AND $2::date AND f.status IN ('ready','failed') ORDER BY f.telegram_id,f.forecast_date",[START,DAILY_END]);
 const users=new Map(),drafts=[],monthly=[],errors=[];
 for(const row of rows){
  if(!users.has(row.telegram_id))users.set(row.telegram_id,[]);
  users.get(row.telegram_id).push(row);
  if(row.forecast_date<DAILY_START)continue;
  try{const text=authorDaily(row);drafts.push({...row,html:text.html,meta:text.meta})}
  catch(e){errors.push(String(e?.message||e).slice(0,130))}
 }
 for(const [id,days] of users){
  try{const text=authorMonthly(days,{start:START,end:MONTH_END});monthly.push({id,html:text.html,meta:text.meta})}
  catch(e){errors.push("MONTH:"+String(e?.message||e).slice(0,130))}
 }
 const stats={people:users.size,rows:rows.length,daily:drafts.length,failed:drafts.filter(x=>x.status==="failed").length,
  ready:drafts.filter(x=>x.status==="ready").length,monthly:monthly.length,unique:new Set(drafts.map(x=>x.html)).size,
  minMonthlyDays:Math.min(...monthly.map(x=>x.meta.days)),errors:[...new Set(errors)].slice(0,10),applied:false};
 if(!apply)return stats;
 if(stats.people!==20||stats.rows!==541||stats.daily!==521||stats.monthly!==20||stats.unique!==521||stats.minMonthlyDays!==27||stats.errors.length)
  throw Error("COHORT_CHANGED_ABORT:"+JSON.stringify(stats).slice(0,350));
 const written=await db.begin(async tx=>{
  await tx.unsafe("SELECT pg_advisory_xact_lock(20261121, 7719)");
  await tx.unsafe("CREATE TABLE IF NOT EXISTS astroday_manual_daily_backup_20261121 AS SELECT * FROM astroday_v2_forecasts WHERE FALSE");
  await tx.unsafe("CREATE UNIQUE INDEX IF NOT EXISTS astroday_manual_daily_backup_20261121_idx ON astroday_manual_daily_backup_20261121(telegram_id,forecast_date,generation_key)");
  await tx.unsafe("INSERT INTO astroday_manual_daily_backup_20261121 SELECT * FROM astroday_v2_forecasts WHERE forecast_date BETWEEN $1::date AND $2::date AND status IN ('ready','failed') ON CONFLICT DO NOTHING",[DAILY_START,DAILY_END]);
  await tx.unsafe("CREATE TABLE IF NOT EXISTS astroday_monthly_forecasts(telegram_id TEXT NOT NULL,period_start DATE NOT NULL,period_end DATE NOT NULL,body_html TEXT NOT NULL,facts_count INTEGER NOT NULL,editorial_meta JSONB NOT NULL,generator_version TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(telegram_id,period_start,period_end))");
  let changed=0,already=0,blocked=0;
  for(const r of drafts){
   const found=await tx.unsafe("SELECT status,prompt_version FROM astroday_v2_forecasts WHERE telegram_id=$1 AND forecast_date=$2::date AND generation_key=$3 FOR UPDATE",[r.telegram_id,r.forecast_date,r.generation_key]);
   if(!found.length||!["ready","failed"].includes(found[0].status)){blocked++;continue}
   if(found[0].prompt_version===OFFLINE_EDITORIAL_VERSION&&found[0].status==="ready"){already++;continue}
   const model={headline:"Авторский прогноз",opening:"Персональные рекомендации по сохранённым данным.",sections:[],lunar_note:"",voc_note:"",advice:"Выбирай действия по реальным обстоятельствам.",source:"human_authored_rules",version:OFFLINE_EDITORIAL_VERSION};
   const validation={ok:true,offline:true,kind:"authorial_forecast",factSource:"stored_ephemeris",...r.meta};
   const saved=await tx.unsafe("UPDATE astroday_v2_forecasts SET status='ready',body_html=$4,model_output=$5::jsonb,validation=$6::jsonb,model='human-authored-no-api',prompt_version=$7,error=NULL,lease_until=NULL,notify_on_ready=NULL,updated_at=NOW() WHERE telegram_id=$1 AND forecast_date=$2::date AND generation_key=$3 AND status IN ('ready','failed') AND NOT EXISTS (SELECT 1 FROM astroday_v2_deliveries d WHERE d.telegram_id=$1 AND d.forecast_date=$2::date AND d.status IN ('sent','sending','review')) RETURNING 1",[r.telegram_id,r.forecast_date,r.generation_key,r.html,JSON.stringify(model),JSON.stringify(validation),OFFLINE_EDITORIAL_VERSION]);
   if(saved.length)changed++;else blocked++;
  }
  if(blocked)throw Error("DELIVERED_OR_CHANGED_ROLLBACK_"+blocked);
  let monthSaved=0;
  for(const r of monthly){
   const out=await tx.unsafe("INSERT INTO astroday_monthly_forecasts(telegram_id,period_start,period_end,body_html,facts_count,editorial_meta,generator_version) VALUES($1,$2::date,$3::date,$4,$5,$6::jsonb,$7) ON CONFLICT(telegram_id,period_start,period_end) DO UPDATE SET body_html=EXCLUDED.body_html,facts_count=EXCLUDED.facts_count,editorial_meta=EXCLUDED.editorial_meta,generator_version=EXCLUDED.generator_version,updated_at=NOW() RETURNING 1",[r.id,START,MONTH_END,r.html,r.meta.days,JSON.stringify(r.meta),OFFLINE_EDITORIAL_VERSION]);
   monthSaved+=out.length;
  }
  if(monthSaved!==20)throw Error("MONTH_NOT_COMPLETE_ROLLBACK");
  return {changed,already,monthSaved};
 });
 return {...stats,...written,applied:true,sentMessages:0,backupTable:"astroday_manual_daily_backup_20261121",monthTable:"astroday_monthly_forecasts"};
}
