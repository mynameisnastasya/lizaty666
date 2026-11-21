import {describe,it,expect} from "vitest";
import {addDays,dayPillar,getDayMaster,jieCaiCalendar,interpretation} from "../helpers/astrodayBazi";
describe("BaZi Jie Cai: regression against engine v2",()=>{
 it("matches historic day anchors",()=>{
  expect(dayPillar("1949-10-01").hanzi).toBe("甲子");
  expect(dayPillar("2000-01-01").hanzi).toBe("戊午");
  expect(dayPillar("1900-01-01").hanzi).toBe("甲戌");
  expect(dayPillar(addDays("2026-11-18",60)).hanzi).toBe(dayPillar("2026-11-18").hanzi);
 });
 it("keeps Jie Cai in the same element but opposite polarity",()=>{
  for(let i=0;i<10;i++){
   const date=Array.from({length:10},(_,j)=>addDays("2026-11-01",j)).find(d=>dayPillar(d).stem===i)!;
   const dm=getDayMaster(date);
   expect(dm.stem).toBe(i);
   expect(Math.floor(dm.jieCaiStem/2)).toBe(Math.floor(i/2));
   expect(dm.jieCaiStem%2).not.toBe(i%2);
  }
 });
 it("finds exactly three primary dates in a 30 day period",()=>{
  const dm=getDayMaster("1994-03-15","14:30");
  const days=jieCaiCalendar(dm,"2026-11-18","2026-12-17");
  expect(days.filter(x=>x.kind==="stem")).toHaveLength(3);
  expect(new Set(days.map(x=>x.day)).size).toBe(days.length);
  for(const d of days)if(d.kind==="stem")expect(dayPillar(d.day).stem).toBe(dm.jieCaiStem);
 });
 it("flags Zi 23:xx boundary and validates impossible dates",()=>{
  const a=getDayMaster("1990-05-10","23:40"),b=getDayMaster("1990-05-10","23:40","zi23");
  expect(a.ambiguity).toBe(true);
  expect(a.pillar).toBe(dayPillar("1990-05-10").hanzi);
  expect(b.pillar).toBe(dayPillar("1990-05-11").hanzi);
  expect(()=>dayPillar("2026-02-30")).toThrow();
 });
 it("never promises automatic financial losses",()=>{
  expect(interpretation("stem").action).not.toMatch(/потеряешь|гарантирован|украдут/i);
 });
});
