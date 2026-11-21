// ASTRODAY 2.1 — личные рекомендации по Луне, только по данным расчётного движка.
// Время рождения неизвестно -> домов нет, натальная Луна исключена.
// Этот блок формирует код, не языковая модель: без выдуманных событий и аспектов.
export const MOON_GUIDANCE_VERSION = "astroday-moon-personal-v1";
export const MOON_PERSONAL_PLANETS = Object.freeze(["Sun", "Moon", "Mercury", "Venus", "Mars"]);
const NATAL_PHRASE = Object.freeze({ Sun: "твоему натальному Солнцу", Moon: "твоей натальной Луне", Mercury: "твоему натальному Меркурию", Venus: "твоей натальной Венере", Mars: "твоему натальному Марсу" });
const ASPECT_LABEL = Object.freeze({ conjunction: "соединение", sextile: "секстиль", square: "квадрат", trine: "трин", opposition: "оппозиция" });
// Лунный фон подвижен. При отсутствии отдельного точного события не делаем далеко идущих выводов по широким орбам.
const MAX_MOON_ORB = 3;

// Тема дома + ПОСИЛЬНОЕ ДЕЙСТВИЕ вместо «завтра произойдёт...».
export const MOON_HOUSE_ADVICE = Object.freeze({
  1: { topic: "настроение, самочувствие и собственные желания", action: "Проверь, чего хочется именно тебе. Сделай одну приятную вещь для себя и не соглашайся на чужой план автоматически." },
  2: { topic: "личные деньги, комфорт и ощущение ценности", action: "Спокойно посчитай текущие расходы и подумай, что даёт чувство устойчивости. Покупка ради успокоения сегодня не обязательна." },
  3: { topic: "общение, переписки, обучение и короткие поездки", action: "Напиши человеку, с которым давно хотела связаться, уточни важную договорённость или закончи небольшую учебную задачу." },
  4: { topic: "дом, близкие, семейные привычки и внутреннюю опору", action: "Сделай пространство уютнее, свяжись с близкими, если хочется, и оставь время на спокойный отдых." },
  5: { topic: "романтику, детей, удовольствие и творчество", action: "Подумай, какие отношения тебе подходят. Можно устроить свидание или небольшой праздник самой себе, уделить время детям, если они есть, либо заняться творчеством, которое давно манит." },
  6: { topic: "повседневные дела, рабочий ритм и заботу о себе", action: "Упрости расписание, закончи одну конкретную задачу и придумай небольшой ритуал отдыха. Не требуй от себя идеального выполнения всего списка." },
  7: { topic: "партнёрство, встречи один на один и договорённости", action: "Спроси партнёра или коллегу, как он видит ваши планы. Говори о своих ожиданиях прямо, не пытайся читать мысли." },
  8: { topic: "доверие, совместные ресурсы и личные границы", action: "Уточни правила общих расходов и важные обязательства. Если тревожно, сначала раздели факты и догадки." },
  9: { topic: "учёбу, поездки, мировоззрение и дальние планы", action: "Выбери новую тему для изучения или продумай первый реальный шаг к большой поездке. Сверь детали, прежде чем покупать билеты." },
  10: { topic: "карьеру, ответственность и то, как тебя видят другие", action: "Выдели главную рабочую задачу и уточни критерий результата. Не ставь свою ценность в зависимость от одной оценки." },
  11: { topic: "друзей, команды, сообщества и будущие проекты", action: "Свяжись с теми, с кем тебе хорошо работать и дружить. Обсуди одну совместную идею без необходимости сразу давать обещания." },
  12: { topic: "тишину, восстановление, внутреннюю жизнь и отдых", action: "Снизь информационный шум, выдели время на сон, дневник или спокойную прогулку. Не требуй от себя быть на связи каждую минуту." },
});
const ASPECT_ACTION = Object.freeze({
  Sun: "Спроси себя, насколько сегодняшние решения согласуются с твоими целями, а не только с чужими ожиданиями.",
  Moon: "Назови чувство, которое сейчас важнее всего, и выбери простой способ позаботиться о себе.",
  Mercury: "Прежде чем отправить важное сообщение, перечитай его и сформулируй просьбу конкретно.",
  Venus: "Удели время приятному общению, красоте или творчеству, но сначала проверь, чего хочешь именно ты.",
  Mars: "Дай энергии практичный выход: небольшая активность, одна решённая задача или спокойный разговор о границах.",
});
const MOOD = Object.freeze({
  conjunction: "Тема может ощущаться особенно заметно.",
  square: "Если что-то задевает, не обязательно отвечать с ходу.",
  opposition: "Может быть полезно найти баланс между собственным желанием и взглядом другого.",
  trine: "Можно использовать спокойный момент, чтобы сделать то, что давно откладывала.",
  sextile: "Есть повод самой сделать небольшой шаг навстречу нужному результату.",
});
const validHouse=(value)=>Number.isInteger(Number(value)) && Number(value)>=1 && Number(value)<=12 ? Number(value) : null;
const toFinite=(n)=>(n===null||n===undefined||n==="")?null:(typeof n==="number"&&Number.isFinite(n)?n:Number.isFinite(Number(n))?Number(n):null);

