/**
 * ASTRODAY 2026-11-21: one-off Russian proofreading in the existing live database.
 * Replaces case errors and one past tense; does not touch personal calculations,
 * subscription access, webhook, Telegram messages or status fields.
 */
import {SQL} from "bun";
Bun.serve({port:Number(Bun.env.PORT||3000),fetch(){return new Response("ASTRODAY private proofread",{status:403})}});
const db=new SQL(Bun.env.DATABASE_URL||"",{max:1});
const apply=Bun.env.ASTRODAY_PROOFREAD_APPLY==="YES";
const edits=[
 ["к натальному Венере","к натальной Венере"],
 ["к натальному Луне","к натальной Луне"],
 ["к натальной планете Венера","к натальной Венере"],
 ["к натальной планете Луна","к натальной Луне"],
 ["к натальной планете Меркурий","к натальному Меркурию"],
 ["к натальной планете Марс","к натальному Марсу"],
 ["к натальной планете Солнце","к натальному Солнцу"],
 ["В течение периода Луна неоднократно проходила по разным натальным домам.","В течение периода Луна будет проходить по разным натальным домам."]
];
const lit=s=>"'"+s.replaceAll("'","''")+"'";
let expr="body_html";
for(const [from,to] of edits)expr="replace("+expr+","+lit(from)+","+lit(to)+")";
const where="("+edits.map(([from])=>"strpos(body_html,"+lit(from)+")>0").join(" OR ")+")";
const dailyCondition="forecast_date BETWEEN '2026-11-22'::date AND '2026-12-18'::date AND status='ready' AND prompt_version='astroday-liza-human-v1-20261121'";
const monthlyCondition="period_start='2026-11-21'::date AND period_end='2026-12-17'::date";
const count=async(sql)=>Number((await db.unsafe(sql))[0]?.n||0);
try{
 if(!Bun.env.DATABASE_URL)throw Error("DATABASE_MISSING");
 const before={
  futureDaily:await count("SELECT count(*)::int n FROM astroday_v2_forecasts WHERE "+dailyCondition),
  monthly:await count("SELECT count(*)::int n FROM astroday_monthly_forecasts WHERE "+monthlyCondition),
  dailyAffected:await count("SELECT count(*)::int n FROM astroday_v2_forecasts WHERE "+dailyCondition+" AND "+where),
  monthlyAffected:await count("SELECT count(*)::int n FROM astroday_monthly_forecasts WHERE "+monthlyCondition+" AND "+where)
 };
 const report={before,applied:false,dailyUpdated:0,monthlyUpdated:0,after:null,backupDaily:null,backupMonthly:null};
 if(apply){
  if(before.futureDaily!==521||before.monthly!==20||before.dailyAffected<1||before.monthlyAffected<1)
   throw Error("PROOFREAD_COHORT_MISMATCH");
  const result=await db.begin(async tx=>{
   await tx.unsafe("SELECT pg_advisory_xact_lock(20261121, 7720)");
   await tx.unsafe("CREATE TABLE IF NOT EXISTS astroday_manual_daily_preproof_20261121 AS SELECT * FROM astroday_v2_forecasts WHERE FALSE");
   await tx.unsafe("CREATE UNIQUE INDEX IF NOT EXISTS astroday_manual_daily_preproof_20261121_idx ON astroday_manual_daily_preproof_20261121(telegram_id,forecast_date,generation_key)");
   await tx.unsafe("CREATE TABLE IF NOT EXISTS astroday_manual_monthly_preproof_20261121 AS SELECT * FROM astroday_monthly_forecasts WHERE FALSE");
   await tx.unsafe("CREATE UNIQUE INDEX IF NOT EXISTS astroday_manual_monthly_preproof_20261121_idx ON astroday_manual_monthly_preproof_20261121(telegram_id,period_start,period_end)");
   await tx.unsafe("INSERT INTO astroday_manual_daily_preproof_20261121 SELECT * FROM astroday_v2_forecasts WHERE "+dailyCondition+" AND "+where+" ON CONFLICT DO NOTHING");
   await tx.unsafe("INSERT INTO astroday_manual_monthly_preproof_20261121 SELECT * FROM astroday_monthly_forecasts WHERE "+monthlyCondition+" AND "+where+" ON CONFLICT DO NOTHING");
   const daily=await tx.unsafe("UPDATE astroday_v2_forecasts f SET body_html="+expr+",updated_at=NOW() WHERE "+dailyCondition+" AND "+where+" AND NOT EXISTS(SELECT 1 FROM astroday_v2_deliveries d WHERE d.telegram_id=f.telegram_id AND d.forecast_date=f.forecast_date AND d.status IN ('sent','sending','review')) RETURNING 1");
   const monthly=await tx.unsafe("UPDATE astroday_monthly_forecasts SET body_html="+expr+",updated_at=NOW() WHERE "+monthlyCondition+" AND "+where+" RETURNING 1");
   if(daily.length!==before.dailyAffected||monthly.length!==before.monthlyAffected)throw Error("PROOFREAD_PARTIAL_UPDATE_ROLLBACK");
   const invalidDaily=await tx.unsafe("SELECT count(*)::int n FROM astroday_v2_forecasts WHERE "+dailyCondition+" AND "+where);
   const invalidMonth=await tx.unsafe("SELECT count(*)::int n FROM astroday_monthly_forecasts WHERE "+monthlyCondition+" AND "+where);
   if(Number(invalidDaily[0].n)||Number(invalidMonth[0].n))throw Error("PROOFREAD_NOT_CLEAN_ROLLBACK");
   return {dailyUpdated:daily.length,monthlyUpdated:monthly.length};
  });
  report.applied=true;report.dailyUpdated=result.dailyUpdated;report.monthlyUpdated=result.monthlyUpdated;
 }
 report.after={
  futureDaily:await count("SELECT count(*)::int n FROM astroday_v2_forecasts WHERE "+dailyCondition),
  monthly:await count("SELECT count(*)::int n FROM astroday_monthly_forecasts WHERE "+monthlyCondition),
  dailyRemaining:await count("SELECT count(*)::int n FROM astroday_v2_forecasts WHERE "+dailyCondition+" AND "+where),
  monthlyRemaining:await count("SELECT count(*)::int n FROM astroday_monthly_forecasts WHERE "+monthlyCondition+" AND "+where)
 };
 if(apply){
  report.backupDaily=await count("SELECT count(*)::int n FROM astroday_manual_daily_preproof_20261121");
  report.backupMonthly=await count("SELECT count(*)::int n FROM astroday_manual_monthly_preproof_20261121");
 }
 console.log("ASTRODAY_PROOFREAD_REPORT",JSON.stringify(report));
}catch(e){console.log("ASTRODAY_PROOFREAD_BLOCKED",String(e?.message||e).slice(0,170))}
finally{await db.close()}
