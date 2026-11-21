/**
 * ASTRODAY quality-polish 2.0 (2026-11-21)
 * Human-authored editorial: shorten repetitive daily text while preserving
 * verified astrological calculations, author full individual month narratives.
 * No AI/API calls. No events or natal houses invented.
 */
export const QUALITY_VERSION="astroday-liza-quality-v2-20261121";
const PERSONAL=new Set(["Sun","Moon","Mercury","Venus","Mars"]);
const LABEL={Sun:"Солнцу",Moon:"Луне",Mercury:"Меркурию",Venus:"Венере",Mars:"Марсу",
Jupiter:"Юпитеру",Saturn:"Сатурну",Uranus:"Урану",Neptune:"Нептуну",Pluto:"Плутону"};
const GENITIVE={Sun:"Солнца",Moon:"Луны",Mercury:"Меркурия",Venus:"Венеры",Mars:"Марса",Jupiter:"Юпитера",
Saturn:"Сатурна",Uranus:"Урана",Neptune:"Нептуна",Pluto:"Плутона"};
const ASPECT={conjunction:"соединение",trine:"трин",sextile:"секстиль",square:"квадрат",opposition:"оппозиция"};
const ASPECT_ACTION={
 conjunction:"Обрати внимание, где две темы пересекаются, и выбери осознанное решение.",
 trine:"Используй спокойный момент для дела, которое давно хотелось завершить.",
 sextile:"Подходящий повод самой сделать небольшой шаг, а не ждать идеального случая.",
 square:"При напряжении не спеши с выводами. Сначала разберись, что именно тебя задело.",
 opposition:"Важен баланс: посмотри на своё желание и обстоятельства со стороны."
};
const NATAL_TOPIC={
 Sun:"свои цели, уверенность и право выбирать",
 Moon:"эмоциональную безопасность, привычки и заботу о себе",
 Mercury:"разговоры, информацию и ясность договорённостей",
 Venus:"взаимность, приятные занятия и то, что для тебя ценно",
 Mars:"инициативу, границы и способ действовать",
 Jupiter:"обучение, возможности и долгосрочные планы",
 Saturn:"ответственность, сроки и устойчивость",
 Uranus:"свободу, перемены и свежий взгляд",
 Neptune:"мечты, вдохновение и проверку иллюзий",
 Pluto:"внутренние перемены и потребность всё контролировать"
};
const THEME={
 self:{hook:"ТЕБЯ ТОЖЕ НУЖНО ВКЛЮЧИТЬ В СВОИ ПЛАНЫ",focus:"В центре внимания — твой ритм, желания и границы. Слишком легко раздать день чужим просьбам, а потом удивляться, почему на себя опять ничего не осталось.",
 practical:"Выдели время на задачу, которую ты выбрала сама. Важное решение не обязано нравиться всем.",
 heart:"Присмотрись, где ты молчишь ради удобства других. Спокойное «мне так подходит» — уже хорошее начало.",
 action:["Начни день с одного собственного приоритета.","Отмени ненужное обещание без долгих оправданий.","Оставь в расписании время без чужих задач."],
 avoid:"Не путай чужую оценку с собственной ценностью."},
 money:{hook:"ДЕНЬГИ ЛЮБЯТ ЯСНОСТЬ, А НЕ ГАДАНИЕ НА ЧЕКЕ",focus:"Тема ресурса и устойчивости просится в понятные цифры. Не надо срочно менять всю жизнь: иногда достаточно открыть расходы и увидеть, что происходит на самом деле.",
 practical:"Проверь суммы, комиссии и условия договоров. Если планируешь покупку, отдели необходимость от желания себя успокоить.",
 heart:"Деньги не должны становиться единственным способом доказать близость или благодарность.",
 action:["Сверь регулярные платежи и комиссии.","Определи один финансовый приоритет.","Оставь паузу перед необязательной покупкой."],
 avoid:"Не обещай чужим людям доступ к своему бюджету из неловкости."},
 communication:{hook:"СНАЧАЛА СПРОСИ. ПОТОМ ПРИДУМЫВАЙ СЮЖЕТ",focus:"Период подсвечивает разговоры, документы, короткие поездки и обучение. Тот самый случай, когда одна уточняющая фраза полезнее трёх часов мысленного диалога.",
 practical:"Проверяй сроки и записи, задавай конкретные вопросы, фиксируй договорённости письменно.",
 heart:"Если что-то тревожит, не проверяй другого человека молчанием. Скажи, что для тебя важно.",
 action:["Закрой один незавершённый разговор.","Перечитай условия перед согласием.","Выдели время на маленькую учебную задачу."],
 avoid:"Не считай отсутствие смайлика доказательством чужих намерений."},
 home:{hook:"НЕ ВСЕ ВАЖНЫЕ ДЕЛА ПРОИСХОДЯТ СНАРУЖИ",focus:"Дом, близкие и внутреннее чувство опоры могут оказаться важнее гонки за внешним впечатлением. Здесь нет нужды делать вид, что всё идеально.",
 practical:"Разбери одну бытовую мелочь, которая давно раздражает. Уют — это не обязательно идеальная квартира.",
 heart:"Если хочется близости, начни с простого разговора. И не бери на себя чужое настроение целиком.",
 action:["Приведи в порядок небольшой уголок дома.","Запланируй спокойный вечер.","Уточни семейную договорённость без претензий."],
 avoid:"Не превращай отдых в соревнование по продуктивности."},
 love:{hook:"РОМАНТИКА НЕ ОБЯЗАНА ЖДАТЬ ЧУЖОГО ЗВОНКА",focus:"Период можно прожить через удовольствие, творчество и честный разговор о том, чего хочется. Сильная тема — вернуть себе право радоваться без внешнего разрешения.",
 practical:"Оставь место для увлечений и красивых маленьких планов. Если работа забрала всё время, внеси радость в расписание первой.",
 heart:"Подумай, какие отношения подходят тебе. Можно устроить свидание, уделить внимание детям, если они есть, или придумать приятное событие самой.",
 action:["Спланируй свидание или маленький праздник себе.","Вернись к творческому занятию.","Спроси себя, что даёт ощущение взаимности."],
 avoid:"Не принимай красивый жест за гарантию будущего."},
 routine:{hook:"СДЕЛАТЬ РАБОЧЕЕ ЛУЧШЕ, ЧЕМ БЕСКОНЕЧНО ИДЕАЛЬНОЕ",focus:"Повседневный ритм и привычки помогают увидеть, что действительно работает. Не всё требует подвигов, иногда достаточно меньше хаоса.",
 practical:"Оставь три главные задачи, а не тридцать. Проверь процессы и запланируй восстановление.",
 heart:"Не превращай заботу о близких в режим контроля. Просьбы и договорённости работают лучше замечаний.",
 action:["Убери одну ненужную задачу.","Выдели время на нормальный перерыв.","Приведи в порядок один повторяющийся процесс."],
 avoid:"Не наказывай себя за живой, а не идеальный темп."},
 partners:{hook:"ДОГОВОРИТЬСЯ ПРОЩЕ, ЧЕМ ЧИТАТЬ ЧУЖИЕ МЫСЛИ",focus:"Партнёрство становится удобной темой для вопросов о взаимности, условиях и честных ожиданиях. Звучит не очень волшебно, зато работает.",
 practical:"Уточни роли и сроки в совместной работе. Всё, что касается общих денег, лучше зафиксировать.",
 heart:"Обсуди формат отношений прямо. Не обязательно угадывать, что означает пауза в чате.",
 action:["Скажи вслух одно важное ожидание.","Проверь честность совместного плана.","Оставь человеку пространство для ответа."],
 avoid:"Не устраивай молчаливые проверки на любовь."},
 depth:{hook:"СЛОЖНЫЙ РАЗГОВОР НЕ ОБЯЗАТЕЛЬНО ДЕЛАТЬ ДРАМОЙ",focus:"Совместные ресурсы, доверие и личные границы требуют взрослого отношения. Не всё неприятное является угрозой: иногда это просто давно отложенный вопрос.",
 practical:"Посмотри на общие расходы, доступы и договорённости. Особенно важно отделять реальные обязательства от эмоционального напряжения.",
 heart:"Не нужно пытаться контролировать другого, чтобы почувствовать безопасность. Лучше назвать свой страх и границу.",
 action:["Уточни одну финансовую договорённость.","Отдели факты от догадок.","Проведи спокойный разговор о границах."],
 avoid:"Не делай резких решений из тревоги."},
 horizons:{hook:"ДАЛЬНИЕ ПЛАНЫ НУЖДАЮТСЯ В БЛИЖАЙШЕМ ШАГЕ",focus:"Тема обучения, дорог и развития звучит особенно интересно. Идея может быть большой, но первый шаг лучше делать достаточно маленьким, чтобы его проверить.",
 practical:"Собери информацию, рассчитай бюджет поездки или обучения. Не подписывайся на неясные условия ради вдохновения.",
 heart:"Обсуди, куда ты хочешь двигаться, и оставь близким право видеть будущее немного иначе.",
 action:["Выбери новый навык для изучения.","Проверь стоимость и сроки будущей поездки.","Сделай один маленький эксперимент вместо грандиозной клятвы."],
 avoid:"Не путай импульс начать сначала с готовым планом."},
 career:{hook:"ТВОЙ РЕЗУЛЬТАТ ВАЖНЕЕ ЧУЖОГО ВПЕЧАТЛЕНИЯ",focus:"Карьера, обязательства и репутация — удобный повод понять, чего ты на самом деле хочешь добиться и какие условия для этого нужны.",
 practical:"Выбери критерий успеха, проверь сроки и рассчитай ресурсы. Разговаривай об оплате и объёме работы конкретно.",
 heart:"Удели внимание тем, с кем можно говорить о планах, а не только о задачах и достижениях.",
 action:["Сформулируй одну профессиональную цель.","Уточни условия оплаты или сотрудничества.","Заверши важную рабочую задачу без переделывания мелочей."],
 avoid:"Не делай из одной ошибки вывод о своей ценности."},
 friends:{hook:"НЕ ВСЕ ЛЮДИ ДОЛЖНЫ ИДТИ С ТОБОЙ ОДНИМ МАРШРУТОМ",focus:"Друзья, сообщества и совместные идеи становятся хорошей темой для внимания. Важнее не количество контактов, а ощущение, что рядом можно оставаться собой.",
 practical:"Обсуди одну идею с подходящим человеком. Если это рабочая команда, сразу уточните роли.",
 heart:"Поддерживай связь с теми, рядом с кем спокойно. Не соглашайся на планы только из страха выпасть из компании.",
 action:["Напиши человеку, с которым интересно общаться.","Проверь одну командную договорённость.","Запиши идею для будущего проекта."],
 avoid:"Не берись спасать чужие обязательства."},
 inner:{hook:"НА МИНУТУ УБЕРИ ШУМ. СЕБЯ ПОСЛЫШНЕЕ",focus:"Здесь важны тишина, сон, восстановление и честное отношение к собственным силам. Не всё должно превращаться в очередной проект с дедлайном.",
 practical:"Убери лишние уведомления и снизь нагрузку, где это возможно. Отдых не нужно заслуживать.",
 heart:"Если разговор пока слишком эмоционален, можно вернуться к нему позже без чувства вины.",
 action:["Запланируй спокойную прогулку или вечер.","Отмени одну ненужную встречу.","Дай себе время без гаджетов."],
 avoid:"Не требуй от себя объяснить каждую эмоцию немедленно."}
};
const HOUSE_ACT={
 1:"оставь в календаре место для собственных желаний",
 2:"проверь бюджет и выбери спокойный способ поддержать себя",
 3:"задай один ясный вопрос и не додумывай за собеседника",
 4:"сделай дом уютнее и удели внимание близким",
 5:"порадуй себя, устрой свидание или займись творчеством",
 6:"упрости расписание и позаботься о собственном темпе",
 7:"обсуди ожидания и договорись о конкретном шаге",
 8:"проясни общие финансовые условия и личные границы",
 9:"узнай что-то новое и проверь детали большого плана",
 10:"сосредоточься на одном профессиональном результате",
 11:"свяжись с людьми, с которыми хочется строить общее",
 12:"оставь время для тишины, сна и восстановления"
};
const FINISH=[
"Береги силы. Не всё важное обязано происходить на максимальной скорости. 🖤",
"И да, сегодняшние решения принимаешь ты, не календарь. 😌",
"Красивые планы — это приятно. Понятные шаги — ещё приятнее. 🖤",
"Тебе не нужно сдавать экзамен на идеальный день. Достаточно своего темпа.",
"Не делай из маленькой паузы большую драму. Иногда это просто пауза. 😅",
"Пускай у сегодняшнего дня будет хоть одна хорошая вещь, выбранная тобой.",
"Не торопись объяснять другим каждый свой выбор. Ты имеешь право подумать.",
"Если хочется всё срочно исправить, выбери для начала что-то одно. 🖤",
"Иногда забота о себе выглядит как обычное «нет, сегодня не успею».",
"Не все решения обязаны быть красивыми. Пусть они хотя бы будут твоими.",
"Нормально идти маленькими шагами. Они тоже считаются. 🤍",
"Береги свои нервы, а чужие мысли оставь их владельцам. 😌"
];
const ALT_ACTION={
 Sun:["Сверь планы со своими желаниями, а не с чужой оценкой.","Найди дело, которое укрепляет уверенность без необходимости кому-то доказывать правоту."],
 Moon:["Назови чувство, которое сейчас важнее всего, и придумай простой способ поддержки.","Не требуй от себя немедленной реакции. Можно сначала отдохнуть."],
 Mercury:["Прежде чем отправить сообщение, перечитай формулировку и уточни сроки.","Запиши одну мысль, которую давно хотелось выразить спокойно."],
 Venus:["Оставь время для красоты, приятного общения или творчества.","Проверь, что ты выбираешь удовольствие для себя, а не ради чужого одобрения."],
 Mars:["Дай энергии понятный выход: движение, небольшая задача или честный разговор о границе.","Не превращай решительность в спор ради спора."]
};
const moonNATAL={
 Sun:"собственные цели и уверенность",
 Moon:"чувство безопасности и эмоциональные привычки",
 Mercury:"переписки, учебные вопросы и договорённости",
 Venus:"отношения, симпатии и личные ценности",
 Mars:"инициативу, действия и личные границы"
};
const TRIGGERS={conjunction:"особенно заметной",trine:"более спокойной",sextile:"удобной для маленького шага",square:"требующей внимательного разговора",opposition:"связанной с поиском баланса"};
const sanitize=s=>String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const parse=v=>{try{return typeof v==="string"?JSON.parse(v):v||{}}catch{return {}}};
const hash=s=>{let x=2166136261;for(const c of String(s)){x=Math.imul(x^c.charCodeAt(0),16777619)}return x>>>0};
const pick=(arr,seed)=>arr[seed%arr.length];
const dateRu=s=>new Intl.DateTimeFormat("ru-RU",{timeZone:"UTC",day:"numeric",month:"long"}).format(new Date(s+"T12:00:00Z"));
const safeHouse=calc=>calc?.houseKnown===true&&Number.isInteger(Number(calc?.transitingMoon?.natalHouse))&&Number(calc.transitingMoon.natalHouse)>=1&&Number(calc.transitingMoon.natalHouse)<=12?Number(calc.transitingMoon.natalHouse):null;
const validAspect=(a,f,limit=4)=>a?.scope==="transit_natal"&&LABEL[a.transit]&&LABEL[a.natal]&&ASPECT[a.aspect]&&Number.isFinite(Number(a.orbDeg))&&a.orbDeg!==null&&Number(a.orbDeg)<=limit&&Number(a.orbDeg)>=0&&!(a.natal==="Moon"&&f.natalMoonReliable!==true);
const moonContacts=(f,day)=>(f?.dayExactContacts?.personalExact||[]).filter(c=>c?.transit==="Moon"&&PERSONAL.has(c.natal)&&ASPECT[c.aspect]&&
 (c.natal!=="Moon"||f.natalMoonReliable===true)&&typeof c.at?.local==="string"&&c.at.local.startsWith(day)).sort((a,b)=>a.at.local.localeCompare(b.at.local));
