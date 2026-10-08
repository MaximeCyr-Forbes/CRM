import { todayToronto, type Filters } from "./model";
export const MONTHS = ["JAN","FÉV","MAR","AVR","MAI","JUN","JUL","AOÛ","SEP","OCT","NOV","DÉC"];
const NAMES = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
export function readAccountingFilters(search: string, today=todayToronto()): Filters {
  const q=new URLSearchParams(search), y=q.get("year"), m=q.get("month"), p=q.get("view"), c=q.get("category"), payment=q.get("payment");
  return {year:y&&/^\d{4}$/.test(y)&&Number(y)>=1?y:today.slice(0,4),month:m&&/^(0?[1-9]|1[0-2])$/.test(m)?m.padStart(2,"0"):today.slice(5,7),period:p==="year"||p==="all"||p==="undated"?p:"month",category:c==="marketing"||c==="operation"?c:"all",payment:payment==="paid"||payment==="unpaid"?payment:"all",search:q.get("q")??""};
}
export function accountingFilterQuery(filters: Filters) {
  const q=new URLSearchParams({year:filters.year,month:filters.month??todayToronto().slice(5,7)});
  if(filters.period!=="month")q.set("view",filters.period);
  if(filters.category!=="all")q.set("category",filters.category);
  if(filters.payment&&filters.payment!=="all")q.set("payment",filters.payment);
  if(filters.search)q.set("q",filters.search);
  return q.toString();
}
export function accountingPeriodLabel(filters: Filters) {
  return filters.period==="all"?"Toutes les années":filters.period==="undated"?"Sans date":filters.period==="year"?`Année ${filters.year}`:`${NAMES[Number(filters.month??todayToronto().slice(5,7))-1]} ${filters.year}`;
}
export function adjacentYear(filters: Filters,delta:number): Filters {
  return {...filters,year:String(Math.max(1,Math.min(9999,Number(filters.year)+delta))).padStart(4,"0"),period:filters.period==="all"||filters.period==="undated"?"month":filters.period};
}
