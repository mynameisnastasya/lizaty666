import React, {useEffect, useMemo, useState} from "react";
import {ArrowLeft, ArrowRight, Bell, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, Compass, Copy, ExternalLink, Heart, LockKeyhole, Moon, Settings2, ShieldCheck, Sparkles, Sun, UserRound} from "lucide-react";
import s from "./astroday-design.module.css";
import {JieCaiExperience} from "../components/JieCaiExperience";

type Tab="day"|"calendar"|"chart"|"profile"|"access";
const menu:{id:Tab,label:string,icon:typeof Sun}[]=[
  {id:"day",label:"Мой день",icon:Sun},
  {id:"calendar",label:"Календарь",icon:CalendarDays},
  {id:"chart",label:"Моя карта",icon:Compass},
  {id:"profile",label:"Профиль",icon:UserRound},
  {id:"access",label:"Доступ",icon:Sparkles}
];
const labels=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const glyphs=["☉","☽","☿","♀","♂","♃","♄"];
const planets=[
  {name:"Солнце",sign:"Овен",degree:"11°",glyph:"☉",angle:29},
  {name:"Луна",sign:"Стрелец",degree:"24°",glyph:"☽",angle:163},
  {name:"Меркурий",sign:"Овен",degree:"6°",glyph:"☿",angle:51},
  {name:"Венера",sign:"Телец",degree:"19°",glyph:"♀",angle:302},
  {name:"Марс",sign:"Телец",degree:"8°",glyph:"♂",angle:278},
  {name:"Юпитер",sign:"Рак",degree:"10°",glyph:"♃",angle:214},
  {name:"Сатурн",sign:"Близнецы",degree:"11°",glyph:"♄",angle:245}
];
const seed="Не прячь просьбу за «без разницы»";
const forecast="Анна, сегодня полезно назвать свои пожелания прямо. Если тебе удобнее другой маршрут, время или способ договориться, это нормально. Можно быть мягкой и при этом говорить конкретно.\n\nЛуна в Овне подчёркивает тему инициативы, а её контакт с Юпитером помогает посмотреть на баланс между личной свободой и общими ресурсами. Не обязательно решать всё одним разговором.\n\nВ делах выбирай то, что реально зависит от тебя. В отношениях не пытайся угадывать чужие мысли. Самое полезное действие дня: сформулировать одну просьбу, которую давно откладывала.";
const formatDate=(y:number,m:number,d:number)=>new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(y,m,d)));
const isoDay=(y:number,m:number,d:number)=>y+"-"+String(m+1).padStart(2,"0")+"-"+String(d).padStart(2,"0");
const monthName=(y:number,m:number)=>new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(y,m,1)));
function NumberDot({num}:{num:number}){return <span className={s.numberDot}>{String(num).padStart(2,"0")}</span>}

