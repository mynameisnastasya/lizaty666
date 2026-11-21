import React,{useMemo,useState} from "react";
import {ArrowRight,ChevronLeft,ChevronRight,Coins,Info,ShieldCheck,Sparkles} from "lucide-react";
import {dateRu,getDayMaster,jieCaiCalendar,interpretation} from "../helpers/astrodayBazi";
import s from "./JieCaiExperience.module.css";
const iso=(y:number,m:number,d:number)=>[y,String(m+1).padStart(2,"0"),String(d).padStart(2,"0")].join("-");
const monthName=(y:number,m:number)=>new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(y,m,1)));
const weekdays=["ПН","ВТ","СР","ЧТ","ПТ","СБ","ВС"];
export function JieCaiExperience(){
 const [birthDate,setBirthDate]=useState("2001-03-14"),[birthTime,setBirthTime]=useState("08:25");
 const [month,setMonth]=useState({y:2026,m:10}),[selected,setSelected]=useState<string|null>(null);
 const [method,setMethod]=useState(false),[filter,setFilter]=useState<"all"|"stem"|"branch">("all");
 const master=useMemo(()=>{try{return getDayMaster(birthDate,birthTime)}catch{return null}},[birthDate,birthTime]);
 const count=new Date(Date.UTC(month.y,month.m+1,0)).getUTCDate();
 const first=(new Date(Date.UTC(month.y,month.m,1)).getUTCDay()+6)%7;
 const start=iso(month.y,month.m,1),end=iso(month.y,month.m,count);
 const days=useMemo(()=>master?jieCaiCalendar(master,start,end):[],[master,start,end]);
 const indexed=useMemo(()=>new Map(days.map(d=>[d.day,d])),[days]);
 const major=days.filter(d=>d.kind==="stem").length,minor=days.filter(d=>d.kind==="branch").length;
 const filtered=days.filter(d=>filter==="all"||d.kind===filter);
 const changeMonth=(n:number)=>{const d=new Date(Date.UTC(month.y,month.m+n,1));setMonth({y:d.getUTCFullYear(),m:d.getUTCMonth()});setSelected(null)};
 const chosen=selected?indexed.get(selected)||null:null;
 return <div className={s.root}>
   <section className={s.hero}><div className={s.orbitArt} aria-hidden="true"><span>劫</span></div>
    <div className={s.overline}>ASTRODAY / BA-ZI · 劫财</div>
    <div className={s.eyebrow}><Coins size={15}/> ЛИЧНЫЙ КАЛЕНДАРЬ РЕСУРСОВ</div>
    <h2>Дни <em>Грабителя</em><span> богатства</span></h2>
    <p>Не предсказание потерь. Традиционный символ Ба-цзы о соперничестве, границах и распределении ресурсов.</p>
    <div className={s.heroBottom}>ТВОИ ДАТЫ · ТВОИ РЕШЕНИЯ <Sparkles size={17}/></div>
   </section>
   <section className={s.card}>
    <div className={s.sectionTitle}><small>01</small><div><span>ПЕРСОНАЛЬНЫЙ РАСЧЁТ</span><h3>С чего начинаем</h3></div><b>ДЕМО</b></div>
    <p className={s.explain}>Укажи дату и время рождения. Дни пересчитаются локально, без AI и без передачи данных на сервер.</p>
    <div className={s.fields}><label>Дата рождения<input type="date" value={birthDate} min="1900-01-01" max="2099-12-31" onChange={e=>{setBirthDate(e.target.value);setSelected(null)}}/></label>
    <label>Время рождения<input type="time" value={birthTime} onChange={e=>setBirthTime(e.target.value)}/></label></div>
    {master?<div className={s.master}><strong>{master.pillar}</strong><div><small>ТВОЙ ДНЕВНОЙ МАСТЕР</small><b>{master.label}</b><span>Грабитель богатства: {master.jieCaiLabel}</span></div></div>:<p role="alert">Укажи правильную дату рождения.</p>}
    {master?.ambiguity&&<p className={s.explain}>При рождении между 23:00 и 00:00 другие школы могут давать другой Дневной Мастер. Здесь смена суток в полночь.</p>}
   </section>
   <section className={s.card}>
    <div className={s.sectionTitle}><small>02</small><div><span>РИТМ МЕСЯЦА</span><h3>Твой календарь</h3></div></div>
    <div className={s.month}><button aria-label="Предыдущий месяц" onClick={()=>changeMonth(-1)}><ChevronLeft size={20}/></button><h4>{monthName(month.y,month.m)}</h4><button aria-label="Следующий месяц" onClick={()=>changeMonth(1)}><ChevronRight size={20}/></button></div>
    <div className={s.stats}><div><strong>{major}</strong><span>Основные</span></div><div><strong>{minor}</strong><span>Фоновые</span></div><div><strong>{count-major-minor}</strong><span>Остальные</span></div></div>
    <div className={s.weekdays}>{weekdays.map(x=><span key={x}>{x}</span>)}</div>
    <div className={s.calendar}>{[...Array.from({length:first},()=>null),...Array.from({length:count},(_,i)=>i+1)].map((d,i)=>{
      if(d===null)return <span key={"blank"+i}/>;
      const key=iso(month.y,month.m,d),event=indexed.get(key);
      const kind=event?.kind||"plain";
      return <button key={key} aria-pressed={key===selected} aria-label={[d,monthName(month.y,month.m),kind==="plain"?"обычный день":kind==="stem"?"основной день":"фоновый день"].join(" ")} className={[s.date,kind==="stem"?s.strong:kind==="branch"?s.soft:"",selected===key?s.selected:""].join(" ")} onClick={()=>setSelected(key===selected?null:key)}><span>{d}</span>{event&&<i/>}</button>;
     })}</div>
     <div className={s.legend}><span><i className={s.legendStrong}/> Основной</span><span><i className={s.legendSoft}/> Фоновый</span><span><i className={s.legendPlain}/> Обычный</span></div>
     {selected&&<div className={s.dayDetail} aria-live="polite"><div><strong>{dateRu(selected)}</strong><b>{chosen?interpretation(chosen.kind).label:"Обычный день"}</b></div>
      {chosen?<><p>{interpretation(chosen.kind).detail} Столп дня: {chosen.pillar}.</p><p>{interpretation(chosen.kind).action}</p></>:<p>Совпадения нет. Это не оценка финансовой удачи.</p>}</div>}
   </section>
   <section className={s.card}>
    <div className={s.sectionTitle}><small>03</small><div><span>БЛИЖАЙШИЕ ДАТЫ</span><h3>На что обратить внимание</h3></div></div>
    <div className={s.filters} role="group" aria-label="Тип дней"><button aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>Все {days.length}</button><button aria-pressed={filter==="stem"} onClick={()=>setFilter("stem")}>Основные</button><button aria-pressed={filter==="branch"} onClick={()=>setFilter("branch")}>Фоновые</button></div>
    {filtered.length?filtered.map(d=><button key={d.day} className={s.event} onClick={()=>setSelected(d.day)}><span>{d.kind==="stem"?"◆":"◇"}</span><span><b>{dateRu(d.day)}</b><small>{interpretation(d.kind).label} · {d.pillar}</small></span><ArrowRight size={16}/></button>):<p className={s.explain}>В этом месяце таких дней нет.</p>}
   </section>
   <section className={s.method}><button onClick={()=>setMethod(v=>!v)} aria-expanded={method}><Info size={17}/> Как это рассчитано? <ChevronRight size={17}/></button>
   {method&&<div><p>Дневной Мастер — небесный ствол дня рождения. Грабитель богатства, 劫财, — ствол той же стихии с противоположной полярностью инь/ян.</p>
    <p>Основной день определяется по небесному стволу календарного дня, фоновый — по главному скрытому стволу земной ветви.</p>
    <p>Используется 60-дневный цикл и гражданская дата, граница суток 00:00. При иной школе расчёт может отличаться. Символика Ба-цзы не заменяет финансового анализа.</p></div>}
   </section>
   <p className={s.disclaimer}><ShieldCheck size={17}/> Демо работает локально. Платежи и рассылки не подключены.</p>
  </div>;
}