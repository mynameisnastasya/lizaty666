import { test, expect } from "bun:test";
import { validateForecast, renderForecast, buildUserPrompt, SYSTEM_PROMPT, FORECAST_SCHEMA } from "../../v2/editorial.mjs";
import { selectTopics } from "../../v2/topics.mjs";
import { formatVoc, localDay, tomorrowOf, zonedToUtc } from "../../v2/timefmt.mjs";
import { findProfanity } from "../../v2/profanity.mjs";

const calc = { houseKnown: true, natalMoonReliable: true, transitingMoon: { sign: "Leo", natalHouse: 7 }, transitingPlanets: { Mars: { natalHouse: 10 } },
  activeAspects: [{ scope: "transit_natal", transit: "Mars", natal: "Venus", aspect: "square", orbDeg: 0.4, orbLimitDeg: 6, state: "applying" }],
  dayEvents: [], natalProfile: { natalPositions: { Venus: { longitude: 100 }, Sun: { longitude: 10 } }, houseCusps: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] } };
const sel = selectTopics(calc);
const base = { headline: "Не геройствуем, а договариваемся", opening: "Настя, сегодня хочется всё и сразу.", sections: [{ fact_ids: [sel.themes[0].facts[0].id], title: "", text: "Марс давит на твою Венеру, и рабочие задачи могут превратиться в соревнование, кто громче. Если начальник торопит, не отвечай в ту же секунду: сначала выдох, потом аргументы. Так ты сохранишь и нервы, и отношения в команде." }], lunar_note: "Эти сутки про честный взгляд на себя.", voc_note: "", advice: "Сделай одно важное дело до обеда и не бери чужое." };
const ctx = { day: "2026-11-18", zone: "Asia/Novosibirsk", cityName: "Новосибирск", name: "Настя", gender: "f", selection: sel, lunar: { lunarDayAtNoon: 9, changesDuringDay: true }, voc: [], recentOpenings: [] };

test("отбор тем: одна сильная тема, а не все сферы", () => {
  expect(sel.themes.length).toBe(1);
  expect(sel.themes[0].domain).toBe("career");
  expect(["normal", "strong"]).toContain(sel.intensity);
  const quiet = selectTopics({ ...calc, activeAspects: [{ scope: "transit_natal", transit: "Moon", natal: "Sun", aspect: "sextile", orbDeg: 5.5, orbLimitDeg: 6, state: "separating" }] });
  expect(quiet.themes.length).toBe(0);
  expect(quiet.intensity).toBe("quiet");
});

