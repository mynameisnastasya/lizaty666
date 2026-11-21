import React,{useState} from "react";
import {ChevronDown,Clock3,Info,BriefcaseBusiness,Heart,Compass,ShieldCheck} from "lucide-react";
import {displayEventTime,monthEventsForDemo,type MonthlySkyEvent} from "../src/monthly-events";
import styles from "./MonthlySkyEvents.module.css";

type Props={year:number;monthZeroBased:number};
type SectionProps={icon:React.ReactNode;title:string;children:React.ReactNode};
function Section({icon,title,children}:SectionProps){
  return <section className={styles.detailSection}>
    <h4>{icon}{title}</h4>
    {children}
  </section>;
}
function Entry({event,timeZone}:{event:MonthlySkyEvent;timeZone:string}){
 const [open,setOpen]=useState(false);
 const bodyId="event-details-"+event.id;
 return <article className={styles.item}>
   <button type="button" className={styles.head} aria-expanded={open} aria-controls={bodyId} onClick={()=>setOpen(v=>!v)}>
     <span className={styles.date}>{displayEventTime(event.atUTC,timeZone)}</span>
     <span className={styles.heading}>
       <strong>{event.title}</strong>
       <small>{event.subtitle}</small>
     </span>
     <ChevronDown aria-hidden="true" size={19} className={open?styles.chevronOpen:styles.chevron}/>
   </button>
   {open&&<div id={bodyId} className={styles.content}>
     <p className={styles.summary}>{event.essence}</p>
     <Section icon={<Compass size={17}/>} title="Что это символизирует"><p>{event.meaning}</p></Section>
     <Section icon={<BriefcaseBusiness size={17}/>} title="Работа и деньги"><p>{event.workAndMoney}</p></Section>
     <Section icon={<Heart size={17}/>} title="Отношения и общение"><p>{event.relationships}</p></Section>
     <Section icon={<ShieldCheck size={17}/>} title="Что можно сделать"><ul>{event.usefulActions.map(action=><li key={action}>{action}</li>)}</ul></Section>
     <p className={styles.caveat}>{event.caveat}</p>
   </div>}
 </article>;
}
export function MonthlySkyEvents({year,monthZeroBased}:Props){
 const [timeZone,setTimeZone]=useState("Asia/Ho_Chi_Minh");
 const events=monthEventsForDemo(year,monthZeroBased);
 return <section className={styles.root} aria-label="Важные астрологические события месяца">
   <div className={styles.topline}>
     <div className={styles.titleBox}>
       <span className={styles.overline}>ЛУННЫЕ ФАЗЫ · СТАНЦИИ · ПЕРЕХОДЫ</span>
       <h3>Важные события месяца</h3>
       <p>Нажми на событие, чтобы прочитать подробный разбор.</p>
     </div>
     <span className={styles.icon}>✦</span>
   </div>
   <label className={styles.zoneRow}>
     <Clock3 size={15}/>
     <span>Время событий</span>
     <select value={timeZone} onChange={e=>setTimeZone(e.target.value)}>
       <option value="Asia/Ho_Chi_Minh">Вьетнам (UTC+7)</option>
       <option value="Asia/Makassar">Бали (UTC+8)</option>
       <option value="Europe/Moscow">Москва (UTC+3)</option>
     </select>
   </label>
   {year===2026&&monthZeroBased===10&&<div className={styles.retro}>
     <Info size={17}/>
     <div><strong>Ретроградные планеты в начале ноября</strong>
      <p>Меркурий, Венера, Сатурн, Уран и Нептун находились в видимом ретроградном движении. В астрологической традиции это общий символ пересмотра привычных стратегий. При этом у каждой планеты разные циклы и темы. Не следует считать ретроградность причиной сбоев или неудач.</p>
     </div>
   </div>}
   {events.length?<div className={styles.events}>{events.map(event=><Entry key={event.id} event={event} timeZone={timeZone}/>)}</div>:
     <div className={styles.empty}><Info size={18}/><p>В этой демонстрационной версии подробно подготовлены события ноября 2026 года. Для другого месяца требуется загрузить проверенные события из астрологического API. Выдуманные даты мы не показываем.</p></div>}
   <p className={styles.footer}>Астрологические толкования являются символическими. Персональный разбор натальных домов и аспектов добавляется только на основании реальных расчётов конкретного пользователя.</p>
 </section>;
}
