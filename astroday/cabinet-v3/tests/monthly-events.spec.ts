import {describe,it,expect} from "vitest";
import {NOVEMBER_2026_EVENTS,monthEventsForDemo,displayEventTime,isValidEventTime} from "../src/monthly-events";

describe("ASTRODAY November 2026 detailed event chronology",()=>{
 it("has all six validated events in UTC in chronological order",()=>{
  const events=NOVEMBER_2026_EVENTS;
  expect(events).toHaveLength(6);
  expect(new Set(events.map(x=>x.id)).size).toBe(events.length);
  const dates=events.map(x=>Date.parse(x.atUTC));
  expect(dates).toEqual([...dates].sort((a,b)=>a-b));
  expect(events.every(isValidEventTime)).toBe(true);
 });
 it("matches the exact dates and names shown in the original Telegram screenshot",()=>{
  expect(NOVEMBER_2026_EVENTS.map(x=>x.title)).toEqual([
    "Новолуние в Скорпионе",
    "Меркурий становится директным",
    "Венера становится директной",
    "Солнце переходит в Стрелец",
    "Полнолуние в Близнецах",
    "Марс переходит в Деву"
  ]);
 });
 it("converts Bali timestamps to Da Nang without altering instants",()=>{
  const b=NOVEMBER_2026_EVENTS.map(x=>displayEventTime(x.atUTC,"Asia/Makassar"));
  const v=NOVEMBER_2026_EVENTS.map(x=>displayEventTime(x.atUTC,"Asia/Ho_Chi_Minh"));
  expect(b.map(x=>x.match(/\d{2}:\d{2}/)?.[0])).toEqual(["15:02","23:52","08:20","15:23","22:54","07:37"]);
  expect(v.map(x=>x.match(/\d{2}:\d{2}/)?.[0])).toEqual(["14:02","22:52","07:20","14:23","21:54","06:37"]);
 });
 it("contains meaningful readable details for each event and does not fabricate other months",()=>{
  for(const x of NOVEMBER_2026_EVENTS){
   expect(x.essence.length).toBeGreaterThan(80);
   expect(x.meaning.length).toBeGreaterThan(100);
   expect(x.workAndMoney.length).toBeGreaterThan(100);
   expect(x.relationships.length).toBeGreaterThan(80);
   expect(x.usefulActions.length).toBeGreaterThanOrEqual(3);
   expect(x.caveat.length).toBeGreaterThan(45);
  }
  expect(monthEventsForDemo(2026,10)).toHaveLength(6);
  expect(monthEventsForDemo(2026,11)).toEqual([]);
 });
});