/**
 * calc is an engine /v2/forecast payload at 12:00 in the user's local time.
 * In particular, transitingMoon.natalHouse is the transit Moon's placement
 * INSIDE natal houses, not a standalone transit chart's house number.
 */
export function selectMoonGuidance(calc){
 const houseKnown=calc?.houseKnown===true;
 const natal=calc?.natalProfile?.natalPositions||{};
 const house=houseKnown?validHouse(calc?.transitingMoon?.natalHouse):null;
 const aspects=[];
 for(const a of calc?.activeAspects||[]){
  if(a?.scope && a.scope!=="transit_natal")continue;
  if(a?.transit!=="Moon"||!MOON_PERSONAL_PLANETS.includes(a.natal)||!MOOD[a.aspect])continue;
  if(a.natal==="Moon" && calc?.natalMoonReliable!==true)continue;
  if(!natal[a.natal]||!Number.isFinite(Number(natal[a.natal].longitude)))continue;
  const orb=toFinite(a.orbDeg);
  if(orb===null||orb<0||orb>Math.min(MAX_MOON_ORB,Number(a.orbLimitDeg)>0?Number(a.orbLimitDeg):MAX_MOON_ORB))continue;
  aspects.push({id:"moon:"+a.aspect+":"+a.natal,planet:a.natal,aspect:a.aspect,orbDeg:Math.round(orb*100)/100,state:a.state==="applying"?"applying":"separating"});
 }
 aspects.sort((a,b)=>a.orbDeg-b.orbDeg||MOON_PERSONAL_PLANETS.indexOf(a.planet)-MOON_PERSONAL_PLANETS.indexOf(b.planet));
 return {
  version:MOON_GUIDANCE_VERSION,
  houseKnown:house!==null,
  house,
  // Only the two closest. Otherwise the block turns into an unreadable list.
  aspects:aspects.slice(0,2),
  // False if no trustworthy natal house or personal aspect. Lunar day still displays separately.
  hasPersonalGuidance:house!==null||aspects.length>0,
  observation:"12:00 local",
 };
}

export function renderMoonGuidance(g){
 if(!g?.hasPersonalGuidance)return "";
 const lines=[];
 if(g.house!==null && MOON_HOUSE_ADVICE[g.house]){
  const h=MOON_HOUSE_ADVICE[g.house];
  lines.push("На момент дневного расчёта Луна проходит по твоему "+g.house+"-му натальному дому. Это тема про "+h.topic+".");
  lines.push("🔥 "+h.action);
 }
 if(g.aspects?.length){
  const details=g.aspects.map(a=>"Луна — "+ASPECT_LABEL[a.aspect]+" к "+NATAL_PHRASE[a.planet]).join("; ");
  const first=g.aspects[0];
  lines.push(details+".");
  lines.push(MOOD[first.aspect]+" "+ASPECT_ACTION[first.planet]);
 }
 return lines.join("\n");
}
