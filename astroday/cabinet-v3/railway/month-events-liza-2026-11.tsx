/**
 * ASTRODAY monthly sky events. This file describes the November 2026 events
 * visible in the current production calendar, for the independent design demo.
 * Dates/times are UTC; NEVER format by adding a fixed UTC offset.
 *
 * Sources used for cross-checking the UTC moments:
 * https://cafeastrology.com/this-month-astrology-november-2026/
 * https://cafeastrology.com/astrology-of-2026.html
 * https://cafeastrology.com/retrogrades.html
 * Different ephemerides may differ by about one minute due to rounding.
 */
export type SkyEventKind =
  | "new_moon" | "full_moon" | "planet_station" | "planet_sign_ingress";
export type MonthlySkyEvent = {
  id: string;
  atUTC: string;
  kind: SkyEventKind;
  body: string;
  title: string;
  subtitle: string;
  essence: string;
  meaning: string;
  workAndMoney: string;
  relationships: string;
  usefulActions: string[];
  caveat: string;
};
export const NOVEMBER_2026_EVENTS: readonly MonthlySkyEvent[] = [
  {
    id: "20261109-new-moon-scorpio",
    atUTC: "2026-11-09T07:02:00Z",
    kind: "new_moon",
    body: "Moon",
    title: "Новолуние в Скорпионе",
    subtitle: "Тема: доверие, глубина и обновление",
    essence: "Новолуние открывает очередной лунный цикл. В символике Скорпиона особое место занимают доверие, близость, совместные ресурсы и вопросы, которые долго не хотелось обсуждать.",
    meaning: "Это подходящая метафорическая точка для пересмотра эмоциональных обязательств и старых сценариев. Не требуется немедленно принимать важное решение: гораздо полезнее определить, какой вопрос ты готова исследовать честнее.",
    workAndMoney: "В работе полезно пересмотреть условия сотрудничества, прозрачность комиссий, финансовые договорённости и контроль над общим бюджетом. Не путай астрологический образ с прогнозом доходов: настоящие решения принимай по цифрам и документам.",
    relationships: "Если назрел разговор о границах или взаимных ожиданиях, начни с собственных чувств и наблюдений, а не обвинений. Секретность и ревность не становятся фактами только из-за положения Луны.",
    usefulActions: ["Выпиши одну тему, в которой нужна ясность.", "Проверь обязательства и доступы к совместным ресурсам.", "Выбери маленький шаг, который можно сделать без лишнего риска."],
    caveat: "Новолуние не вызывает финансовые или личные события. Это символический ориентир, а не предсказание."
  },
  {
    id: "20261113-mercury-direct",
    atUTC: "2026-11-13T15:52:00Z",
    kind: "planet_station",
    body: "Mercury",
    title: "Меркурий становится директным",
    subtitle: "Тема: разговоры, документы и информация",
    essence: "После периода видимого ретроградного движения Меркурий меняет направление на прямое. В традиционной астрологии это связывают с пересмотром коммуникаций, договорённостей и решений.",
    meaning: "Разворот не означает, что все задержки исчезнут за минуту. Стационарная фаза традиционно рассматривается как переход, когда особенно полезно заканчивать начатую проверку и уточнять детали.",
    workAndMoney: "Хороший организационный повод повторно сверить реквизиты, технические задания, счета, условия вывода денег и переписки. Важные документы проверяй независимо от астрологических дат, особенно когда речь о договорах и оплате.",
    relationships: "Попроси собеседника подтвердить, что вы одинаково понимаете обещания и сроки. Невысказанные ожидания лучше превращать в конкретные вопросы.",
    usefulActions: ["Повторно проверь нерешённые письма и договорённости.", "Сохрани письменные подтверждения важных условий.", "Раздели факты и предположения перед серьёзным разговором."],
    caveat: "Меркурий не является доказанной причиной сбоев техники, коммуникаций и платежей."
  },
  {
    id: "20261114-venus-direct",
    atUTC: "2026-11-14T00:20:00Z",
    kind: "planet_station",
    body: "Venus",
    title: "Венера становится директной",
    subtitle: "Тема: ценности, симпатии и деньги",
    essence: "Венера завершает видимое ретроградное движение. В астрологической традиции её связывают с отношениями, личными ценностями, эстетикой и способом распоряжаться ресурсами.",
    meaning: "Период можно использовать как повод понять, что действительно приносит радость, а что удерживается привычкой. Смена направления планеты сама по себе ничего не гарантирует в любви или финансах.",
    workAndMoney: "Переосмысли стоимость своих услуг, условия партнёрств, незапланированные покупки и ценность своего времени. Если хочешь поднять цену, опирайся на качество продукта, себестоимость и рыночный спрос.",
    relationships: "Смотри не только на эмоции, но и на взаимность, договорённости и поведение. Приятный разговор не заменяет устойчивых действий.",
    usefulActions: ["Составь список личных и финансовых приоритетов.", "Сверь стоимость услуг и реальные расходы.", "Спокойно обсуди с близкими важные ожидания."],
    caveat: "Астрологический разворот Венеры не предсказывает конкретные поступления денег или возвращение отношений."
  },
  {
    id: "20261122-sun-sagittarius",
    atUTC: "2026-11-22T07:23:00Z",
    kind: "planet_sign_ingress",
    body: "Sun",
    title: "Солнце переходит в Стрелец",
    subtitle: "Тема: горизонты, обучение и свобода",
    essence: "Солнце входит в знак Стрельца. В западной астрологической символике это переход от концентрации на глубинных вопросах к поиску перспективы, движения и смысла.",
    meaning: "Хороший момент для стратегического взгляда: какие направления стоит изучить, где пора расширить навыки и какие планы нуждаются в проверке реальностью. Энтузиазм лучше соединять с конкретными расчётами.",
    workAndMoney: "Можно составить план обучения, изучить новый рынок и проверить гипотезу на небольшом пилотном проекте. Крупные вложения не должны основываться на вдохновении или положении Солнца.",
    relationships: "Разговор о будущем, путешествиях и личной свободе может быть полезнее обсуждения мелких повседневных разногласий. Уважай различия в целях.",
    usefulActions: ["Выбери один навык, который расширит возможности.", "Запланируй небольшой проверяемый эксперимент.", "Сформулируй цель на ближайший месяц."],
    caveat: "Это общий транзит по небу; индивидуальное влияние требует расчётов натальной карты."
  },
  {
    id: "20261124-full-moon-gemini",
    atUTC: "2026-11-24T14:54:00Z",
    kind: "full_moon",
    body: "Moon",
    title: "Полнолуние в Близнецах",
    subtitle: "Тема: информация, итоги и диалог",
    essence: "Полнолуние приходится на знак Близнецов. В астрологии это символическая кульминация темы общения, информации, обучения и противопоставления деталей общей картине.",
    meaning: "Полезно взглянуть, каких сведений хватает для решения, а какие ещё требуют подтверждения. Не путай перегрузку новостями с объективной срочностью.",
    workAndMoney: "Проведи ревизию задач, заявок, аналитики и сроков. Данные лучше перепроверять по первоисточникам; если решения требуют денег, считай бюджет и риски.",
    relationships: "Слушай и уточняй, вместо того чтобы делать выводы по одному сообщению. При избытке переписок можно сознательно ограничить уведомления.",
    usefulActions: ["Запиши три ключевых вывода за месяц.", "Закрой один незавершённый разговор или рабочий вопрос.", "Отложи эмоциональную реакцию, пока факты не проверены."],
    caveat: "Полнолуние не доказывает усиления тревожности или конфликтов и не предопределяет исход событий."
  },
  {
    id: "20261126-mars-virgo",
    atUTC: "2026-11-25T23:37:00Z",
    kind: "planet_sign_ingress",
    body: "Mars",
    title: "Марс переходит в Деву",
    subtitle: "Тема: эффективность, практика и детали",
    essence: "Марс входит в знак Девы. В астрологической традиции это связывают с направлением энергии на наведение порядка, диагностику ошибок, дисциплину и улучшение процессов.",
    meaning: "Вместо импульсивного рывка можно выбрать последовательное совершенствование системы. Обратная сторона символики — попытка контролировать каждую мелочь и перфекционизм.",
    workAndMoney: "Время для инвентаризации расходов, технического аудита, корректировки рабочих инструкций и тестирования. Улучшай качество того, что уже работает, прежде чем масштабироваться.",
    relationships: "Будь внимательнее к тону: просьба о конкретике не должна звучать как бесконечная критика. Разделяй реальную заботу и контроль.",
    usefulActions: ["Разбей большую задачу на небольшие проверяемые шаги.", "Отсортируй ошибки по критичности.", "Установи разумный предел времени на доработки."],
    caveat: "Марс в Деве не гарантирует рост продуктивности; это символическая рамка для планирования."
  }
];
export function monthEventsForDemo(year:number,monthZeroBased:number):readonly MonthlySkyEvent[]{
  return year===2026 && monthZeroBased===10 ? NOVEMBER_2026_EVENTS : [];
}
export const displayEventTime=(atUTC:string,timeZone:string,locale="ru-RU")=>
  new Intl.DateTimeFormat(locale,{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit",timeZone}).format(new Date(atUTC));
export function isValidEventTime(x:MonthlySkyEvent):boolean{
  return Number.isFinite(Date.parse(x.atUTC)) && !Number.isNaN(new Date(x.atUTC).getTime());
}


const tone = {"20261109-new-moon-scorpio":{"head":"НЕ ВСЁ, ЧТО МОЛЧИТ, НА САМОМ ДЕЛЕ ПРОШЛО","intro":"Кошки, Скорпион у нас не про театральные тайны и поиск подвоха в каждом сообщении. Он скорее про то, что мы давно чувствуем, но старательно откладываем на потом.","scene":"Знакомо? Ты говоришь «да всё нормально», а потом в голове ещё три часа споришь с человеком, который даже не знает, что участвует в конфликте. Вот в такие моменты честность с собой полезнее красивой маски.","good":"🔥 Посмотри, где ты соглашаешься из страха отказать. Раздели общие и личные расходы. Выбери один важный разговор без обвинений.","bad":"⛔ Не ищи скрытого врага там, где просто не хватило разговора. Не проверяй отношения и чужую лояльность манипуляциями.","finish":"С собой тоже можно разговаривать спокойно. Без драмы, без допроса. 🖤"},"20261113-mercury-direct":{"head":"МЕРКУРИЙ РАЗВОРАЧИВАЕТСЯ. НО ТЕЛЕФОН САМ НЕ ПОЧИНИТСЯ","intro":"Вот тут очень хочется объявить: всё, можно выдохнуть, теперь сообщения будут доходить и люди начнут слышать друг друга с первого раза. Было бы удобно, конечно. Но, девочки, нет.","scene":"Письмо не отправилось, реквизиты перепутали, собеседник решил, что «завтра» означает следующий месяц? Не нужно искать виноватую планету. Лучше спокойно проверить цепочку, где именно всё сломалось.","good":"🔥 Перечитай договорённости. Зафиксируй сроки письменно. Проверь банковские реквизиты, комиссии, историю заявок и подтверждения.","bad":"⛔ Не жми по десять раз одну и ту же кнопку в надежде на чудо. И не принимай красивое обещание вместо фактического решения.","finish":"Чёткие слова, нормальные проверки, конкретные шаги. Вот это мы любим. 🖤"},"20261114-venus-direct":{"head":"ХВАТИТ ДЕЛАТЬ ВИД, ЧТО ТЕБЕ ВСЁ РАВНО","intro":"Венера разворачивается, а вместе с ней очень хочется честнее посмотреть на свои желания. На любовь. На деньги. На то, сколько стоит твоё время и почему ты иногда так легко его раздаёшь.","scene":"Например, ты снова говоришь «мне ничего не нужно», хотя хочется заботы. Или соглашаешься на невыгодную работу, лишь бы не показаться неудобной. Знакомый сюжет?","good":"🔥 Назови свои реальные приоритеты. Посчитай расходы и цену своей работы. Если отношения важны, проговори ожидания без намёков.","bad":"⛔ Не трать деньги ради короткого ощущения, что ты себя побаловала. Не возвращайся в историю только потому, что стало скучно.","finish":"Твоя ценность не появляется после чьего-то одобрения. Помни об этом. 🖤"},"20261122-sun-sagittarius":{"head":"ХОЧЕТСЯ ВСЁ БРОСИТЬ И УЕХАТЬ? СНАЧАЛА ПОСЧИТАЕМ","intro":"Солнце переходит в Стрелец, и атмосфера символически становится более про свободу, путешествия, обучение и большие планы. В голове уже пять новых жизней, три города и проект на миллион.","scene":"Идея может быть чудесной. А потом выясняется, что билет куплен, жильё не проверено, бюджет примерно из разряда «там разберёмся». Так вот: мечтать можно широко, а считать лучше трезво.","good":"🔥 Выбери один новый навык. Проверь условия поездки или проекта. Разбей большую цель на первый реальный шаг.","bad":"⛔ Не обещай всем и сразу то, что ещё не успела проверить. Не путай желание перемен с готовностью к ним.","finish":"Большие горизонты никуда не убегут. Спокойно собираем свой маршрут. 🖤"},"20261124-full-moon-gemini":{"head":"ДЕСЯТЬ ЧАТОВ, ПЯТЬ ВЕРСИЙ ПРАВДЫ И ОДНА ТВОЯ ГОЛОВА","intro":"Полнолуние в Близнецах в астрологической традиции подсвечивает тему информации, разговоров и выводов. Иногда кажется, что нужно прочитать всё, ответить всем и немедленно решить каждый вопрос.","scene":"Один человек написал «ок», второй не поставил смайлик, третий прислал голосовое на семь минут. И вот ты уже собираешь целое расследование. А может, сначала спросить прямо?","good":"🔥 Подведи итоги. Сверь факты. Закрой одну важную переписку или задачу. Запиши, что действительно известно.","bad":"⛔ Не делай выводы по чужой интонации в тексте. Не пересылай неподтверждённые слухи. Не принимай финансовые решения на пике раздражения.","finish":"Не каждая мысль требует немедленного ответа. Берегите свои головы, красивые. 🖤"},"20261126-mars-virgo":{"head":"ХОЧЕШЬ ИДЕАЛЬНО? ДЛЯ НАЧАЛА СДЕЛАЙ РАБОЧЕЕ","intro":"Марс входит в Деву, и здесь очень узнаваемая тема: порядок, процессы, детали и желание срочно улучшить вообще всё. Даже то, что спокойно работало до нашего внезапного вдохновения.","scene":"Открыла одну настройку, а через час уже меняешь всю систему. Знакомо? Перфекционизм умеет притворяться продуктивностью, но дедлайны на это не подписывались.","good":"🔥 Исправь одну конкретную ошибку. Проверь цифры и инструкции. Составь список из трёх приоритетов, а не из пятидесяти.","bad":"⛔ Не превращай заботу в бесконечные замечания. Не переделывай всё сразу и не ругай себя за человеческие темпы.","finish":"Устойчивый результат обычно выглядит скучнее идеальной картинки. Зато работает. 🖤"}};
const overview = {"head":"НОЯБРЬ: КОГДА ХОЧЕТСЯ ВСЁ ПЕРЕСОБРАТЬ","intro":"Мои хорошие, в этом месяце у нас сразу несколько разворотов планет, новолуние, полнолуние и смена знаков. В астрологическом языке это словно просьба навести ясность в старых делах и выбрать направление дальше. Но давайте без сказок, будто одна дата решит всё за нас.","scene":"В работе проверяем документы, сроки и условия. В отношениях говорим прямо. В деньгах выбираем цифры вместо импульса. В планах оставляем место и мечтам, и реальной смете.","end":"И самое главное: это общий символический календарь. То, как событие связано с конкретным человеком, определяется отдельным расчётом его натальной карты. 🖤"};
const styles = "\n:root{color-scheme:dark;--bg:#120e16;--card:#2e202e;--txt:#f8e8e1;--muted:#ccb8c0;--peach:#eec3af;--gold:#caa88c;--line:rgba(241,198,173,.19)}*{box-sizing:border-box}\nhtml{scroll-behavior:smooth}body{margin:0;background:radial-gradient(ellipse at 15% 10%,#352230,transparent 45%),var(--bg);color:var(--txt);font:400 14px/1.7 system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}\nbutton,select{font:inherit}button{cursor:pointer}button:focus-visible,summary:focus-visible,select:focus-visible{outline:2px solid #ffe0bd;outline-offset:4px}main{max-width:860px;margin:auto;padding:25px 18px 70px}\nnav{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding:9px 0 20px;gap:16px}.logo{font-size:15px;font-weight:900;letter-spacing:.2em;color:#f6e5dc}.logo span{color:var(--peach)}.logonote{font-size:9px;letter-spacing:.17em;color:var(--gold)}\n.hero{position:relative;isolation:isolate;overflow:hidden;margin:20px 0 18px;border:1px solid rgba(242,191,159,.37);border-radius:28px;padding:32px 24px 24px;min-height:270px;background:radial-gradient(circle at 79% 28%,rgba(224,168,138,.15),transparent 40%),linear-gradient(125deg,#422a3b,#241c2b)}\n.hero:before{content:\"\";position:absolute;right:-64px;top:-60px;width:260px;height:260px;border:1px solid rgba(243,193,154,.37);border-radius:50%;box-shadow:0 0 0 25px rgba(245,196,174,.05),0 0 0 57px rgba(245,196,174,.025);transform:scaleX(.76) rotate(-28deg)}.stars{position:absolute;inset:0;opacity:.46;pointer-events:none;background-image:radial-gradient(circle at 8% 14%,#ffe0bb 1px,transparent 2px),radial-gradient(circle at 41% 55%,#ffe0bb 1px,transparent 2px),radial-gradient(circle at 67% 36%,#ffe0bb 1px,transparent 2px)}\n.kicker{position:relative;color:#ddb9b0;font-size:10px;font-weight:800;letter-spacing:.17em}.hero h1{position:relative;font:500 clamp(50px,11vw,83px)/.93 Georgia,serif;letter-spacing:-.05em;max-width:570px;margin:22px 0}.hero h1 em{color:var(--peach);font-weight:400}.hero p{position:relative;color:#dec5ca;max-width:490px;font-size:12px}.hero .foot{position:relative;border-top:1px solid var(--line);padding-top:18px;font-size:9px;letter-spacing:.14em;color:#c4a8b0;margin-top:30px}\n.toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:16px 18px;border:1px solid var(--line);border-radius:16px;background:#261c28;margin-bottom:17px}.toolbar label{font-size:11px;color:#d5b7b8}.toolbar select{border:1px solid var(--line);background:#3d2b39;color:#fbe6d8;border-radius:9px;padding:8px;max-width:175px;font-size:11px}\n.overview,.retro,details{border-radius:20px;border:1px solid var(--line);background:linear-gradient(145deg,rgba(56,37,50,.95),rgba(36,27,40,.98));margin:14px 0;overflow:hidden}\n.overview{padding:23px}.eyebrow{font-size:10px;color:#e3bcb3;font-weight:800;letter-spacing:.13em}.overview h2{font:500 32px/1.09 Georgia,serif;letter-spacing:-.02em;margin:10px 0}.overview p{font-size:12px;color:#d7c1c4;line-height:1.8}\n.retro{padding:20px}.retro h2{font:500 28px/1.1 Georgia,serif;margin:8px 0 12px}.retro>p{font-size:12px;color:#d9bfc8;line-height:1.75}.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.chips span{border:1px solid rgba(241,198,173,.24);border-radius:99px;padding:5px 10px;font-size:10px;color:#e5bfb4;background:#2b202b}\n.event summary{list-style:none;display:flex;gap:13px;align-items:flex-start;padding:24px 22px;cursor:pointer}.event summary::-webkit-details-marker{display:none}.event[open] summary{padding-bottom:16px}.date{flex:0 0 84px;color:#e9b4a3;font-weight:850;font-size:11px;line-height:1.5}.event-title{flex:1;min-width:0}.event-title strong{display:block;font:500 24px/1.08 Georgia,serif;letter-spacing:-.02em}.event-title small{display:block;color:#c7aeb6;font-size:11px;margin-top:8px;line-height:1.5}.toggle{color:#e1aaaf;font-size:19px}.event[open] .toggle{transform:rotate(45deg)}.body{padding:0 22px 24px 119px;font-size:12px;color:#e3ced0}.hook{font-weight:900;line-height:1.4;font-size:14px;color:#f9dfcf;letter-spacing:.025em}.body p{line-height:1.85;margin:11px 0 16px}.section{margin:20px 0}.section h3{font-size:11px;color:#ebbdad;font-weight:850;letter-spacing:.06em;margin:0 0 7px}.section p{margin:0}.do,.dont{border-left:2px solid #e7bcad;padding:7px 0 7px 11px}.dont{border-color:#956f86}.closing{color:#f4c6b5;font-weight:700}.source{color:#ab97a3;font-size:10px;border-top:1px solid var(--line);padding-top:14px;margin-top:17px}.smallprint{color:#a998a7;font-size:11px;line-height:1.7;margin:25px 6px}\n@media(max-width:600px){main{padding:12px 11px 55px}.hero{padding:27px 20px 20px}.toolbar{align-items:stretch;flex-direction:column}.toolbar label{display:block}.toolbar select{max-width:none;width:100%}.event summary{padding:19px 14px;gap:9px}.event-title strong{font-size:21px}.date{flex-basis:68px;font-size:10px}.body{padding:0 15px 19px}.overview,.retro{padding:19px}.logo{font-size:13px}.logonote{font-size:8px}}\n@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}\n";
const safe=(v)=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const local=(z)=>new Intl.DateTimeFormat("ru-RU",{timeZone:z,day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date("2026-11-09T07:02:00Z"));
const formatUTC=(iso,z)=>new Intl.DateTimeFormat("ru-RU",{timeZone:z,day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(iso));
const content=(x)=>{
const t=tone[x.id],stamp=formatUTC(x.atUTC,"Asia/Ho_Chi_Minh");
return `<details class="event"><summary><span class="date" data-event-ts="${safe(x.atUTC)}">${safe(stamp)}</span><span class="event-title"><strong>${safe(x.title)}</strong><small>${safe(x.subtitle)}</small></span><span class="toggle" aria-hidden="true">＋</span></summary><div class="body"><div class="hook">${safe(t.head)}</div><p>${safe(t.intro)}</p><p>${safe(t.scene)}</p>
<div class="section"><h3>🪐 ЧТО ПРОИСХОДИТ</h3><p>${safe(x.essence)}</p></div>
<div class="section"><h3>💼 РАБОТА И ДЕНЬГИ</h3><p>${safe(x.workAndMoney)}</p></div>
<div class="section"><h3>💗 ОТНОШЕНИЯ</h3><p>${safe(x.relationships)}</p></div>
<div class="section do"><h3>ЧТО ДЕЛАТЬ</h3><p>${safe(t.good)}</p></div><div class="section dont"><h3>ЧЕГО НЕ ДЕЛАТЬ</h3><p>${safe(t.bad)}</p></div>
<p class="closing">${safe(t.finish)}</p><p class="source">${safe(x.caveat)}</p></div></details>`;
};
const page=()=>`<!doctype html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="theme-color" content="#120e16"/><title>ASTRODAY • Лиза • события ноября 2026</title><style>${styles}</style></head><body><main>
<nav><div class="logo">ASTRODAY<span>.</span> <span style="font-weight:500;letter-spacing:.02em">Лиза</span></div><div class="logonote">СОБЫТИЯ НОЯБРЯ 2026</div></nav>
<header class="hero"><div class="stars"></div><div class="kicker">АСТРОЛОГИЧЕСКИЙ КАЛЕНДАРЬ · НОЯБРЬ 2026</div><h1>ПРО НЕБО.<br/><em>ПО-ЧЕЛОВЕЧЕСКИ.</em></h1><p>Шесть важных астрологических событий. Не просто дата и название, а нормальный человеческий разбор: что это символизирует, где пригодится и чего не стоит накручивать.</p><div class="foot">С ЛЮБОВЬЮ К СМЫСЛУ И ЗДРАВОМУ СМЫСЛУ</div></header>
<div class="toolbar"><label for="timezone">🕒 Время всех событий</label><select id="timezone" aria-label="Часовой пояс"><option value="Asia/Ho_Chi_Minh">Вьетнам (UTC+7)</option><option value="Asia/Makassar">Бали (UTC+8)</option><option value="Europe/Moscow">Москва (UTC+3)</option></select></div>
<section class="overview"><div class="eyebrow">00 / ОБЩАЯ КАРТИНА</div><h2>${safe(overview.head)}</h2><p>${safe(overview.intro)}</p><p>${safe(overview.scene)}</p><p class="closing">${safe(overview.end)}</p></section>
<section class="retro"><div class="eyebrow">В НАЧАЛЕ МЕСЯЦА</div><h2>КТО ТАМ ОПЯТЬ РЕТРОГРАДНЫЙ?</h2><p>Меркурий и Венера завершают видимое обратное движение в середине ноября, а Сатурн, Уран и Нептун остаются ретроградными. Это не список виновников всех неудач. В языке астрологии Меркурий напоминает о переписках и документах, Венера — о чувствах и ценностях, Сатурн — о границах и ответственности, Уран — о переменах, Нептун — о мечтах и иллюзиях.</p><p>Хороший повод переосмыслить привычки, но на реальные платежи, договоры и технику планеты физически не «нажимают».</p><div class="chips"><span>☿ Меркурий</span><span>♀ Венера</span><span>♄ Сатурн</span><span>♅ Уран</span><span>♆ Нептун</span></div></section>
<div class="eyebrow" style="margin:24px 4px 11px">01–06 / ВСЕ СОБЫТИЯ МЕСЯЦА</div>${NOVEMBER_2026_EVENTS.map(content).join("")}
<footer class="smallprint">Тексты написаны в редакционной манере ASTRODAY: астрологическая символика не является научным прогнозом и не гарантирует событий. Для персональных домов, аспектов и точного воздействия нужна рассчитанная натальная карта пользователя. Время переведено из UTC; точные минуты могут расходиться на минуту между эфемеридами из-за округления. Источники: <a href="https://cafeastrology.com/this-month-astrology-november-2026/" style="color:#e7bba7">Cafe Astrology</a> и <a href="https://www.timeanddate.com/news/astronomy/moon-november-2026" style="color:#e7bba7">timeanddate</a>.</footer>
</main><script>
(function(){
const select=document.getElementById("timezone");
const format=(iso,zone)=>new Intl.DateTimeFormat("ru-RU",{timeZone:zone,day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(iso));
function update(){document.querySelectorAll("[data-event-ts]").forEach(el=>el.textContent=format(el.dataset.eventTs,select.value));}
select.addEventListener("change",update);
update();
})();
</script></body></html>`;
Bun.serve({port:Number(Bun.env.PORT||3000),fetch(request){
 const url=new URL(request.url);
 if(url.pathname==="/health")return Response.json({ok:true,version:"astroday-liza-monthly-20261121",events:NOVEMBER_2026_EVENTS.length});
 if(url.pathname==="/api/events/2026-11")return new Response(JSON.stringify({month:"2026-11",events:NOVEMBER_2026_EVENTS}),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
 if(url.pathname!=="/")return new Response("Not found",{status:404});
 return new Response(page(),{headers:{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=300","x-content-type-options":"nosniff","referrer-policy":"strict-origin-when-cross-origin"}});
}});