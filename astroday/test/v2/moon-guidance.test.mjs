import { test, expect } from "bun:test";
import { selectMoonGuidance, renderMoonGuidance, MOON_GUIDANCE_VERSION } from "../../v2/moon-guidance.mjs";
import { selectTopics } from "../../v2/topics.mjs";
import { renderForecast, buildUserPrompt } from "../../v2/editorial.mjs";

const original={
  houseKnown:true, natalMoonReliable:true,
  transitingMoon:{sign:"Cancer",natalHouse:5},
  natalProfile:{natalPositions:{
    Sun:{longitude:15},Moon:{longitude:50},Mercury:{longitude:130},Venus:{longitude:190},Mars:{longitude:212},
    Jupiter:{longitude:111},
  },houseCusps:[0,30,60,90,120,150,180,210,240,270,300,330]},
  activeAspects:[],dayEvents:[],
};
const aspect=(natal,kind,orb=1)=>({scope:"transit_natal",transit:"Moon",natal,aspect:kind,orbDeg:orb,orbLimitDeg:6,state:"applying"});
test("известно время: Луна в пятом доме, аспектов нет — только темы пятого дома",()=>{
 const moon=selectMoonGuidance(original);
 expect(moon.version).toBe(MOON_GUIDANCE_VERSION);
 expect(moon.house).toBe(5);
 expect(moon.aspects).toHaveLength(0);
 const t=renderMoonGuidance(moon);
 expect(t).toContain("5-му натальному дому");
 expect(t).toContain("свидание");
 expect(t).toContain("детям");
 expect(t).toContain("творчеством");
 expect(t).not.toContain("соединение");
});
test("пятый дом + точные аспекты к личным планетам, не к Юпитеру",()=>{
 const moon=selectMoonGuidance({...original,activeAspects:[
  aspect("Venus","trine",0.4),aspect("Mars","square",1.1),aspect("Jupiter","conjunction",0.01),
  aspect("Mercury","opposition",4.5),aspect("Moon","sextile",2.9),
 ]});
 expect(moon.house).toBe(5);
 expect(moon.aspects).toHaveLength(2);
 expect(moon.aspects[0].planet).toBe("Venus");
 expect(moon.aspects[1].planet).toBe("Mars");
 const t=renderMoonGuidance(moon);
 expect(t).toContain("твоему натальному Венере");
 expect(t).toContain("твоему натальному Марсу");
 expect(t).not.toContain("Юпитеру");
 expect(t).not.toContain("твоему натальному Луне");
});
test("без времени рождения: натальные дома и ненадёжную натальную Луну не выдаём",()=>{
 const calc={...original,houseKnown:false,natalMoonReliable:false,
  transitingMoon:{sign:"Cancer",natalHouse:5},
  activeAspects:[aspect("Moon","conjunction",0.1),aspect("Sun","square",0.5)]};
 const moon=selectMoonGuidance(calc);
 expect(moon.house).toBe(null);
 expect(moon.aspects.map(a=>a.planet)).toEqual(["Sun"]);
 const text=renderMoonGuidance(moon);
 expect(text).not.toMatch(/дом[ауе]|свидани|детям/);
 expect(text).toContain("Солнцу");
 const sel=selectTopics(calc);
 expect(sel.moonGuidance.house).toBe(null);
 const prompt=buildUserPrompt({day:"2026-11-21",name:null,gender:null,selection:sel,lunar:{lunarDayAtNoon:9},voc:[]});
 expect(prompt).toContain("дома не учитываются");
});
test("без времени и без точных личных аспектов — остаётся лунный день из лунного модуля",()=>{
 const sel=selectTopics({...original,houseKnown:false,natalMoonReliable:false,activeAspects:[]});
 expect(sel.moonGuidance.hasPersonalGuidance).toBe(false);
 expect(renderMoonGuidance(sel.moonGuidance)).toBe("");
 const ctx={day:"2026-11-21",zone:"Asia/Ho_Chi_Minh",cityName:"Дананг",selection:sel,lunar:{lunarDayAtNoon:8},voc:[]};
 const out={headline:"Не берём чужую спешку",opening:"Сегодня можно сделать паузу.",sections:[{title:"",fact_ids:["m:moon"],text:"Сегодня больше пользы принесёт спокойная сверка планов. Разобраться с одной задачей обычно лучше, чем обещать себе успеть десять дел сразу."}],lunar_note:"Эти лунные сутки в традиции связывают с пересмотром привычек.",voc_note:"",advice:"Выбери одну понятную задачу."};
 const html=renderForecast(out,ctx);
 expect(html).toContain("8-Е ЛУННЫЕ СУТКИ");
 expect(html).not.toContain("ЛУНА И ТВОЯ НАТАЛЬНАЯ КАРТА");
 expect(html).not.toContain("5-му натальному дому");
});
test("известное время и есть только аспект: программа выводит дом и аспект",()=>{
 const sel=selectTopics({...original,activeAspects:[aspect("Mercury","sextile",0.2)]});
 expect(sel.moonGuidance.house).toBe(5);
 const ctx={day:"2026-11-21",zone:"Asia/Ho_Chi_Minh",cityName:"Дананг",selection:sel,lunar:{lunarDayAtNoon:8},voc:[]};
 const out={headline:"Поговорить можно спокойно",opening:"Начни с самого важного.",sections:[{title:"",fact_ids:["m:moon"],text:"Сегодня стоит вернуть себе пространство для простого разговора. Уточни детали, прежде чем соглашаться на встречу, и не пытайся угадать чужие ожидания."}],lunar_note:"Традиционно эти сутки посвящают восстановлению.",voc_note:"",advice:"Уточни одно важное условие."};
 const html=renderForecast(out,ctx);
 expect(html).toContain("ЛУНА И ТВОЯ НАТАЛЬНАЯ КАРТА");
 expect(html).toContain("5-му натальному дому");
 expect(html).toContain("Меркурию");
 expect(html).toContain("8-Е ЛУННЫЕ СУТКИ");
});
test("неверные данные: широкий орб, неподтверждённый расчёт и пустой дом не создают утверждений",()=>{
 const moon=selectMoonGuidance({...original,houseKnown:true,transitingMoon:{natalHouse:99},
  activeAspects:[aspect("Venus","trine",5.7),{...aspect("Sun","square",0.4),scope:"transit_transit"}]});
 expect(moon.house).toBe(null);
 expect(moon.aspects).toHaveLength(0);
 expect(renderMoonGuidance(moon)).toBe("");
});
