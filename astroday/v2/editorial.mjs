// ASTRODAY 2.0 — авторский текст Лизы по рассчитанным фактам (OpenAI Responses API, Structured Outputs).
// Модель пишет только смысл. Даты, время, номер лунных суток и интервалы Луны без курса вставляет код.
// Любой текст проходит validateForecast(); непрошедший никогда не сохраняется как ready.
import { findProfanity } from "./profanity.mjs";
import { factsForPrompt, allowedPlanets, PLANET_RU } from "./topics.mjs";
import { lunarDayInfo, ordinalSutki } from "./lunar-days.mjs";
import { ruDate, formatVoc } from "./timefmt.mjs";

export const PROMPT_VERSION = "astroday-liza-v2.1-20261118";

export const SYSTEM_PROMPT = `Ты пишешь ежедневный персональный астрологический прогноз от лица Лизы (бренд LIZ_TY666) для одного человека в Telegram.

ГОЛОС ЛИЗЫ
- Живая, уверенная, прямая, ироничная, заботливая. Говорит как умная подруга, а не как учебник и не как гадалка.
- Формула: астрологический факт → понятное объяснение простыми словами → одна бытовая ситуация → практичный совет → естественный финал.
- Короткие и средние предложения. Живые переходы («И вот тут…», «Короче», «Но!»). Иногда прямой вопрос читателю. Лёгкая самоирония и юмор — по ситуации, не в каждой фразе.
- Капсом можно выделить одно-два слова для эмоции (например, «НЕ спешим»), но не целые абзацы.
- Эмодзи — 1–3 на весь текст, к месту (🖤 🔥 😅 🌙 ✨ 🙈). Не ставь эмодзи в каждое предложение.
- Заголовок — эмоциональный крючок, а не название аспекта: императив, наблюдение или ирония («НЕ ДОКАЗЫВАЕМ, КТО ТУТ ГЛАВНЫЙ», «СНАЧАЛА ВЫДОХ, ПОТОМ ОТВЕТ»).
- В тексте должна быть хотя бы одна живая интонация Лизы: короткая разговорная реплика, ирония, «Короче…», «И вот тут…», риторический вопрос. Без сюсюканья и без «психолога».
- Бытовые примеры — конкретные и узнаваемые (переписка в чате, корзина в маркетплейсе, «давай потом обсудим», дедлайн в пятницу), а не абстрактные «ситуации».
- Обращение к человеку на «ты». Имя — максимум 1–2 раза за текст, естественно, лучше в начале. Если имя не передано — без имени.
- Ласковые обращения Лизы («мои хорошие», «кошки», «девочки») — это для канала, а здесь прогноз одному человеку: используй обращение по имени; «кошка», «котик» — изредка и только если уместно.

СТРОГО ЗАПРЕЩЕНО
- Любой мат и грубая лексика — ни прямо, ни замаскированно (звёздочки, точки, латиница, «пипец», «ёпт», «нафиг/нахер» и т.п.). Даже если Лиза так пишет в своём канале — здесь НЕЛЬЗЯ.
- Оскорбления, запугивание, «роковые» предсказания, обещания гарантированных событий, денег или исполнения желаний.
- Канцелярит и нейросетевые штампы: «Вселенная подскажет», «звёзды говорят», «в этот прекрасный день», «важно помнить», «не забывай заботиться о себе», «энергии дня», «прислушайся к себе» без конкретики, «в целом», «таким образом».
- Обязательные разделы обо всём подряд. Пиши ТОЛЬКО про темы из блока ФАКТЫ. Не упоминай любовь/деньги/работу/здоровье/семью, если такой темы нет в фактах.
- Выдумывать аспекты, планеты, дома, события, даты, время, градусы. Упоминай только планеты и аспекты из ФАКТОВ. Никаких цифр вообще: числа, время и даты вставит программа.
- Описывать ситуации как уже случившиеся («ты поссорилась», «тебе написал бывший»). Только как возможность: «может захотеться», «если вдруг…».
- Медицинские советы и диагнозы. Финансовые рекомендации конкретных покупок/вложений.
- Просить оценить прогноз, рассказать, что произошло, писать в комментарии, ставить реакции. Никаких опросов.
- Придумывать личные истории Лизы («у меня вчера…»).
- Повторять заголовки и первые фразы из блока «НЕДАВНИЕ ВСТУПЛЕНИЯ».

ДЛИНА зависит от силы дня (поле intensity): quiet — коротко и спокойно (2–4 предложения в одном разделе); normal — один раздел 4–7 предложений, второй раздел только если есть вторая тема; strong — до двух разделов по 5–8 предложений. Не растягивай слабый аспект до большого события.

ЛУННЫЙ БЛОК: если переданы лунные сутки — 1–2 предложения о традиционной символике этих суток своими словами, мягко и практично, без мистики и запугивания. Номер и время не пиши — их вставит программа. Не пиши канцелярских оборотов вроде «символ части дня».

ПРИМЕР НУЖНОЙ ИНТОНАЦИИ (не копируй, только ориентир по ритму):
«Сегодня Марс давит на твою Венеру — и хочется, чтобы всё решилось вот прям сейчас. Знакомо: в чате три человека думают, а ты уже пишешь „ну всё, решили“ 😅 Но! Твой вариант — это ещё не общий план. Скажи, чего хочешь, и дай людям минуту. Не геройствуем.»
ЛУНА БЕЗ КУРСА: если передано, что период есть, — одна фраза совета в духе традиции (не торопиться с запуском нового, доделывать начатое). Время не пиши.

Ответ строго по JSON-схеме.`;

