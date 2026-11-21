// ASTRODAY private monthly reading Mini App. No AI API and no webhook changes.
import {SQL} from "bun";
import {createHmac,timingSafeEqual} from "node:crypto";
const db=new SQL(Bun.env.DATABASE_URL||"",{max:4});
const BOT=Bun.env.TELEGRAM_BOT_TOKEN||"";
const VERSION="astroday-monthly-reader-v3";
const limit=10000;
const PAGE=await Bun.file("/tmp/astroday-reader-v2.html").text();
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private,no-store","X-Content-Type-Options":"nosniff","X-Frame-Options":"SAMEORIGIN"}})}
function verify(initData){
 if(!BOT||typeof initData!=="string"||!initData||initData.length>6000)return null;
 try{
  const q=new URLSearchParams(initData),h=q.get("hash")||"";
  if(!/^[a-fA-F0-9]{64}$/.test(h))return null;
  const date=Number(q.get("auth_date")||0);
  const seconds=Math.floor(Date.now()/1000);
  if(!Number.isInteger(date)||Math.abs(seconds-date)>86400||date>seconds+60)return null;
  const check=[...q.entries()].filter(e=>e[0]!=="hash").map(e=>e[0]+"="+e[1]).sort().join("\n");
  const secret=createHmac("sha256","WebAppData").update(BOT).digest();
  const want=createHmac("sha256",secret).update(check).digest();
  const have=Buffer.from(h,"hex");
  if(have.length!==want.length||!timingSafeEqual(have,want))return null;
  const user=JSON.parse(q.get("user")||"{}");
  if(!Number.isSafeInteger(user.id)||user.id<=0)return null;
  return String(user.id);
 }catch{return null}
}
function safe(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&lt;(\/?(?:b|i|strong|em))&gt;/gi,"<$1>")}
const dayOK=d=>{
 if(typeof d!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(d)||d<"2026-11-21"||d>"2036-12-31")return false;
 const date=new Date(d+"T12:00:00Z");
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===d;
};
console.log("ASTRODAY_MONTHLY_READER_READY",JSON.stringify({version:VERSION,db:!!Bun.env.DATABASE_URL,botConfigured:!!BOT}));
Bun.serve({port:Number(Bun.env.PORT||3000),async fetch(req){
 const path=new URL(req.url).pathname;
 if(path==="/health")return json({ok:!!Bun.env.DATABASE_URL&&!!BOT,version:VERSION},Bun.env.DATABASE_URL&&BOT?200:503);
 if(path==="/"&&req.method==="GET")return new Response(PAGE,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public,max-age=300","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline' https://telegram.org; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"}});
 if(path==="/api/sky-events"&&req.method==="GET"){
  try{
   const response=await fetch("https://astroday-liza-month-events-2026-11-staging.up.railway.app/api/events/2026-11",{signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error("sky_source_unavailable");
   const data=await response.json();
   if(!Array.isArray(data.events)||data.events.length>12)throw Error("sky_data_invalid");
   const clean=data.events.slice(0,12).filter(e=>e&&/^\d{4}-\d\d-\d\dT/.test(String(e.atUTC||""))).map(e=>{
    const fields=["id","atUTC","title","subtitle","essence","meaning","workAndMoney","relationships","caveat"];
    const out={};for(const f of fields)out[f]=String(e[f]??"").slice(0,2500);
    out.usefulActions=Array.isArray(e.usefulActions)?e.usefulActions.slice(0,6).map(x=>String(x).slice(0,350)):[];
    return out;
   });
   return new Response(JSON.stringify({events:clean,month:"2026-11"}),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=600","X-Content-Type-Options":"nosniff"}});
  }catch{return json({error:"sky_events_temporarily_unavailable"},503)}
 }
 if(path!=="/api/personal"||req.method!=="POST")return json({error:"not_found"},404);
 try{
  const raw=await req.text();
  if(raw.length>limit)return json({error:"bad_request"},400);
  const body=JSON.parse(raw||"{}");
  const id=verify(body.initData);
  if(!id)return json({error:"Вход через Telegram не подтверждён. Открой мини-приложение из бота."},401);
  const sub=await db.unsafe("SELECT valid_until FROM liz_subscriptions WHERE telegram_id=$1 AND valid_until>NOW() LIMIT 1",[id]);
  if(!sub.length)return json({error:"Для персонального прогноза нужен действующий доступ."},403);
  if(body.section==="month"){
   const m=await db.unsafe("SELECT body_html,period_start::text AS period_start,period_end::text AS period_end FROM astroday_monthly_forecasts WHERE telegram_id=$1 AND period_end>=CURRENT_DATE ORDER BY period_start ASC LIMIT 1",[id]);
   if(!m.length)return json({error:"Месячный прогноз ещё не подготовлен."},404);
   return json({bodyHtml:safe(m[0].body_html),periodStart:m[0].period_start,periodEnd:m[0].period_end,version:VERSION});
  }
  if(body.section==="day"){
   const day=dayOK(body.day)?body.day:new Date().toISOString().slice(0,10);
   const d=await db.unsafe("SELECT body_html FROM astroday_v2_forecasts WHERE telegram_id=$1 AND forecast_date=$2::date AND status='ready' AND body_html IS NOT NULL LIMIT 1",[id,day]);
   if(!d.length)return json({error:"Прогноз на выбранную дату ещё недоступен."},404);
   return json({bodyHtml:safe(d[0].body_html),day});
  }
  if(body.section==="profile"){
   const dt=new Date(sub[0].valid_until);
   const formatted=Number.isFinite(dt.getTime())?new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(dt):"";
   return json({accessNote:"Доступ активен до "+formatted+" (UTC)."});
  }
  return json({error:"unknown_section"},400);
 }catch(e){console.error("ASTRODAY_MONTHLY_QUERY_FAILED",String(e?.code||e?.name||"error").slice(0,40));return json({error:"Временная ошибка загрузки."},503)}
}});
