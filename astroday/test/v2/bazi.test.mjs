import { test, expect } from "bun:test";
import { dayPillar, dayMaster, jieCaiStem, tenGod, jieCaiCalendar, monthPillar, renderJieCaiMessages, stemLabel, addDays } from "../../v2/bazi.mjs";

test("опорные дни шестидесятеричного цикла", () => {
  expect(dayPillar("1949-10-01").hanzi).toBe("甲子");
  expect(dayPillar("2000-01-01").hanzi).toBe("戊午");
  expect(dayPillar("1900-01-01").hanzi).toBe("甲戌");
  // непрерывность: +60 дней = тот же столп, +1 день = следующий
  expect(dayPillar(addDays("2026-11-18", 60)).cycle).toBe(dayPillar("2026-11-18").cycle);
  expect((dayPillar("2026-11-19").cycle - dayPillar("2026-11-18").cycle + 60) % 60).toBe(1);
  // через границу года и високосный день
  expect((dayPillar("2024-03-01").cycle - dayPillar("2024-02-28").cycle + 60) % 60).toBe(2);
});

test("инь/ян и пять стихий: Грабитель — та же стихия, другая полярность", () => {
  for (let s = 0; s < 10; s++) {
    const j = jieCaiStem(s);
    expect(Math.floor(j / 2)).toBe(Math.floor(s / 2));
    expect(j % 2).not.toBe(s % 2);
    expect(tenGod(s, j)).toBe("jie_cai");
    expect(tenGod(s, s)).toBe("bi_jian");
  }
  expect(stemLabel(4)).toBe("Земля Ян (戊)");
  expect(stemLabel(jieCaiStem(4))).toBe("Земля Инь (己)");
  expect(stemLabel(jieCaiStem(9))).toBe("Вода Ян (壬)");
  // все десять божеств различимы для одного мастера
  expect(new Set([0,1,2,3,4,5,6,7,8,9].map((x) => tenGod(0, x))).size).toBe(10);
});

test("месяц Ба-цзы: ноябрь 2026 = 己亥 (у Лизы: месяц Грабителя для Земли Ян и Воды Инь)", () => {
  const m = monthPillar(Date.parse("2026-11-18T12:00:00Z"));
  expect(m.hanzi).toBe("己亥");
  expect(jieCaiStem(4)).toBe(m.stem);           // 戊 → 己 (ствол месяца)
  expect(jieCaiStem(9)).toBe(8);                 // 癸 → 壬 = главный скрытый ствол 亥
  expect(monthPillar(Date.parse("2026-02-10T00:00:00Z")).hanzi).toBe("庚寅"); // год 丙午 начался с 立春
  expect(monthPillar(Date.parse("2026-01-20T00:00:00Z")).hanzi).toBe("己丑"); // ещё год 乙巳: 戊寅…己丑
});

test("граница суток при рождении 23:xx помечается, школа zi23 сдвигает день", () => {
  const a = dayMaster({ birthLocalDate: "1990-05-10", birthLocalTime: "23:40", timeKnown: true });
  const b = dayMaster({ birthLocalDate: "1990-05-10", birthLocalTime: "23:40", timeKnown: true, dayBoundary: "zi23" });
  expect(a.ambiguity).toBe("zi_hour_23");
  expect(b.pillar.cycle).toBe((a.pillar.cycle + 1) % 60);
  const c = dayMaster({ birthLocalDate: "1990-05-10", birthLocalTime: null, timeKnown: false });
  expect(c.ambiguity).toBeNull();
  expect(c.stem).toBe(a.stem);
});

test("календарь на 30 дней: только верные дни и полный период", () => {
  const dm = dayMaster({ birthLocalDate: "1994-03-15", birthLocalTime: "14:30", timeKnown: true });
  const days = jieCaiCalendar({ dm, startDay: "2026-11-18", endDay: "2026-12-17" });
  for (const x of days) {
    const p = dayPillar(x.day);
    expect(x.day >= "2026-11-18" && x.day <= "2026-12-17").toBe(true);
    if (x.kind === "stem") expect(p.stem).toBe(dm.jieCaiStem);
  }
  // ствол повторяется каждые 10 дней: в 30-дневном окне ровно 3 «главных» дня
  expect(days.filter((x) => x.kind === "stem").length).toBe(3);
  // 12 месяцев: ~36–37 главных дней
  const year = jieCaiCalendar({ dm, startDay: "2026-11-18", endDay: "2027-11-17", includeHidden: false });
  expect(year.length).toBeGreaterThanOrEqual(36);
  expect(year.length).toBeLessThanOrEqual(37);
});

test("сообщения читаемы: группировка по месяцам, без мата, < 3500 символов", async () => {
  const { findProfanity } = await import("../../v2/profanity.mjs");
  const dm = dayMaster({ birthLocalDate: "1994-03-15", timeKnown: false });
  const days = jieCaiCalendar({ dm, startDay: "2026-11-18", endDay: "2027-05-17" });
  const msgs = renderJieCaiMessages({ name: "Настя", dm, days, startDay: "2026-11-18", endDay: "2027-05-17" });
  expect(msgs.length).toBeGreaterThan(3);
  for (const m of msgs) { expect(m.length).toBeLessThan(3500); expect(findProfanity(m)).toEqual([]); }
  expect(msgs[0]).toContain("Настя");
  expect(msgs.join("\n")).not.toMatch(/украдут|обязательно потеряешь|гарантирован/i);
});