export const FORECAST_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["headline", "opening", "sections", "lunar_note", "voc_note", "advice"],
  properties: {
    headline: { type: "string", description: "Короткий яркий заголовок дня, 3–9 слов, без цифр и без даты" },
    opening: { type: "string", description: "1–2 предложения входа в день; можно обратиться по имени" },
    sections: {
      type: "array", minItems: 1, maxItems: 2,
      items: { type: "object", additionalProperties: false, required: ["fact_ids", "title", "text"],
        properties: { fact_ids: { type: "array", items: { type: "string" } }, title: { type: "string", description: "Короткий заголовок раздела капсом или пустая строка" }, text: { type: "string" } } },
    },
    lunar_note: { type: "string", description: "1–2 предложения о символике лунных суток или пустая строка" },
    voc_note: { type: "string", description: "Одна фраза про Луну без курса или пустая строка" },
    advice: { type: "string", description: "1–2 предложения: на что обратить внимание, конкретно" },
  },
};

export function buildUserPrompt(ctx) {
  const lines = [];
  lines.push("ДАТА: " + ruDate(ctx.day, true) + " (не пиши дату в тексте)");
  lines.push("ИМЯ ДЛЯ ОБРАЩЕНИЯ: " + (ctx.name ? ctx.name : "(без имени)"));
  lines.push("ГРАММАТИЧЕСКИЙ РОД: " + (ctx.gender === "f" ? "женский" : ctx.gender === "m" ? "мужской" : "неизвестен — пиши без родовых окончаний (не «устала/устал», а «усталость», «может захотеться»)"));
  lines.push("СИЛА ДНЯ (intensity): " + ctx.selection.intensity);
  lines.push("ВРЕМЯ РОЖДЕНИЯ ИЗВЕСТНО: " + (ctx.selection.houseKnown ? "да (дома учитываются)" : "нет — не упоминай дома"));
  lines.push("");
  lines.push("ФАКТЫ (используй fact_ids из квадратных скобок):");
  lines.push(factsForPrompt(ctx.selection) || "(выраженных персональных аспектов нет — короткий спокойный прогноз про фон Луны)");
  lines.push("");
  const ld = ctx.lunar?.lunarDayAtNoon ? lunarDayInfo(ctx.lunar.lunarDayAtNoon) : null;
  lines.push("ЛУННЫЕ СУТКИ: " + (ld ? "есть; традиционный символ — " + ld.symbol + "; темы: " + ld.keywords + (ctx.lunar.changesDuringDay ? "; " + (ctx.lunar.nextPart ? "ближе к " + ctx.lunar.nextPart + " начнутся следующие сутки" : "в течение дня начнутся следующие сутки") + " — не утверждай, что эти сутки весь день" : "") : "нет данных — lunar_note пустая строка"));
  lines.push("ЛУНА БЕЗ КУРСА В ЭТИ СУТКИ: " + (ctx.voc?.length ? "да" : "нет — voc_note пустая строка"));
  if (ctx.recentOpenings?.length) {
    lines.push("");
    lines.push("НЕДАВНИЕ ВСТУПЛЕНИЯ (не повторять):");
    for (const r of ctx.recentOpenings.slice(0, 7)) lines.push("- " + r);
  }
  return lines.join("\n");
}