const wordCount=s=>String(s||"").replace(/<[^>]+>/g,"").trim().split(/\s+/).filter(Boolean).length;
export function polishDaily(row){
 const old=String(row.body_html||""),f=row.facts||{},v=parse(row.validation),day=row.day||row.forecast_date;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||f.day!==day||!old.includes("💫 <b>Как прожить этот день</b>"))throw Error("daily_source_unexpected");
 if(old.includes("QUALITY_REVIEW_V2"))return {html:old,meta:{already:true}};
 const key=v.primaryDomain&&THEME[v.primaryDomain]?v.primaryDomain:"self",theme=THEME[key];
 const seed=hash(day+String(row.profile_fp||"")+key),h=safeHouse(f);
 let html=old;
 // Replace a universal 5-paragraph footer with personalized, limited advice.
 html=html.slice(0,html.indexOf("\n\n💫 <b>Как прожить этот день</b>"));
 // Unsupported lunar claims about outer *natal* planets do not belong to the user-requested 5-planet Moon block.
 html=html.split("\n").filter(line=>!(/точный аспект Луны\s*—/.test(line))).join("\n");
 // Remove negative void-of-course blocks, which add noise to a daily horoscope.
 html=html.replace(/\n\n🌙 <b>Луна без курса<\/b>\nНа эту дату по твоему местному времени таких промежутков нет\./g,"");
 // Fix grammatical construction in two possible aspect paragraphs.
 html=html.replaceAll("В астрологической символике это связывают с темой ","Если читать аспект символически, он предлагает обратить внимание на ");
 // No duplicate claims about lunar house when a full house interpretation follows.
 if(h&&html.includes("🌙 <b>ЛУНА В ТВОЁМ ДНЕ</b>")){
  html=html.replace(/(В середине дня по твоему времени Луна в [^.]+\.) В твоей карте это \d+-й дом\. Его тема — [^.]+\./g,"$1");
 }
 const exact=moonContacts(f,day).slice(0,2);
 // One or two source-calculated exact personal contacts, if any.
 if(exact.length){
  const lines=exact.map(c=>"• "+c.at.local.slice(11,16)+" по местному времени: "+ASPECT[c.aspect]+" транзитной Луны к натальному "+LABEL[c.natal]+".");
  const text=lines.join("\n")+" Эти контакты можно использовать как подсказку обратить внимание на "+moonNATAL[exact[0].natal]+".";
  const needle="\n\n<b>ЧТО ВАЖНО</b>";
  if(!html.includes(needle))throw Error("daily_missing_marker");
  html=html.replace(needle,"\n\n🌙 <b>ЛУНА И ЛИЧНЫЕ ПЛАНЕТЫ</b>\n"+sanitize(text)+needle);
 }
 const action=pick(theme.action,seed+1);
 const hAction=h&&HOUSE_ACT[h]?HOUSE_ACT[h]:null;
 const moonAction=exact.length?pick(ALT_ACTION[exact[0].natal],seed>>3):null;
 const advice=[action];
 if(moonAction&&moonAction!==action)advice.push(moonAction);
 else if(hAction&&!action.toLowerCase().includes(hAction.slice(0,12)))advice.push("Если захочется, "+hAction+".");
 const closing=pick(FINISH,hash(day+String(row.profile_fp||"")+"ending"));
 html+="\n\n💫 <b>ПОПРОБУЙ СЕГОДНЯ</b>\n🔥 "+sanitize(advice.join("\n🔥 "))+"\n"+sanitize(closing);
 html=html.replace(/\n{3,}/g,"\n\n");
 const words=wordCount(html);
 if(words<120||words>370)throw Error("daily_word_limit_"+words);
 if(!f.houseKnown&&/(В твоей карте это \d+-й дом|Луна идёт по твоему \d+-му натальному дому)/i.test(html))throw Error("invented_house");
 for(const n of [1,2,3,4,5,6,7,8,9,10,11,12]){
  if(html.includes("Луна идёт по твоему "+n+"-му натальному дому")&&h!==n)throw Error("wrong_house_"+n);
 }
 for(const c of exact)if(!f.dayExactContacts.personalExact.some(x=>x===c))throw Error("unsupported_moon_contact");
 if(html.includes("Не нужно ждать идеального знака."))throw Error("repeated_footer");
 return {html,meta:{version:QUALITY_VERSION,day,domain:key,source:"preserved_stored_facts",house:h,moonContacts:exact.map(c=>({at:c.at.local,natal:c.natal,aspect:c.aspect})),words}};
}
function dailyKeyAspects(r){
 const f=r.facts||{},v=parse(r.validation),arr=[];
 const used=v.aspectsUsed||[];
 for(const tri of used){
  if(!Array.isArray(tri)||tri.length!==3)continue;
  const a=(f.activeAspects||[]).find(x=>[x.transit,x.aspect,x.natal].join(":")===tri.join(":"));
  if(a&&validAspect(a,f))arr.push(a);
 }
 // Explicitly exclude Moon for monthly outer-transit highlights; Moon gets its own area.
 return arr.filter(a=>a.transit!=="Moon");
}
const relevant=a=>(PERSONAL.has(a.natal)?4:0)+(PERSONAL.has(a.transit)?2:0)+(a.state==="applying"?1:0)-Math.min(4,Number(a.orbDeg))/2;
const distinctPeaks=(rows,howMany=4)=>{
 const all=[];
 for(const r of rows)for(const a of dailyKeyAspects(r))all.push({day:r.day||r.forecast_date,aspect:a,score:relevant(a)});
 all.sort((x,y)=>y.score-x.score||Number(x.aspect.orbDeg)-Number(y.aspect.orbDeg));
 const out=[],keys=new Set();
 for(const a of all){
  const k=a.aspect.transit+":"+a.aspect.aspect+":"+a.aspect.natal;
  if(keys.has(k)||out.some(x=>Math.abs((Date.parse(x.day)-Date.parse(a.day))/86400000)<5))continue;
  out.push(a);keys.add(k);if(out.length===howMany)break;
 }
 if(out.length<3)for(const a of all){const k=a.aspect.transit+":"+a.aspect.aspect+":"+a.aspect.natal;
  if(!keys.has(k)){out.push(a);keys.add(k);if(out.length===howMany)break;}
 }
 return out.sort((a,b)=>a.day.localeCompare(b.day));
};
const describeAspect=a=>{
 const title=GENITIVE[a.transit]+" в "+ASPECT[a.aspect]+"е с натальным "+GENITIVE[a.natal];
 return title.charAt(0).toUpperCase()+title.slice(1);
};
const pct=s=>Number(s).toFixed(1).replace(".",",");
const monthMoon=(rows,hKnown)=>{
 const out=[];
 for(const r of rows){
  const f=r.facts||{},day=r.day||r.forecast_date,house=safeHouse(f);
  const exact=moonContacts(f,day);
  if(hKnown&&house&&HOUSE_ACT[house])out.push({day,house,kind:"house",score:[5,7,2,10,4,11].includes(house)?3:1});
  else if(exact.length)out.push({day,contact:exact[0],kind:"aspect",score:3});
 }
 const chosen=[];
 for(const x of [...out].sort((a,b)=>b.score-a.score||a.day.localeCompare(b.day))){
  if(chosen.some(y=>Math.abs((Date.parse(y.day)-Date.parse(x.day))/86400000)<6))continue;
  if(x.kind==="house"&&chosen.some(y=>y.house===x.house))continue;
  chosen.push(x);if(chosen.length===2)break;
 }
 return chosen.sort((a,b)=>a.day.localeCompare(b.day));
};
const normalizeHTML=s=>s.replace(/\n{3,}/g,"\n\n");
export function polishMonthly(rows,{start="2026-11-21",end="2026-12-17"}={}){
 const kept=rows.filter(r=>(r.day||r.forecast_date)>=start&&(r.day||r.forecast_date)<=end)
  .sort((a,b)=>(a.day||a.forecast_date).localeCompare(b.day||b.forecast_date));
 if(kept.length!==27)throw Error("month_not_27_days");
 for(const r of kept)if((r.facts||{}).day!==(r.day||r.forecast_date))throw Error("monthly_bad_day");
 const seed=hash((kept[0].profile_fp||"")+start),counts=new Map();
 for(const r of kept){const k=parse(r.validation).primaryDomain||"self";if(THEME[k])counts.set(k,(counts.get(k)||0)+1);}
 const order=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
 const mainKey=order[0]?.[0]||"self",secondKey=order.find(x=>x[0]!==mainKey)?.[0]||"home";
 const main=THEME[mainKey],second=THEME[secondKey];
 const peaks=distinctPeaks(kept,4);
 const houseKnown=kept.some(r=>r.facts?.houseKnown===true);
 const moons=monthMoon(kept,houseKnown);
 if(!peaks.length)throw Error("no_verified_aspects_in_month");
 const lines=[
 "✨ <b>ЛИЧНЫЙ ПРОГНОЗ НА "+sanitize(dateRu(start).toUpperCase())+" — "+sanitize(dateRu(end).toUpperCase())+"</b>",
 "<b>"+sanitize(main.hook)+"</b>\n"+sanitize(main.focus),
 "<b>ПОЧЕМУ ЭТА ТЕМА ВАЖНА</b>\n"+sanitize("В расчётах этого периода чаще других поднимаются вопросы: "+mainKey.replaceAll("_"," ")+" и "+secondKey.replaceAll("_"," ")+". Не воспринимай это как гарантию события. Лучше посмотреть, что ты сама можешь выбрать и изменить. ")+sanitize(second.focus),
 "<b>ДАТЫ, НА КОТОРЫЕ МОЖНО ОБРАТИТЬ ВНИМАНИЕ</b>"
 ];
 for(const a of peaks){
 const v=a.aspect;
 lines.push("• <b>"+sanitize(dateRu(a.day))+"</b>. "+sanitize(describeAspect(v))+" (орб "+pct(v.orbDeg)+"° в дневном расчёте). "+sanitize("В астрологической символике это про "+NATAL_TOPIC[v.natal]+". "+ASPECT_ACTION[v.aspect]));
 }
 if(moons.length){
  lines.push("🌙 <b>ЛУНА: ДВЕ ПЕРСОНАЛЬНЫЕ ПОДСКАЗКИ</b>");
  for(const x of moons){
   if(x.kind==="house")lines.push("• <b>"+sanitize(dateRu(x.day))+"</b>: около полудня Луна в твоём "+x.house+"-м натальном доме. Можно "+sanitize(HOUSE_ACT[x.house])+".");
   else lines.push("• <b>"+sanitize(dateRu(x.day))+"</b>: транзитная Луна образует "+ASPECT[x.contact.aspect]+" к натальному "+LABEL[x.contact.natal]+". Это символическая тема про "+sanitize(moonNATAL[x.contact.natal])+".");
  }
 }else lines.push("🌙 <b>ЛУНА БЕЗ ВЫДУМАННЫХ ДОМОВ</b>\nВремя рождения не подтверждено, поэтому натальные дома не называю. Для ориентира оставь лунные сутки и только те аспекты, которые рассчитаны надёжно.");
 const inspired=peaks.some(p=>p.aspect.natal==="Venus")||mainKey==="love"||secondKey==="love"||moons.some(x=>x.house===5||x.house===7);
 const business=peaks.some(p=>["Mercury","Sun","Saturn","Jupiter"].includes(p.aspect.natal))||["career","money","routine","horizons"].includes(mainKey);
 const label=inspired?"ОТНОШЕНИЯ И БЛИЗОСТЬ":"ЛИЧНЫЕ ГРАНИЦЫ";
 const heart=inspired?main.heart+" "+(THEME.love.heart):main.heart+" "+second.heart;
 const work=business?main.practical+" "+THEME.career.practical:main.practical+" "+second.practical;
 lines.push("<b>РАБОТА, ДЕНЬГИ И РЕАЛЬНЫЕ ПЛАНЫ</b>\n"+sanitize(work));
 lines.push("<b>"+label+"</b>\n"+sanitize(heart));
 const actions=[...main.action,...second.action].filter((x,i,arr)=>arr.indexOf(x)===i);
 const pick3=[actions[seed%actions.length],actions[(seed+2)%actions.length],actions[(seed+4)%actions.length]];
 lines.push("<b>🔥 ТРИ ДЕЙСТВИЯ НА ПЕРИОД</b>\n"+sanitize(pick3.map((x,i)=>(i+1)+". "+x).join("\n")));
 lines.push("<b>⛔ ЧТО ЛУЧШЕ НЕ ДЕЛАТЬ</b>\n"+sanitize(main.avoid+" "+second.avoid));
 lines.push(sanitize(pick(FINISH,seed>>2)));
 lines.push("<i>Это авторский разбор символики по сохранённым астрологическим расчётам. Даты аспектов приведены по дневным данным и не являются обещанием событий. Финансовые и личные решения проверяй по реальным обстоятельствам.</i>");
 const html=normalizeHTML(lines.join("\n\n"));
 const words=wordCount(html);
 if(words<285||words>650)throw Error("monthly_word_limit_"+words);
 if(!houseKnown&&/Луна в твоём \d+-м натальном доме/.test(html))throw Error("invented_month_house");
 return {html,meta:{version:QUALITY_VERSION,start,end,days:kept.length,theme:mainKey,secondary:secondKey,aspects:peaks.map(x=>({day:x.day,transit:x.aspect.transit,natal:x.aspect.natal,aspect:x.aspect.aspect,orbDeg:x.aspect.orbDeg})),moon:moons.map(x=>({day:x.day,house:x.house||null,natal:x.contact?.natal||null})),words,source:"stored_natal_ephemeris_plus_human_editorial"}};
}
