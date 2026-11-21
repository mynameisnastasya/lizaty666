import {test} from "node:test";
import assert from "node:assert/strict";
import {makeOfflineForecast,normalizedOfflineMode,isOpenAIQuotaFailure,OFFLINE_MODES} from "../../v2/offline-fallback.mjs";
const fixture=({known=true,reliable=true}={})=>{
 const calc={day:"2026-11-25",calculationStatus:"verified_v2",version:"astro-v2-placidus-swe-2.10",
 houseKnown:known,natalMoonReliable:reliable,transitingMoon:{sign:"Cancer",natalHouse:5},
 natalProfile:{natalPositions:{Sun:{longitude:43},Moon:{longitude:125},Mercury:{longitude:87},Venus:{longitude:192},Mars:{longitude:301}}},
 activeAspects:[{scope:"transit_natal",transit:"Mercury",natal:"Venus",aspect:"trine",orbDeg:0.2,orbLimitDeg:6,state:"applying"},
 {scope:"transit_natal",transit:"Moon",natal:"Venus",aspect:"square",orbDeg:0.6,orbLimitDeg:3,state:"applying"}],
 dayEvents:[]};
 const topics={houseKnown:known,themes:[{domain:"love",score:3,facts:[{transit:"Mercury",natal:"Venus",aspect:"trine",orbDeg:0.2}]}]};
 return {row:{day:"2026-11-25",profile_fp:"test-not-real"},calc,lunar:{lunarDayAtNoon:12},topics,engineVersion:"astro-v2-placidus-swe-2.10"};
};
test("explicit offline mode must be enabled and defaults fail closed",()=>{
 assert.deepEqual(OFFLINE_MODES,["off","when-exhausted","only"]);
 assert.equal(normalizedOfflineMode(undefined),"off");
 assert.equal(normalizedOfflineMode("on"),"off");
 assert.equal(normalizedOfflineMode("only"),"only");
 assert.equal(normalizedOfflineMode("when-exhausted"),"when-exhausted");
});
test("credit exhausted/quota errors trigger, unrelated errors never trigger",()=>{
 for(const code of ["credit_balance_exhausted","insufficient_quota","openai_daily_budget_reached","429 Too Many Requests"]){assert.equal(isOpenAIQuotaFailure(new Error(code)),true)}
 for(const code of ["engine_contract_invalid","network_dns_failure","403_access_denied","validation_failed","astrology_not_ready"]){assert.equal(isOpenAIQuotaFailure(new Error(code)),false)}
});
test("offline day authored with verified facts and natal Moon house",()=>{
 const r=makeOfflineForecast(fixture());
 assert.equal(r.validation.mode,"offline_authorial");
 assert.equal(r.validation.factsVerified,true);
 assert.equal(r.validation.moonHouse,5);
 assert.equal(r.model,"human-authored-no-api");
 assert.equal(r.usage.input_tokens,0);
 assert.ok(r.html.includes("5-му натальному дому"));
 assert.ok(r.html.includes("к натальной Венере"));
 assert.ok(r.html.includes("12-е лунные сутки"));
 assert.ok(r.html.length>550);
 assert.ok(!r.html.includes("Telegram ID"));
});
test("no time: house suppressed, reliable natal Venus still used",()=>{
 const r=makeOfflineForecast(fixture({known:false,reliable:false}));
 assert.equal(r.validation.moonHouse,null);
 assert.ok(!r.html.includes("5-му натальному дому"));
 assert.ok(r.html.includes("натальной Венере"));
});
test("never invent forecasts with wrong date, engine or missing lunar days",()=>{
 const x=fixture();
 const y=structuredClone(x);y.calc.day="2026-11-26";
 assert.throws(()=>makeOfflineForecast(y),/offline_unverified_engine_facts/);
 const z=structuredClone(x);z.calc.calculationStatus="pending";
 assert.throws(()=>makeOfflineForecast(z),/offline_unverified_engine_facts/);
 const a=structuredClone(x);a.engineVersion="wrong-version";
 assert.throws(()=>makeOfflineForecast(a),/offline_unverified_engine_facts/);
 const b=structuredClone(x);delete b.lunar.lunarDayAtNoon;
 assert.throws(()=>makeOfflineForecast(b),/offline_lunar_day_missing/);
 const c=structuredClone(x);c.topics.houseKnown=false;
 assert.throws(()=>makeOfflineForecast(c),/offline_topics_invalid/);
});
test("same input has deterministic output and makes no paid model calls",()=>{
 const x=fixture();
 assert.deepEqual(makeOfflineForecast(x),makeOfflineForecast(structuredClone(x)));
});