test("валидный текст проходит, рендер — корректный Telegram HTML", () => {
  const v = validateForecast(base, ctx);
  expect(v).toEqual({ ok: true, problems: [] });
  const html = renderForecast(base, ctx);
  expect(html).toContain("🔮 <b>ТВОЙ ПРОГНОЗ НА 18 НОЯБРЯ</b>");
  expect(html).toContain("🌙 <b>9-Е ЛУННЫЕ СУТКИ</b>");
  expect(html).not.toContain("ЛУНА БЕЗ КУРСА"); // нет периода — нет блока
  expect(html).not.toMatch(/(^|\n)#/);
  expect(html.length).toBeLessThan(4096);
  // только поддерживаемые теги
  expect([...html.matchAll(/<\/?([a-z]+)/g)].every((m) => m[1] === "b")).toBe(true);
});

test("экранирование динамических данных", () => {
  const html = renderForecast({ ...base, opening: "<script>alert(1)</script> & Ко" }, ctx);
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
});

test("валидатор ловит: мат, цифры, чужие планеты, лишние сферы, опросы, повторы, выдуманную Луну без курса", () => {
  const p = (o, c = ctx) => validateForecast({ ...base, ...o }, c).problems;
  expect(p({ advice: "Короче, пипец, не спеши." }).some((x) => x.startsWith("profanity"))).toBe(true);
  expect(p({ advice: "В 14:30 позвони маме." })).toContain("digits_in_model_text");
  expect(p({ advice: "Сатурн тоже подключается." })).toContain("planet_not_in_facts:Saturn");
  expect(p({ advice: "Напиши в комментариях, откликнулось ли." })).toContain("survey_or_cta");
  expect(p({ sections: [{ ...base.sections[0], text: base.sections[0].text + " В любви будет романтика, с деньгами осторожно, здоровье береги, семья поддержит." }] }).some((x) => x.startsWith("too_many_spheres"))).toBe(true);
  expect(p({}, { ...ctx, recentOpenings: ["Настя, сегодня хочется всё и сразу."] })).toContain("repeated_opening");
  expect(p({ voc_note: "Не начинай новое." })).toContain("voc_note_without_voc");
  expect(p({ sections: [base.sections[0], base.sections[0]] })).toContain("more_sections_than_themes");
  expect(p({ advice: "Вселенная подскажет." }).some((x) => x.startsWith("cliche"))).toBe(true);
  expect(p({ opening: "Настя, Настя, Настя!" })).toContain("name_overused");
  expect(p({ advice: "Проверь, что ты понял задачу." }, { ...ctx, gender: null })).toContain("gendered_verb_unknown_gender");
  expect(p({ advice: "Проверь, что ты поняла задачу." }, { ...ctx, gender: "f" })).not.toContain("gendered_verb_unknown_gender");
});

test("промпт: без мата, без опросов, только факты; схема строгая", () => {
  expect(SYSTEM_PROMPT).toContain("мат");
  expect(SYSTEM_PROMPT).toMatch(/Никаких опросов/);
  expect(FORECAST_SCHEMA.additionalProperties).toBe(false);
  const u = buildUserPrompt(ctx);
  expect(u).toContain("[" + sel.themes[0].facts[0].id + "]");
  expect(u).not.toMatch(/1994|birth|telegram/i); // минимум персональных данных: ни даты рождения, ни ID
});

test("Луна без курса: местное время приоритетно, Москва — ориентир, даты при переходе через полночь", () => {
  const s = Date.parse("2026-11-17T14:27:00Z"), e = Date.parse("2026-11-17T21:20:00Z");
  const msk = formatVoc({ startMs: s, endMs: e, zone: "Europe/Moscow", forecastDay: "2026-11-17" });
  expect(msk.line).toBe("с 17:27 до 18 ноября 00:20 по Москве");
  const nsk = formatVoc({ startMs: s, endMs: e, zone: "Asia/Novosibirsk", cityName: "Новосибирск", forecastDay: "2026-11-18" });
  expect(nsk.line).toBe("с 17 ноября 21:27 до 04:20 по твоему времени (Новосибирск)\nпо Москве: с 17 ноября 17:27 до 00:20");
  const kem = formatVoc({ startMs: s, endMs: e, zone: "Asia/Novokuznetsk", cityName: "Кемерово", forecastDay: "2026-11-17" });
  expect(kem.local).toBe("с 21:27 до 18 ноября 04:20");
  const vn = formatVoc({ startMs: s, endMs: e, zone: "Asia/Ho_Chi_Minh", cityName: "Вьетнам", forecastDay: "2026-11-17" });
  expect(vn.local).toBe("с 21:27 до 18 ноября 04:20");
  // зона с тем же смещением, что Москва, — без дублирования
  const minsk = formatVoc({ startMs: s, endMs: e, zone: "Europe/Minsk", forecastDay: "2026-11-17" });
  expect(minsk.msk).toBeNull();
  // летнее время: Нью-Йорк до/после 1 ноября 2026
  const ny1 = formatVoc({ startMs: Date.parse("2026-10-31T14:00:00Z"), endMs: Date.parse("2026-10-31T16:00:00Z"), zone: "America/New_York", forecastDay: "2026-10-31" });
  const ny2 = formatVoc({ startMs: Date.parse("2026-11-02T14:00:00Z"), endMs: Date.parse("2026-11-02T16:00:00Z"), zone: "America/New_York", forecastDay: "2026-11-02" });
  expect(ny1.local).toBe("с 10:00 до 12:00");
  expect(ny2.local).toBe("с 09:00 до 11:00");
});

test("«завтра» — по локальной дате пользователя, а не сервера", () => {
  const at = Date.parse("2026-11-18T18:30:00Z"); // 21:30 Москва, 01:30 19-го Новосибирск
  expect(localDay("Europe/Moscow", at)).toBe("2026-11-18");
  expect(tomorrowOf("Europe/Moscow", at)).toBe("2026-11-19");
  expect(localDay("Asia/Novosibirsk", at)).toBe("2026-11-19");
  expect(tomorrowOf("Asia/Novosibirsk", at)).toBe("2026-11-20");
  expect(tomorrowOf("America/Los_Angeles", at)).toBe("2026-11-19");
  expect(new Date(zonedToUtc("2026-11-19", 8, 0, "Asia/Novokuznetsk")).toISOString()).toBe("2026-11-19T01:00:00.000Z");
});

test("лунные сутки: когда начнутся следующие — словами, по местному времени", async () => {
  const { nextLunarPart } = await import("../../v2/lunar-days.mjs");
  const seg = { number: 9, startTs: Date.parse("2026-11-17T10:53:44Z") / 1000, endTs: Date.parse("2026-11-18T11:01:14Z") / 1000 };
  expect(nextLunarPart({ day: "2026-11-18", changesDuringDay: true, lunarDayAtNoonSegment: seg }, "Europe/Moscow")).toBe("середине дня"); // 14:01 МСК
  expect(nextLunarPart({ day: "2026-11-18", changesDuringDay: true, lunarDayAtNoonSegment: seg }, "Asia/Novosibirsk")).toBe("вечеру"); // 18:01 по Новосибирску
});
