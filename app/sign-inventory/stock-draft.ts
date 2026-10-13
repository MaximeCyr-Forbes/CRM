import type {Stock} from '../lib/sign-inventory/model';
export function stockChanges(stock:Stock[],draft:Record<string,string>){
 return stock.flatMap(s=>{
  const raw=draft[s.id],total=Number(raw);
  if(raw===undefined||raw.trim()===''||!Number.isInteger(total)||total<0||total>100000)throw new Error(`Indiquez une quantité entière entre 0 et 100 000 pour ${s.label}.`);
  if(total<Number(s.used))throw new Error(`${s.label} : le total ne peut pas être inférieur aux ${s.used} article(s) en circulation.`);
  return total===s.total?[]:[{id:s.id,total,version:s.version}];
 });
}
