import {test} from "node:test";
import assert from "node:assert/strict";
import {polishDaily,polishMonthly,QUALITY_VERSION} from "../../v2/quality-polish.mjs";
const DAY="2026-11-21";
const next=(n)=>{const d=new Date(DAY+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const make=(day=DAY,{house=5,known=true,reliable=false,profile="test-pseudo-profile"}={})=>{
 const aspect={scope:"transit_natal",transit:"Mercury",natal:"Venus",aspect:"trine",orbDeg:.2,state:"applying"};
 const exact=(natal,aspect,hour)=>({transit:"Moon",natal,aspect,at:{local:day+"T"+hour+":08+07:00"}});
 const houseText=known?"В дневном расчёте транзитная Луна идёт по твоему "+house+"-му натальному дому. Это про любовь, занятия, удовольствие и творчество.":"Луна в течение дня в знаке Весов.";
 const body=[
  "<b>ASTRO DAY • ДЕНЬ</b>",
  "🌙 <b>СДЕЛАЙ ЧТО-ТО ДЛЯ СЕБЯ</b>\nСегодня иногда полезно отказаться от чужих сценариев, чтобы услышать свои желания. Не нужно оправдываться за обычные человеческие потребности. Твоё расписание не обязано быть идеальным.",
  "В середине дня по твоему времени Луна в Весах. Можно использовать это как повод подумать, в каком разговоре тебе не хватает определённости.",
  "В 04:07 по местному времени точный аспект Луны — трин с Плутоном в твоей натальной карте.",
  "<b>ЧТО ВАЖНО</b>\nМеркурий образует трин к натальной Венере. В астрологической символике это связывают с темой отношения, удовольствие и личные ценности. Более спокойный фон удобно использовать для того, что давно хотелось завершить.",
  "<b>ТВОЙ ШАГ</b>\nПопробуй назвать свою потребность прямо. Иногда такая простая вещь помогает освободить время и не накручивать себя по пустякам. ⛔ Не торопи другого человека.",
  "🌙 <b>ЛУНА В ТВОЁМ ДНЕ</b>\n"+houseText+" В этой теме лучше идти от конкретного шага: назначить встречу, выбрать занятие, выспаться или задать один ясный вопрос.",
  "🌗 <b>ЛУННЫЙ РИТМ</b>\n7-е лунные сутки. Это традиционный символический ориентир. Можно выделить время на одну важную задачу и на небольшой отдых без чувства вины.",
  "💫 <b>Как прожить этот день</b>\nНе нужно ждать идеального знака. Выбери одно действие, которое действительно зависит от тебя. Это уже неплохой план.\n\nПроверь, кому хочешь написать, и не пытайся угадывать чужие мысли."
 ].join("\n\n");
 return {day,profile_fp:profile,body_html:body,facts:{day,houseKnown:known,natalMoonReliable:reliable,
   transitingMoon:{natalHouse:house,sign:"Libra"},
   dayExactContacts:{personalExact:[exact("Venus","square","12:11"),exact("Pluto","trine","04:07"),exact("Moon","sextile","07:05")]},
   activeAspects:[aspect]},validation:JSON.stringify({primaryDomain:"love",aspectsUsed:[["Mercury","trine","Venus"]]})};
};
test("day review retains house, removes generic footer, and uses verified Moon personal contacts",()=>{
 const row=make();
 const out=polishDaily(row);
 assert.ok(out.html.includes("5-му натальному дому"));
 assert.ok(out.html.includes("12:11 по местному времени"));
 assert.ok(out.html.includes("Луна в квадрате с натальной Венерой"));
 assert.ok(!out.html.includes("Луна в трине с натальным Плутоном"));
 assert.ok(!out.html.includes("Луна в секстиле с натальной Луной"));
 assert.ok(!out.html.includes("Не нужно ждать идеального знака."));
 assert.ok(out.html.includes("Меркурий в трине с натальной Венерой"));
 assert.equal(out.meta.version,QUALITY_VERSION);
});
test("without birth time, natal houses and unreliable natal Moon must not appear",()=>{
 const row=make(DAY,{known:false,house:5,reliable:false});
 const out=polishDaily(row);
 assert.ok(!out.html.includes("5-му натальному дому"));
 assert.ok(!out.html.includes("с натальной Луной"));
 assert.ok(out.html.includes("с натальной Венерой"));
});
test("reject source date mismatch and absent source section",()=>{
 const row=make(DAY);row.facts.day="2026-11-23";
 assert.throws(()=>polishDaily(row),/daily_source_unexpected/);
 const row2=make(DAY);row2.body_html="empty";
 assert.throws(()=>polishDaily(row2),/daily_source_unexpected/);
});
test("month requires all 27 evidence dates and references only stored aspects",()=>{
 const rows=Array.from({length:27},(_,i)=>make(next(i),{house:i%12+1,profile:"test"}));
 const out=polishMonthly(rows);
 assert.equal(out.meta.days,27);
 assert.ok(out.html.includes("ДАТЫ, НА КОТОРЫЕ МОЖНО ОБРАТИТЬ ВНИМАНИЕ"));
 assert.ok(out.html.includes("ЛУНА И ТВОИ ПЕРСОНАЛЬНЫЕ ПОДСКАЗКИ"));
 assert.ok(out.meta.aspects.every(a=>a.transit==="Mercury"&&a.natal==="Venus"));
 assert.ok(out.meta.words>=285);
 assert.ok(!out.html.includes("Твои планы заслуживают понятных условий."));
});
test("month without time does not invent lunar houses",()=>{
 const rows=Array.from({length:27},(_,i)=>make(next(i),{known:false}));
 const out=polishMonthly(rows);
 assert.ok(!/Луна в твоём \d+-м натальном доме/.test(out.html));
});
test("incomplete month is rejected rather than fabricated",()=>{
 const rows=Array.from({length:26},(_,i)=>make(next(i)));
 assert.throws(()=>polishMonthly(rows),/month_not_27_days/);
});
