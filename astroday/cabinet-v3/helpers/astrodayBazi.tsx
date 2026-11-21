/** ASTRODAY 3.1 — deterministic Jie Cai calculator, port of astroday/v2/bazi.mjs. */
export const STEMS = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"] as const;
export const BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"] as const;
export const MAIN_QI = [9,5,0,1,4,2,3,5,6,7,4,8] as const;
export const STEM_NAMES = ["Цзя","И","Бин","Дин","У","Цзи","Гэн","Синь","Жэнь","Гуй"] as const;
export const ELEMENTS = ["Дерево","Огонь","Земля","Металл","Вода"] as const;
export type JieCaiType = "stem" | "branch";
export type JieCaiDay = {day:string;kind:JieCaiType;pillar:string;pillarRu:string;source:"visible"|"hidden"};
export type DayMaster = {stem:number;pillar:string;jieCaiStem:number;label:string;jieCaiLabel:string;ambiguity:boolean};
const asUTC=(d:string)=>{
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
 if(!m)throw new Error("Неверная дата");
 const y=+m[1],month=+m[2],day=+m[3],date=new Date(Date.UTC(y,month-1,day));
 if(date.getUTCFullYear()!==y||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw new Error("Несуществующая дата");
 return date;
};
export const addDays=(date:string,days:number)=>{
 const d=asUTC(date);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
};
const jdn=(y:number,m:number,d:number)=>{
 const a=Math.floor((14-m)/12),yy=y+4800-a,mm=m+12*a-3;
 return d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)-32045;
};
export function dayPillar(date:string){
 const d=asUTC(date),i=((jdn(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate())+49)%60+60)%60;
 return {cycle:i,stem:i%10,branch:i%12,hanzi:STEMS[i%10]+BRANCHES[i%12],ru:STEM_NAMES[i%10]};
}
export const labelStem=(s:number)=>ELEMENTS[Math.floor(s/2)]+" "+(s%2===0?"Ян":"Инь")+" ("+STEMS[s]+")";
export function getDayMaster(birthDate:string,time?:string,boundary:"midnight"|"zi23"="midnight"):DayMaster{
 const ambiguous=!!time && /^23:\d{2}/.test(time);
 const chosen=ambiguous&&boundary==="zi23"?addDays(birthDate,1):birthDate;
 const p=dayPillar(chosen),other=p.stem%2===0?p.stem+1:p.stem-1;
 return {stem:p.stem,pillar:p.hanzi,jieCaiStem:other,label:labelStem(p.stem),jieCaiLabel:labelStem(other),ambiguity:ambiguous};
}
export function jieCaiDay(day:string,master:DayMaster):JieCaiDay|null{
 const p=dayPillar(day),visible=p.stem===master.jieCaiStem,hidden=MAIN_QI[p.branch]===master.jieCaiStem;
 if(!visible&&!hidden)return null;
 return {day,kind:visible?"stem":"branch",source:visible?"visible":"hidden",pillar:p.hanzi,pillarRu:p.ru};
}
export function jieCaiCalendar(master:DayMaster,start:string,end:string):JieCaiDay[]{
 asUTC(start);asUTC(end);
 const results:JieCaiDay[]=[];
 if(start>end)throw new Error("Неверный диапазон");
 let d=start;
 for(let n=0;d<=end&&n<400;n++,d=addDays(d,1)){const item=jieCaiDay(d,master);if(item)results.push(item)}
 return results;
}
export const dateRu=(day:string)=>{
 const d=asUTC(day);
 return new Intl.DateTimeFormat("ru-RU",{timeZone:"UTC",day:"numeric",month:"long",weekday:"short"}).format(d);
};
export const interpretation=(kind:JieCaiType)=>kind==="stem"
 ? {label:"Основной день",detail:"Небесный ствол дня совпадает с твоим Грабителем богатства.",action:"Подходящий повод внимательнее посмотреть на спонтанные обещания и совместные расходы."}
 : {label:"Фоновый день",detail:"Тема проявляется через главный скрытый ствол земной ветви дня.",action:"Можно заметить, где личные границы и договорённости нуждаются в ясности."};