function Orbit({large=false}:{large?:boolean}){
  return <svg className={large?s.orbitBig:s.orbit} viewBox="0 0 260 180" aria-hidden="true"><ellipse cx="166" cy="95" rx="128" ry="53" fill="none" stroke="currentColor" strokeWidth="1" transform="rotate(-25 166 95)"/><ellipse cx="166" cy="95" rx="105" ry="40" fill="none" stroke="currentColor" strokeWidth=".6" transform="rotate(-25 166 95)"/><circle cx="163" cy="89" r="6" fill="#efc0ae"/><circle cx="163" cy="89" r="17" fill="#efc0ae" fillOpacity=".09"/></svg>
}
function AstroWheel({active,onPick}:{active:number,onPick:(i:number)=>void}){
  const angles=Array.from({length:12},(_,i)=>i*30-90);
  return <div className={s.wheelWrap}>
    <svg className={s.wheel} viewBox="0 0 340 340" role="img" aria-label="Схематическое колесо натальной карты: демонстрационная визуализация">
      <circle cx="170" cy="170" r="161" fill="#1e181f" stroke="#a47b83" strokeOpacity=".65"/>
      <circle cx="170" cy="170" r="132" fill="none" stroke="#ad8b8a" strokeOpacity=".55"/>
      <circle cx="170" cy="170" r="104" fill="none" stroke="#ad8b8a" strokeOpacity=".45"/>
      <circle cx="170" cy="170" r="67" fill="#181319" stroke="#ad8b8a" strokeOpacity=".45"/>
      {angles.map((a,i)=>{const r=a*Math.PI/180;return <line key={i} x1={170+132*Math.cos(r)} y1={170+132*Math.sin(r)} x2={170+161*Math.cos(r)} y2={170+161*Math.sin(r)} stroke="#b99194" strokeOpacity=".5"/>})}
      {["♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓"].map((glyph,i)=>{const a=(i*30-75)*Math.PI/180;return <text key={i} x={170+146*Math.cos(a)} y={174+146*Math.sin(a)} textAnchor="middle" fill="#d9b8af" fontSize="14">{glyph}</text>})}
      {planets.map((p,i)=>{const a=p.angle*Math.PI/180;return <g key={p.name} opacity={active===i?1:.75}><line x1="170" y1="170" x2={170+100*Math.cos(a)} y2={170+100*Math.sin(a)} stroke={active===i?"#f1bfaa":"#86636d"} strokeWidth={active===i?1.4:.7}/><circle cx={170+112*Math.cos(a)} cy={170+112*Math.sin(a)} r={active===i?15:12} fill={active===i?"#e7b39f":"#34242e"} stroke="#c99897" strokeWidth=".8"/><text x={170+112*Math.cos(a)} y={174+112*Math.sin(a)} textAnchor="middle" fill={active===i?"#311c24":"#f3e3de"} fontSize="17">{p.glyph}</text></g>})}
      <text x="170" y="165" textAnchor="middle" fill="#f2d6c9" fontSize="19" fontFamily="Georgia,serif">Натальная</text><text x="170" y="185" textAnchor="middle" fill="#b28f94" fontSize="12">карта</text>
    </svg>
    <div className={s.wheelHelp}>Демонстрационная схема. Позиции на колесе не являются расчётом.</div>
  </div>;
}
function CalendarPanel({onChoose}:{onChoose:(d:number)=>void}){
 const [ym,setYm]=useState({y:2026,m:10});
 const first=(new Date(Date.UTC(ym.y,ym.m,1)).getUTCDay()+6)%7;
 const count=new Date(Date.UTC(ym.y,ym.m+1,0)).getUTCDate();
 const cells=[...Array(first).fill(null),...Array.from({length:count},(_,i)=>i+1)];
 const change=(n:number)=>setYm(v=>{const d=new Date(Date.UTC(v.y,v.m+n,1));return {y:d.getUTCFullYear(),m:d.getUTCMonth()}});
 return <><section className={s.card}>
   <div className={s.cardLabel}><NumberDot num={1}/> ТВОЙ КАЛЕНДАРЬ</div>
   <div className={s.monthHead}><button aria-label="Предыдущий месяц" className={s.roundButton} onClick={()=>change(-1)}><ChevronLeft size={21}/></button><h2>{monthName(ym.y,ym.m)}</h2><button aria-label="Следующий месяц" className={s.roundButton} onClick={()=>change(1)}><ChevronRight size={21}/></button></div>
   <div className={s.weekdays}>{labels.map(x=><span key={x}>{x}</span>)}</div>
   <div className={s.calendarGrid}>{cells.map((d,i)=>{
     const available=ym.y===2026&&ym.m===10&&d!==null&&d>=17;
     const current=ym.y===2026&&ym.m===10&&d===21;
     return d===null?<span key={"x"+i}/>:
       <button key={i} className={[s.dayCell,current?s.todayCell:"",!available?s.lockedCell:""].join(" ")} disabled={!available} title={!available?"Нет доступа к дате":"Открыть дневной прогноз"} aria-label={formatDate(ym.y,ym.m,d)+(available?" — открыть":" — недоступно")} onClick={()=>onChoose(d)}>{d}{current&&<span className={s.todayMark}/>}</button>;
   })}</div>
   <div className={s.legend}><span><i className={s.legendCurrent}/> Сегодня</span><span><i className={s.legendAvailable}/> Доступно</span><span><i className={s.legendLocked}/> Закрыто</span></div>
  </section><section className={s.card}><div className={s.cardLabel}><NumberDot num={2}/> СОБЫТИЯ МЕСЯЦА</div><div className={s.event}><span>24 ноя</span><div><b>Полнолуние</b><p>Время и знак уточняются по расчётным данным.</p></div><Moon size={18}/></div><div className={s.event}><span>30 ноя</span><div><b>Обзор месяца</b><p>Выделить события, связанные с твоей картой.</p></div><Sparkles size={18}/></div></section></>;
}
function TodayPanel({selected,onCalendar,onWealth}:{selected:number,onCalendar:()=>void;onWealth:()=>void}){
 const [expanded,setExpanded]=useState(true);
 const [copied,setCopied]=useState(false);
 const display=selected===21;
 async function copy(){try{await navigator.clipboard.writeText(forecast);setCopied(true);setTimeout(()=>setCopied(false),1800)}catch{setCopied(false)}}
 return <><section className={s.hero}><div className={s.heroStars} aria-hidden="true"/><Orbit/><div className={s.overline}>СУББОТА · {selected} НОЯБРЯ 2026</div><h1>Мой день<span className={s.heroDot}>.</span></h1><p>Немного ясности для твоего сегодня.</p></section>
 <section className={s.summary}><div className={s.summaryTop}><span className={s.eyebrow}>ГЛАВНАЯ ТЕМА</span><span className={s.livePill}><span/> Доступ активен</span></div>
 <h2>{display?seed:"Твой прогноз на "+selected+" ноября"}</h2><div className={s.summaryGrid}><div><Moon size={16}/><span>Луна в Овне</span></div><div><Sparkles size={16}/><span>Тема дня · доверие</span></div></div>
 <button className={s.textLink} onClick={onCalendar}>Выбрать другую дату <ArrowRight size={15}/></button>
 </section>
 <button type="button" className={s.wealthShortcut} onClick={onWealth}><span className={s.wealthIcon}>劫</span><span><strong>Дни Грабителя богатства</strong><small>Твой личный календарь Ба-цзы</small></span><ArrowRight size={19}/></button>
 <section className={s.card}>
  <div className={s.cardLabel}><NumberDot num={1}/> ЛИЧНЫЙ ПРОГНОЗ <span className={s.demoTag}>ДЕМО</span></div>
  {display?<><h3>Не прячь просьбу за «без разницы»</h3>
  <div className={s.pullQuote}>«Договорённость начинается с ясного желания»</div>
  <button className={s.readToggle} aria-expanded={expanded} onClick={()=>setExpanded(x=>!x)}>{expanded?"Свернуть прогноз":"Читать полный прогноз"} <ChevronRight className={expanded?s.upChevron:""} size={18}/></button>
  {expanded&&<div className={s.forecastBody}>{forecast.split("\n\n").map((p,i)=><p key={i}>{p}</p>)}</div>}
  <div className={s.cardActions}><button className={s.ghostButton} onClick={copy}>{copied?<Check size={17}/>:<Copy size={17}/>} {copied?"Скопировано":"Скопировать"}</button><button className={s.ghostButton} onClick={onCalendar}><CalendarDays size={17}/> Календарь</button></div></>:<><h3>Прогноз на {selected} ноября</h3><p className={s.muted}>Это дизайнерский предпросмотр. Для других дней живой прогноз загружается из API только после подключения новой версии.</p><button className={s.primaryButton} onClick={onCalendar}>Вернуться к календарю <ArrowRight size={16}/></button></>}
 </section><div className={s.disclaimer}><ShieldCheck size={17}/><span>В рабочей версии каждый текст должен опираться на сохранённые расчётные факты. Эта страница показывает дизайн без обращения к личным данным.</span></div></>;
}
function ChartPanel(){
 const [active,setActive]=useState(0);
 return <><section className={s.hero}><div className={s.heroStars}/><Orbit/><div className={s.overline}>ТВОЯ ТОЧКА ОТСЧЁТА</div><h1>Моя карта<span className={s.heroDot}>.</span></h1><p>Не только знак зодиака. Целая система.</p></section><section className={s.card}><div className={s.cardLabel}><NumberDot num={1}/> НАТАЛЬНАЯ КАРТА <span className={s.demoTag}>ДЕМО</span></div><h2>Вселенная в деталях</h2><AstroWheel active={active} onPick={setActive}/><div className={s.planetChips}>{planets.map((p,i)=><button aria-pressed={active===i} className={active===i?s.planetActive:""} key={p.name} onClick={()=>setActive(i)}>{p.glyph} {p.name}</button>)}</div><div className={s.planetInfo}><span className={s.eyebrow}>ВЫБРАННАЯ ПЛАНЕТА</span><div><b>{planets[active].glyph} {planets[active].name}</b><span>{planets[active].sign} · {planets[active].degree}</span></div></div><p className={s.muted}>Положения в этом макете условные. В продукте данные должны поступать из астрологического движка с указанием метода домов и точного времени рождения.</p></section></>;
}
function ProfilePanel(){
 const [name,setName]=useState("Анна"),[zone,setZone]=useState("Asia/Ho_Chi_Minh"),[delivery,setDelivery]=useState("08:00"),[notify,setNotify]=useState(true),[saved,setSaved]=useState(false);
 return <><section className={s.hero}><div className={s.heroStars}/><Orbit/><div className={s.overline}>НАСТРОЙКИ ТВОЕГО РИТМА</div><h1>Профиль<span className={s.heroDot}>.</span></h1><p>Ты решаешь, когда приходить звёздам.</p></section><section className={s.card}><div className={s.cardLabel}><NumberDot num={1}/> ДАННЫЕ РОЖДЕНИЯ</div><div className={s.dataRow}><span>Имя</span><b>{name}</b></div><div className={s.dataRow}><span>Дата рождения</span><b>14 марта 2001</b></div><div className={s.dataRow}><span>Время рождения</span><b>08:25</b></div><div className={s.dataRow}><span>Место рождения</span><b>Красноярск</b></div><p className={s.helper}>Время и место рождения используются для расчётов и не изменяются автоматически при поездках.</p></section>
 <section className={s.card}><div className={s.cardLabel}><NumberDot num={2}/> ДОСТАВКА ПРОГНОЗА</div><label className={s.field}>Как к тебе обращаться<input value={name} onChange={e=>{setName(e.target.value);setSaved(false)}} maxLength={40}/></label><label className={s.field}>Текущий часовой пояс<select value={zone} onChange={e=>{setZone(e.target.value);setSaved(false)}}><option value="Asia/Ho_Chi_Minh">Дананг / Вьетнам (UTC+7)</option><option value="Asia/Makassar">Бали (UTC+8)</option><option value="Asia/Novokuznetsk">Кемерово (UTC+7)</option><option value="Europe/Moscow">Москва (UTC+3)</option></select></label><label className={s.field}>Время доставки<input type="time" value={delivery} onChange={e=>{setDelivery(e.target.value);setSaved(false)}}/></label><label className={s.toggleRow}><span><strong>Ежедневные сообщения</strong><small>Один прогноз по твоему времени</small></span><input type="checkbox" checked={notify} onChange={e=>{setNotify(e.target.checked);setSaved(false)}}/></label><button className={s.primaryButton} onClick={()=>setSaved(true)}><Check size={16}/> Сохранить настройки</button>{saved&&<div className={s.notice} role="status"><Check size={16}/> Настройки сохранены в этом предпросмотре. В реальном приложении сохранение выполняет API.</div>}</section></>;
}
function AccessPanel(){
 const [plan,setPlan]=useState("six");
 const plans=[{id:"one",title:"1 месяц",period:"Для знакомства",price:"1 666 ₽"},{id:"six",title:"6 месяцев",period:"Свой ритм",price:"3 666 ₽",tag:"ПОПУЛЯРНО"},{id:"year",title:"12 месяцев",period:"Полный цикл",price:"6 666 ₽"}];
 return <><section className={s.hero}><div className={s.heroStars}/><Orbit/><div className={s.overline}>ВСЁ В СВОЁ ВРЕМЯ</div><h1>Доступ<span className={s.heroDot}>.</span></h1><p>Персональный прогноз рядом с тобой.</p></section><section className={s.accessSummary}><div className={s.summaryTop}><span className={s.eyebrow}>ТВОЯ ПОДПИСКА</span><span className={s.livePill}><Check size={13}/> Активна</span></div><h2>Доступ до 17 декабря</h2><p>Прогнозы доступны каждый день. Рассылка работает по выбранному часовому поясу.</p><div className={s.progress}><div/></div><span className={s.progressCaption}>Демонстрационный период</span></section>
 <section className={s.card}><div className={s.cardLabel}><NumberDot num={2}/> ВЫБЕРИ ПРОДОЛЖЕНИЕ <span className={s.demoTag}>ДЕМО</span></div><div className={s.plans}>{plans.map(p=><button key={p.id} className={[s.plan,p.id===plan?s.planActive:""].join(" ")} aria-pressed={p.id===plan} onClick={()=>setPlan(p.id)}><span className={s.planSelect}>{p.id===plan?<Check size={14}/>:null}</span><span><strong>{p.title}</strong><small>{p.period}</small></span><span className={s.planPrice}>{p.tag&&<em>{p.tag}</em>}{p.price}</span></button>)}</div><div className={s.notice}><ShieldCheck size={16}/><span>Внутри Telegram цифровые услуги оплачиваются через Telegram Stars. Здесь деньги не списываются.</span></div><button className={s.primaryButton} disabled><LockKeyhole size={16}/> Оплата в демо отключена</button></section></>;
}
export default function AstrodayDesign(){
 const [tab,setTab]=useState<Tab>("day");
 const [selected,setSelected]=useState(21);
 const [info,setInfo]=useState(false);
 const [calendarMode,setCalendarMode]=useState<"month"|"wealth">("month");
 function go(t:Tab){setTab(t);try{window.scrollTo({top:0,behavior:"smooth"});document.querySelector("[data-astroday-scrollpane]")?.scrollTo({top:0,behavior:"smooth"});(window as any).Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch{}}
 useEffect(()=>{document.title="ASTRODAY · Новый дизайн · предпросмотр";const tg=(window as any).Telegram?.WebApp;tg?.ready?.();tg?.expand?.();tg?.setHeaderColor?.("#100d12");tg?.setBackgroundColor?.("#100d12");const update=()=>{const bottom=Number(tg?.contentSafeAreaInset?.bottom??tg?.safeAreaInset?.bottom??0);document.documentElement.style.setProperty("--astroday-tg-safe-bottom",Math.min(80,Math.max(0,bottom))+"px")};update();tg?.onEvent?.("safeAreaChanged",update);tg?.onEvent?.("contentSafeAreaChanged",update);return()=>{tg?.offEvent?.("safeAreaChanged",update);tg?.offEvent?.("contentSafeAreaChanged",update);document.documentElement.style.removeProperty("--astroday-tg-safe-bottom")}},[]);
 const current=menu.find(x=>x.id===tab)!;
 return <main className={s.root}><div className={s.shell}>
  <header className={s.topbar}><div className={s.brand}><span className={s.brandGlyph}>✦</span><span>ASTRODAY<strong>.</strong><small>ЛИЗА · ЛИЧНЫЙ КОСМОС</small></span></div><div className={s.topActions}><span className={s.previewPill}>ПРЕДПРОСМОТР 3.0</span><button className={s.roundButton} aria-label="О версии" onClick={()=>setInfo(x=>!x)}><CircleHelp size={19}/></button></div></header>
  {info&&<div className={s.infoBar} role="status">Дизайн-версия без подключения реальных персональных данных, платёжных списаний и Telegram-рассылок. Текущий бот не изменён.</div>}
  <div className={s.desktopGrid}><div className={s.desktopIntro}><div className={s.introLine}/><div className={s.eyebrow}>ТИШЕ, ЧЕМ ГОЛОС ЗВЁЗД</div><h2>Здесь начинается <i>твой</i> день.</h2><p>Астрология, в которой красота не мешает ясности. Личные прогнозы, настоящие расчёты, свой ритм.</p><div className={s.introBottom}>ASTRODAY 3.0 / ДИЗАЙН-КОНЦЕПЦИЯ</div></div>
  <div className={s.appPane}><div className={s.content} data-astroday-scrollpane="true">
   {tab==="day"&&<TodayPanel selected={selected} onCalendar={()=>{setCalendarMode("month");go("calendar")}} onWealth={()=>{setCalendarMode("wealth");go("calendar")}}/>}
   {tab==="calendar"&&<><div className={s.calendarSwitch} role="group" aria-label="Режим календаря"><button aria-pressed={calendarMode==="month"} onClick={()=>setCalendarMode("month")}><CalendarDays size={15}/> Мой месяц</button><button aria-pressed={calendarMode==="wealth"} onClick={()=>setCalendarMode("wealth")}><Sparkles size={15}/> Грабитель богатства</button></div>{calendarMode==="wealth"?<JieCaiExperience/>:<><section className={s.hero}><div className={s.heroStars}/><Orbit/><div className={s.overline}>ТВОЁ ВРЕМЯ · ТВОИ ДАТЫ</div><h1>Календарь<span className={s.heroDot}>.</span></h1><p>Личная карта времени на каждый день.</p></section><CalendarPanel onChoose={d=>{setSelected(d);go("day")}}/></>}</>}
   {tab==="chart"&&<ChartPanel/>}
   {tab==="profile"&&<ProfilePanel/>}
   {tab==="access"&&<AccessPanel/>}
  </div>
  <nav className={s.bottomNav} aria-label="Разделы ASTRODAY">{menu.map(({id,label,icon:Icon})=><button key={id} onClick={()=>go(id)} aria-current={tab===id?"page":undefined} className={tab===id?s.navActive:""}><Icon size={21} strokeWidth={1.7}/><span>{label}</span></button>)}</nav></div>
  </div>
 </div></main>;
}
