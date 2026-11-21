import test from "node:test";
import assert from "node:assert/strict";
import { authorDaily,authorMonthly,OFFLINE_EDITORIAL_VERSION } from "../../v2/offline-editorial.mjs";
const start=new Date("2026-11-21T12:00:00Z");
const days=Array.from({length:27},(_,i)=>new Date(start.getTime()+i*864e5).toISOString().slice(0,10));
const make=(day,house=5,hasTime=true)=>({
 forecast_date:day,profile_fp:"test-not-a-user",status:"failed",
 facts:{day,houseKnown:hasTime,natalMoonReliable:hasTime,transitingMoon:{natalHouse:house,sign:"Cancer"},
 natalProfile:{natalPositions:{Sun:{longitude:44},Moon:{longitude:68},Mercury:{longitude:7},Venus:{longitude:180},Mars:{longitude:230}}},
 activeAspects:[{transit:"Moon",natal:"Venus",aspect:"trine",orbDeg:0.4,scope:"transit_natal"},
 {transit:"Mars",natal:"Sun",aspect:"square",orbDeg:1.2,scope:"transit_natal"}]},
 topics:{themes:[{domain:"love",score:2.5,facts:[{transit:"Mars",natal:"Sun",aspect:"square",orbDeg:1.2}]}]},
 lunar:{lunarDayAtNoon:9}
});
test("each of 12 natal Moon houses has a concrete recommendation and safe date",()=>{
 for(let house=1;house<=12;house++){
  const forecast=authorDaily(make("2026-11-22",house));
  assert.ok(forecast.html.includes(house+"-му натальному дому"));
  assert.ok(forecast.html.includes("🔥"));
  assert.ok(forecast.html.length>=550&&forecast.html.length<=3900);
  assert.equal(forecast.meta.version,OFFLINE_EDITORIAL_VERSION);
 }
});
test("unknown birth time removes natal houses but keeps reliable personal aspects",()=>{
 const row=make("2026-11-22",5,false);
 const f=authorDaily(row);
 assert.equal(f.meta.moonHouse,null);
 assert.ok(!/\d+-му натальному дому/.test(f.html));
 assert.ok(f.html.includes("к натальной Венере"));
 assert.ok(f.html.includes("9-е лунные сутки"));
});
test("no aspects: no imaginary planetary aspect",()=>{
 const row=make("2026-11-24",7,true);
 row.facts.activeAspects=[];
 row.topics.themes=[];
 const f=authorDaily(row);
 assert.ok(f.html.includes("7-му натальному дому"));
 assert.ok(!f.html.includes("секстиль к натальной"));
});
test("dates and stored facts must match, so another user's day is not used",()=>{
 assert.throws(()=>authorDaily(make("2026-11-22",5,true).facts?.day ? {...make("2026-11-22"),forecast_date:"2026-11-25"}:null),/facts_not_for_date/);
});
test("monthly text includes actual contact dates and factual caveat",()=>{
 const rows=days.map((day,i)=>make(day,1+i%12,true));
 const result=authorMonthly(rows);
 assert.ok(result.html.includes("21 НОЯБРЯ")&&result.html.includes("17 ДЕКАБРЯ"));
 assert.ok(result.html.includes("к натальному Солнцу"));
 assert.ok(result.html.includes("не предсказывает конкретных событий"));
 assert.equal(result.meta.days,27);
 assert.ok(result.html.length>=1600&&result.html.length<=10000);
});
test("monthly without time never invents natal houses",()=>{
 const rows=days.map(d=>make(d,5,false));
 const result=authorMonthly(rows);
 assert.equal(result.meta.moonHouse,null);
 assert.ok(result.html.includes("Без надёжного времени рождения натальные дома"));
 assert.ok(!result.html.includes("твоему 5-му натальному дому"));
});
test("human-authored outputs are deterministic and require no network or model API",()=>{
 const row=make("2026-11-22");
 assert.deepEqual(authorDaily(row),authorDaily(structuredClone(row)));
});
