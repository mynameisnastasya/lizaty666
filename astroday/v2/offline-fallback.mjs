/**
 * ASTRODAY verified/offline generation path.
 *
 * The only source of astrological facts is the existing deterministic engine.
 * Editor-authored Russian text templates run locally: NO network/model API.
 * Defaults to OFF. Safe deployment requires an explicit config flag.
 */
import {authorDaily, OFFLINE_EDITORIAL_VERSION} from "./offline-editorial.mjs";
export const OFFLINE_MODES=Object.freeze(["off","when-exhausted","only"]);
const ALLOWED_DAY=/^\d{4}-\d\d-\d\d$/;
export function normalizedOfflineMode(v){
 return OFFLINE_MODES.includes(v)?v:"off";
}
export function isOpenAIQuotaFailure(error){
 const value=String(error?.message||error||"");
 return /credit_balance_exhausted|insufficient_quota|openai_daily_budget_reached|openai_(?:api_)?(?:http_)?429|(?:^|\D)429(?:\D|$)/i.test(value);
}
export function makeOfflineForecast({row,calc,lunar,topics,engineVersion}){
 if(!row||!ALLOWED_DAY.test(row.day))throw Error("offline_bad_day");
 if(!calc||calc.day!==row.day||calc.calculationStatus!=="verified_v2"||calc.version!==engineVersion)throw Error("offline_unverified_engine_facts");
 if(!calc.natalProfile||!calc.transitingMoon||!Array.isArray(calc.activeAspects))throw Error("offline_incomplete_natal_facts");
 const ld=Number(lunar?.lunarDayAtNoon);
 if(!Number.isInteger(ld)||ld<1||ld>30)throw Error("offline_lunar_day_missing");
 if(!topics||!Array.isArray(topics.themes)||topics.houseKnown!==(calc.houseKnown===true))throw Error("offline_topics_invalid");
 const rowWithFacts={forecast_date:row.day,profile_fp:row.profile_fp,facts:calc,topics,lunar};
 const draft=authorDaily(rowWithFacts);
 if(!draft?.html||draft.html.length<550||draft.html.length>3900)throw Error("offline_text_length");
 if(/<script|onload=|javascript:|@(?:[a-z0-9_]{4,})/i.test(draft.html))throw Error("offline_unsafe_html");
 if(calc.houseKnown!==true&&/Луна идёт по твоему \d+-му натальному дому/.test(draft.html))throw Error("offline_invented_house");
 const output={
  headline:"Личный прогноз на день",
  opening:"Авторский разбор по проверенным астрологическим расчётам",
  sections:[],
  lunar_note:"",
  voc_note:"",
  advice:"Выбирай действия, ориентируясь на реальные обстоятельства.",
  editorial_source:"prewritten_liza_guidance",
 };
 return {html:draft.html,modelOutput:output,
  validation:{ok:true,mode:"offline_authorial",factsVerified:true,calculationStatus:calc.calculationStatus,
    engineVersion,topicsVersion:topics.version,offlineVersion:OFFLINE_EDITORIAL_VERSION,
    moonHouse:draft.meta.moonHouse,moonPersonalAspects:draft.meta.hasMoonAspects,lunarDay:ld,editorialMeta:draft.meta},
  model:"human-authored-no-api",promptVersion:OFFLINE_EDITORIAL_VERSION,
  usage:{input_tokens:0,output_tokens:0},responseId:null
 };
}
