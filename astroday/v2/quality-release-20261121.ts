/**
 * ASTRODAY 2026-11-21: one-time reviewed editorial release.
 * 521 future daily + 20 month narratives, no AI API, no Telegram sends.
 * Every original row is copied before updates, all writes in one transaction.
 */
import {SQL} from "bun";
Bun.serve({port:Number(Bun.env.PORT||3000),fetch(){return new Response("private release",{status:403})}});
const SHA="02d79b2e722ece7b7b4c007ccb91d3727a7d9a22";
const SOURCE="https://raw.githubusercontent.com/mynameisnastasya/lizaty666/"+SHA+"/astroday/v2/quality-polish.mjs";
const APPLY=Bun.env.ASTRODAY_QUALITY_APPLY==="YES";
const PENDING_PROMPT="astroday-liza-human-v1-20261121", START="2026-11-21", DAYSTART="2026-11-22", END="2026-12-17", DAYEND="2026-12-18";
const db=new SQL(Bun.env.DATABASE_URL||"",{max:2});
const error=e=>String(e?.message||e?.code||e||"unknown").slice(0,220);
try{
 if(!Bun.env.DATABASE_URL)throw Error("MISSING_DATABASE");
 const response=await fetch(SOURCE,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error("GITHUB_SOURCE_HTTP_"+response.status);
 const source=await response.text();
 if(!source.includes("astroday-liza-quality-v2-20261121")||!source.includes("polishMonthly")||!source.includes("polishDaily"))throw Error("INCORRECT_SOURCE");
 await Bun.write("/tmp/astroday-quality-polish.mjs",source);
 const {polishDaily,polishMonthly,QUALITY_VERSION}=await import("/tmp/astroday-quality-polish.mjs");
 if(QUALITY_VERSION!=="astroday-liza-quality-v2-20261121")throw Error("INCORRECT_QUALITY_VERSION");
 const dailyRows=await db.unsafe("SELECT f.telegram_id,f.forecast_date::text AS day,f.generation_key,f.profile_fp,f.body_html,f.status,f.prompt_version,f.facts,f.topics,f.lunar,f.validation FROM astroday_v2_forecasts f JOIN liz_subscriptions s ON s.telegram_id=f.telegram_id AND s.valid_until>NOW() WHERE f.forecast_date BETWEEN $1::date AND $2::date AND f.status='ready' AND f.prompt_version=$3 ORDER BY f.telegram_id,f.forecast_date",[START,DAYEND,PENDING_PROMPT]);
 const originalMonthly=await db.unsafe("SELECT m.telegram_id,m.period_start::text AS period_start,m.period_end::text AS period_end,m.body_html,m.generator_version FROM astroday_monthly_forecasts m JOIN liz_subscriptions s ON s.telegram_id=m.telegram_id AND s.valid_until>NOW() WHERE m.period_start=$1::date AND m.period_end=$2::date ORDER BY m.telegram_id",[START,END]);
 const groups=new Map(),drafts=[],months=[],problems=[];
 for(const row of dailyRows){
  if(!groups.has(row.telegram_id))groups.set(row.telegram_id,[]);
  groups.get(row.telegram_id).push(row);
  if(row.day<DAYSTART)continue;
  try{const draft=polishDaily(row);drafts.push({...row,reviewed:draft.html,meta:draft.meta})}
  catch(e){problems.push(error(e))}
 }
 for(const [id,group] of groups){
  try{const a=polishMonthly(group,{start:START,end:END});months.push({telegram_id:id,body_html:a.html,meta:a.meta})}
  catch(e){problems.push("MONTH_"+error(e))}
 }
 const expectedDaily=20*27-19;
 const preflight={apply:APPLY,users:groups.size,sourceDaily:dailyRows.length,futureDaily:drafts.length,existingMonth:originalMonthly.length,newMonths:months.length,
 uniqueDaily:new Set(drafts.map(x=>x.reviewed)).size,uniqueMonth:new Set(months.map(x=>x.body_html)).size,meanDailyWords:Math.round(drafts.reduce((a,b)=>a+b.meta.words,0)/Math.max(1,drafts.length)),meanMonthWords:Math.round(months.reduce((a,b)=>a+b.meta.words,0)/Math.max(1,months.length)),issues:[...new Set(problems)].slice(0,5)};
 console.log("ASTRODAY_QUALITY_RELEASE_PREFLIGHT",JSON.stringify(preflight));
 if(preflight.users!==20||preflight.sourceDaily!==541||preflight.futureDaily!==expectedDaily||
 preflight.existingMonth!==20||preflight.newMonths!==20||preflight.uniqueDaily!==521||preflight.uniqueMonth!==20||preflight.issues.length)
  throw Error("COHORT_CHANGED_ABORT");
 if(APPLY){
  const changed=await db.begin(async tx=>{
   await tx.unsafe("SELECT pg_advisory_xact_lock(20261121,7722)");
   await tx.unsafe("CREATE TABLE IF NOT EXISTS astroday_daily_prequality_20261121 AS SELECT * FROM astroday_v2_forecasts WHERE FALSE");
   await tx.unsafe("CREATE UNIQUE INDEX IF NOT EXISTS astroday_daily_prequality_20261121_id ON astroday_daily_prequality_20261121(telegram_id,forecast_date,generation_key)");
   await tx.unsafe("CREATE TABLE IF NOT EXISTS astroday_monthly_prequality_20261121 AS SELECT * FROM astroday_monthly_forecasts WHERE FALSE");
   await tx.unsafe("CREATE UNIQUE INDEX IF NOT EXISTS astroday_monthly_prequality_20261121_id ON astroday_monthly_prequality_20261121(telegram_id,period_start,period_end)");
   await tx.unsafe("CREATE TABLE IF NOT EXISTS astroday_quality_reviews_20261121(telegram_id TEXT NOT NULL,forecast_date DATE NOT NULL,generation_key TEXT NOT NULL,version TEXT NOT NULL,words INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(telegram_id,forecast_date,generation_key))");
   // Back up ALL original 521 daily and 20 monthly before modifying anything.
   const bD=await tx.unsafe("INSERT INTO astroday_daily_prequality_20261121 SELECT f.* FROM astroday_v2_forecasts f JOIN liz_subscriptions sub ON sub.telegram_id=f.telegram_id AND sub.valid_until>NOW() WHERE f.forecast_date BETWEEN $1::date AND $2::date AND f.status='ready' AND f.prompt_version=$3 ON CONFLICT DO NOTHING RETURNING 1",[DAYSTART,DAYEND,PENDING_PROMPT]);
   const bM=await tx.unsafe("INSERT INTO astroday_monthly_prequality_20261121 SELECT m.* FROM astroday_monthly_forecasts m JOIN liz_subscriptions sub ON sub.telegram_id=m.telegram_id AND sub.valid_until>NOW() WHERE m.period_start=$1::date AND m.period_end=$2::date ON CONFLICT DO NOTHING RETURNING 1",[START,END]);
   if(bD.length!==521||bM.length!==20)throw Error("BACKUP_INCOMPLETE_ROLLBACK_"+bD.length+"_"+bM.length);
   let dailyChanged=0,monthChanged=0;
   for(const row of drafts){
    const res=await tx.unsafe("UPDATE astroday_v2_forecasts f SET body_html=$4,updated_at=NOW() WHERE f.telegram_id=$1 AND f.forecast_date=$2::date AND f.generation_key=$3 AND f.status='ready' AND f.prompt_version=$5 AND f.body_html IS DISTINCT FROM $4 AND NOT EXISTS(SELECT 1 FROM astroday_v2_deliveries d WHERE d.telegram_id=f.telegram_id AND d.forecast_date=f.forecast_date AND d.status IN ('sent','sending','review')) RETURNING 1",[row.telegram_id,row.day,row.generation_key,row.reviewed,PENDING_PROMPT]);
    if(res.length!==1)throw Error("DAILY_ROW_NOT_UPDATED_ROLLBACK_"+row.day);
    await tx.unsafe("INSERT INTO astroday_quality_reviews_20261121(telegram_id,forecast_date,generation_key,version,words) VALUES($1,$2::date,$3,$4,$5)",[row.telegram_id,row.day,row.generation_key,QUALITY_VERSION,row.meta.words]);
    dailyChanged++;
   }
   for(const m of months){
    const updated=await tx.unsafe("UPDATE astroday_monthly_forecasts SET body_html=$4,editorial_meta=$5::jsonb,generator_version=$6,updated_at=NOW() WHERE telegram_id=$1 AND period_start=$2::date AND period_end=$3::date AND body_html IS DISTINCT FROM $4 RETURNING 1",[m.telegram_id,START,END,m.body_html,JSON.stringify(m.meta),QUALITY_VERSION]);
    if(updated.length!==1)throw Error("MONTH_NOT_UPDATED_ROLLBACK");
    monthChanged++;
   }
   if(dailyChanged!==521||monthChanged!==20)throw Error("PARTIAL_TX_ROLLBACK");
   return {dailyChanged,monthChanged,backedUpDaily:bD.length,backedUpMonthly:bM.length};
  });
  console.log("ASTRODAY_QUALITY_RELEASE_APPLIED",JSON.stringify({...changed,version:QUALITY_VERSION,notificationsSent:0,editedHistoricalDays:0}));
 }else console.log("ASTRODAY_QUALITY_RELEASE_DRYRUN_OK",JSON.stringify(preflight));
}catch(e){console.log("ASTRODAY_QUALITY_RELEASE_BLOCKED",error(e))}
finally{await db.close()}
