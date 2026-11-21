// ASTRODAY 2026-11-21: single-use announcement of monthly reader for consenting subscribers.
// No forecasting, no AI calls, no mass-replay. One Telegram sendMessage per eligible chat.
// Set ASTRODAY_ANNOUNCE_MONTH=YES after dry-run verification; never automatically retry claims.
import {SQL} from "bun";
const db=new SQL(Bun.env.DATABASE_URL||"",{max:2});
const token=Bun.env.TELEGRAM_BOT_TOKEN||"";
const ACTIVE=Bun.env.ASTRODAY_ANNOUNCE_MONTH==="YES";
const BASE="https://astroday-personal-monthly-reader-20261121-staging.up.railway.app";
const MAIN="https://lizty666-stage.up.railway.app/app";
const tag="2026-11-personal-monthly-ready";
Bun.serve({port:Number(Bun.env.PORT||3000),fetch(){return new Response("Private ASTRODAY rollout",{status:403})}});
const TARGET="lizty666bot";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const bot=async(method,body={})=>{
 const result=await fetch("https://api.telegram.org/bot"+token+"/"+method,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(14000)});
 const output=await result.json();
 return {ok:output.ok,result:output.result,error_code:output.error_code,description:String(output.description||"").slice(0,50)};
};
const keyboard={inline_keyboard:[
 [{text:"🌙 Мой прогноз на месяц",web_app:{url:BASE+"/"}}],
 [{text:"☀️ Мой прогноз на день",web_app:{url:BASE+"/?tab=day"}}],
 [{text:"🖤 Основной кабинет",web_app:{url:MAIN}}]
]};
const message="🌙 <b>ASTRODAY · твои личные прогнозы готовы</b>\n\nМои хорошие, прогнозы на период <b>21 ноября — 17 декабря 2026</b> уже в приложении.\n\nВнутри есть большой разбор месяца, рекомендации на каждый день и подсказки по Луне. Без страшилок про «всё пропало» и без обещаний, что звёзды всё сделают за тебя. 🤍\n\n<b>Открывай:</b> месяц целиком, любой день или привычный кабинет. Всё по кнопкам ниже.";
try{
 if(!token||!Bun.env.DATABASE_URL)throw Error("missing_credentials");
 const me=await bot("getMe");
 if(!me.ok||String(me.result?.username||"").toLowerCase()!==TARGET)throw Error("wrong_bot_identity");
 const eligible=await db.unsafe("SELECT DISTINCT m.telegram_id FROM astroday_monthly_forecasts m JOIN liz_subscriptions s ON s.telegram_id=m.telegram_id AND s.valid_until>NOW() JOIN liz_birth_profiles p ON p.telegram_id=m.telegram_id LEFT JOIN liz_tg_consents c ON c.telegram_id=m.telegram_id LEFT JOIN liz_clients lc ON lc.telegram_id=m.telegram_id WHERE m.period_start='2026-11-21'::date AND m.period_end='2026-12-17'::date AND COALESCE(c.daily_delivery,p.consented_to_daily,FALSE) AND COALESCE(lc.notify_enabled,TRUE) AND lc.bot_blocked_at IS NULL ORDER BY m.telegram_id");
 const report={tag,eligible:eligible.length,action:ACTIVE?"apply":"dry-run",sent:0,alreadyClaimed:0,failed:0,blocked:0,createdTable:false,reasons:{}};
 if(eligible.length!==20)throw Error("changed_cohort_"+eligible.length);
 const health=await fetch(BASE+"/health",{signal:AbortSignal.timeout(12000)}).then(r=>r.json());
 if(health?.ok!==true||health.version!=="astroday-monthly-reader-v1")throw Error("reader_unhealthy");
 if(ACTIVE){
  await db.unsafe("CREATE TABLE IF NOT EXISTS astroday_monthly_announcement_20261121(telegram_id TEXT PRIMARY KEY,tag TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('claimed','sent','failed')),telegram_message_id TEXT,error_code TEXT,claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  report.createdTable=true;
  for(const item of eligible){
   // Atomic unique claim. Never retry an uncertain message, avoiding duplicates after restart.
   const claim=await db.unsafe("INSERT INTO astroday_monthly_announcement_20261121(telegram_id,tag,status) VALUES($1,$2,'claimed') ON CONFLICT(telegram_id) DO NOTHING RETURNING telegram_id",[item.telegram_id,tag]);
   if(!claim.length){report.alreadyClaimed++;continue}
   try{
    const sent=await bot("sendMessage",{chat_id:item.telegram_id,text:message,parse_mode:"HTML",disable_notification:true,reply_markup:keyboard,link_preview_options:{is_disabled:true}});
    if(sent.ok){
     await db.unsafe("UPDATE astroday_monthly_announcement_20261121 SET status='sent',telegram_message_id=$2,updated_at=NOW() WHERE telegram_id=$1",[item.telegram_id,String(sent.result.message_id)]);
     report.sent++;
    }else{
     const reason=sent.error_code===403?"blocked":sent.error_code===429?"rate_limit":"telegram_"+(sent.error_code||"unknown");
     if(reason==="blocked")report.blocked++;
     report.reasons[reason]=(report.reasons[reason]||0)+1;
     await db.unsafe("UPDATE astroday_monthly_announcement_20261121 SET status='failed',error_code=$2,updated_at=NOW() WHERE telegram_id=$1",[item.telegram_id,reason]);
     report.failed++;
    }
   }catch(e){
    report.failed++;report.reasons.network_error=(report.reasons.network_error||0)+1;
    await db.unsafe("UPDATE astroday_monthly_announcement_20261121 SET status='failed',error_code='network_error',updated_at=NOW() WHERE telegram_id=$1",[item.telegram_id]);
   }
   await sleep(180);
  }
 }
 console.log("ASTRODAY_MONTHLY_ROLLOUT",JSON.stringify(report));
}catch(e){console.log("ASTRODAY_MONTHLY_ROLLOUT_BLOCKED",String(e?.message||e).slice(0,125))}
finally{await db.close()}