export function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output || []) for (const c of item?.content || []) if (c?.type === "output_text" && typeof c.text === "string") return c.text;
  return null;
}

export async function callOpenAI({ apiKey, model, system, user, fetchImpl = fetch, reasoningEffort = null, timeoutMs = 90000, cacheKey = null, baseUrl = "https://api.openai.com/v1/responses" }) {
  const body = { model, input: [{ role: "system", content: system }, { role: "user", content: user }], store: false, max_output_tokens: 2400, text: { format: { type: "json_schema", name: "astroday_forecast_v2", strict: true, schema: FORECAST_SCHEMA } } };
  if (reasoningEffort) body.reasoning = { effort: reasoningEffort };
  if (cacheKey) body.prompt_cache_key = cacheKey;
  const started = Date.now();
  const r = await fetchImpl(baseUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const data = await r.json().catch(() => null);
  if (!r.ok) { const e = Error("openai_http_" + r.status); e.status = r.status; e.retryable = r.status === 429 || r.status >= 500; e.detail = data?.error?.code || data?.error?.type || null; throw e; }
  const text = extractOutputText(data);
  if (!text) { const e = Error("openai_empty_output"); e.retryable = true; throw e; }
  let parsed;
  try { parsed = JSON.parse(text); } catch { const e = Error("openai_invalid_json"); e.retryable = true; throw e; }
  return { output: parsed, id: data?.id ?? null, model: data?.model ?? model, usage: data?.usage ?? null, ms: Date.now() - started };
}

// ------------------------------------------------------------------ validation
const PLANET_STEMS = { Sun: /солнц/i, Moon: /лун(?!к)/i, Mercury: /меркури/i, Venus: /венер/i, Mars: /\bмарс/i, Jupiter: /юпитер/i, Saturn: /сатурн/i, Uranus: /\bуран(?!и)/i, Neptune: /нептун/i, Pluto: /плутон/i };
const CLICHES = [/вселенн/i, /звёзды говорят|звезды говорят/i, /в этот прекрасный день/i, /важно помнить/i, /не забывай(те)? заботиться/i, /энерги[яи] дня/i, /таким образом/i, /в целом,/i];
const SURVEY = [/откликнул/i, /напиши(те)? (мне )?в комментари/i, /оцени(те)? прогноз/i, /поделись|поделитесь/i, /расскажи(те)?,? как (прош|был)/i, /ставь(те)? реакц/i, /напиши(те)? (мне )?(в личку|в личные|в директ)/i];
const PAST_EVENTS = [/\bты (уже )?(поссорил|получил|встретил|потерял|рассталась|расстался)/i, /\bтебе (уже )?(написал|позвонил|пришл)/i];
const SPHERES = { love: /любов|романт|свидан|отношени|партн[её]р/i, money: /деньг|финанс|зарплат|покупк|трат/i, career: /карьер|начальств|работ/i, health: /здоров|болезн|самочувств/i, family: /семь[яеи]|родител|мама|папа|дет(и|ей)/i };
const DOMAIN_SPHERE = { love: ["love"], partners: ["love"], money: ["money"], depth: ["money", "love"], career: ["career"], routine: ["career", "health"], home: ["family"], self: ["health"], communication: [], horizons: [], friends: [], inner: ["health"] };

export function modelText(out) {
  return [out.headline, out.opening, ...(out.sections || []).flatMap((s) => [s.title, s.text]), out.lunar_note, out.voc_note, out.advice].filter(Boolean).join("\n");
}

export function validateForecast(out, ctx) {
  const problems = [];
  if (!out || typeof out !== "object") return { ok: false, problems: ["no_output"] };
  const all = modelText(out);
  const prof = findProfanity(all);
  if (prof.length) problems.push("profanity:" + prof.map((p) => p.reason).join(","));
  if (/\d/.test(all)) problems.push("digits_in_model_text");
  for (const re of CLICHES) if (re.test(all)) problems.push("cliche:" + re.source.slice(0, 20));
  for (const re of SURVEY) if (re.test(all)) problems.push("survey_or_cta");
  for (const re of PAST_EVENTS) if (re.test(all)) problems.push("invented_past_event");
  const allowed = allowedPlanets(ctx.selection);
  for (const [p, re] of Object.entries(PLANET_STEMS)) if (re.test(all) && !allowed.has(p)) problems.push("planet_not_in_facts:" + p);
  if (!ctx.gender && /(^|[\s,.!?«"(])ты\s+(?:не\s+|уже\s+)?\p{L}{2,}(?:ла|лась|лся|л)(?=[\s,.!?»")]|$)/iu.test(all)) problems.push("gendered_verb_unknown_gender");
  if (!ctx.selection.houseKnown && /(перв|втор|трет|четв[её]рт|пят|шест|седьм|восьм|девят|десят|одиннадцат|двенадцат|натальн)\S*\s+дом/i.test(all)) problems.push("houses_without_birth_time");
  const ids = new Set([...(ctx.selection.themes || []).flatMap((t) => t.facts.map((f) => f.id)), "m:moon", ...(ctx.selection.skyEvents || []).map((e) => e.id)]);
  for (const s of out.sections || []) for (const id of s.fact_ids || []) if (!ids.has(id)) problems.push("unknown_fact_id");
  const themeCount = Math.max(1, ctx.selection.themes.length);
  if ((out.sections || []).length > themeCount) problems.push("more_sections_than_themes");
  // «обо всём подряд»: сферы, которых нет в выбранных темах, не должны появляться
  const allowedSpheres = new Set((ctx.selection.themes || []).flatMap((t) => DOMAIN_SPHERE[t.domain] || []));
  const extra = Object.entries(SPHERES).filter(([k, re]) => re.test((out.sections || []).map((s) => s.text).join(" ") + " " + out.advice) && !allowedSpheres.has(k)).map(([k]) => k);
  if (extra.length >= 2) problems.push("too_many_spheres:" + extra.join(","));
  if (ctx.name) {
    const n = (all.match(new RegExp(ctx.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    if (n > 2) problems.push("name_overused");
  }
  const caps = (all.match(/\b[А-ЯЁ]{4,}\b/g) || []).filter((w) => !out.headline.includes(w));
  if (caps.length > 4) problems.push("too_much_caps");
  const emoji = (all.match(/\p{Extended_Pictographic}/gu) || []).length;
  if (emoji > 6) problems.push("too_many_emoji");
  const norm = (s) => String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
  for (const r of ctx.recentOpenings || []) if (norm(r) && (norm(r) === norm(out.opening) || norm(r) === norm(out.headline))) problems.push("repeated_opening");
  const len = (out.sections || []).reduce((a, s) => a + s.text.length, 0);
  const max = { quiet: 700, normal: 1500, strong: 2300 }[ctx.selection.intensity] || 1500;
  if (len > max) problems.push("too_long");
  if (len < 120) problems.push("too_short");
  if (!ctx.voc?.length && out.voc_note) problems.push("voc_note_without_voc");
  if (!ctx.lunar?.lunarDayAtNoon && out.lunar_note) problems.push("lunar_note_without_data");
  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}

// ------------------------------------------------------------------ rendering (Telegram HTML)
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const para = (s) => esc(String(s || "").trim()).replace(/\n{3,}/g, "\n\n");

export function renderForecast(out, ctx) {
  const parts = [];
  parts.push("🔮 <b>" + esc(ctx.kind === "tomorrow" ? "ТВОЙ ПРОГНОЗ НА ЗАВТРА, " : "ТВОЙ ПРОГНОЗ НА ") + esc(ruDate(ctx.day).toUpperCase()) + "</b>");
  parts.push("<b>" + para(out.headline).toUpperCase() + "</b>");
  parts.push(para(out.opening));
  for (const s of out.sections) parts.push((s.title ? "<b>" + para(s.title).toUpperCase() + "</b>\n" : "") + para(s.text));
  if (ctx.lunar?.lunarDayAtNoon) {
    parts.push("🌙 <b>" + esc(ordinalSutki(ctx.lunar.lunarDayAtNoon).toUpperCase()) + "</b>" + (out.lunar_note ? "\n" + para(out.lunar_note) : ""));
  }
  if (ctx.voc?.length) {
    const lines = ctx.voc.map((v) => esc(formatVoc({ startMs: v.startTs * 1000, endMs: v.endTs * 1000, zone: ctx.zone, cityName: ctx.cityName, forecastDay: ctx.day }).line));
    parts.push("🌙 <b>ЛУНА БЕЗ КУРСА</b>\n" + lines.join("\n") + (out.voc_note ? "\n" + para(out.voc_note) : ""));
  }
  parts.push("✨ <b>НА ЧТО ОБРАТИТЬ ВНИМАНИЕ</b>\n" + para(out.advice));
  const html = parts.filter(Boolean).join("\n\n");
  return html;
}

export function htmlToPlain(html) {
  return String(html).replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Полный цикл для одного дня: до maxAttempts генераций с замечаниями валидатора.
export async function writeForecast(ctx, { apiKey, model, fetchImpl = fetch, maxAttempts = 3, reasoningEffort = null, onUsage = async () => {} }) {
  const system = SYSTEM_PROMPT;
  let user = buildUserPrompt(ctx);
  const attempts = [];
  for (let i = 0; i < maxAttempts; i++) {
    const answer = await callOpenAI({ apiKey, model, system, user, fetchImpl, reasoningEffort, cacheKey: "astroday-" + PROMPT_VERSION });
    await onUsage(answer.usage, answer);
    const check = validateForecast(answer.output, ctx);
    attempts.push({ id: answer.id, model: answer.model, ms: answer.ms, ok: check.ok, problems: check.problems, usage: answer.usage });
    if (check.ok) {
      const html = renderForecast(answer.output, ctx);
      const plain = htmlToPlain(html);
      const final = findProfanity(plain);
      if (final.length || html.length > 4000) { attempts[attempts.length - 1].ok = false; attempts[attempts.length - 1].problems.push(final.length ? "profanity_after_render" : "telegram_too_long"); }
      else return { ok: true, output: answer.output, html, plain, attempts, model: answer.model, responseId: answer.id };
    }
    user = buildUserPrompt(ctx) + "\n\nПРЕДЫДУЩИЙ ВАРИАНТ ОТКЛОНЁН ПРОВЕРКОЙ: " + check.problems.join("; ") + ". Перепиши с нуля, исправив это.";
  }
  return { ok: false, attempts };
}
