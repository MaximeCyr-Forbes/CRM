import type {Expense} from '../accounting/model';
import {normalize} from './intents';

export type AccountingQuery={query:string;mode:'latest'|'expenses'|'payment'|'invoice'|'paid_total';unpaid:boolean;broker?:string;from?:string;to?:string;aggregate?:boolean};
const normalized=(s:string)=>normalize(s).replace(/[^a-z0-9]/g,'');
/** Selection only. Source rows come from the existing permission-scoped, non-materializing service. */
export function selectAccounting(rows:Expense[],a:AccountingQuery){
 let found=rows.filter(r=>(!a.broker||r.assigned_broker===a.broker)&&(!a.unpaid||!r.is_paid)&&(!['payment','paid_total'].includes(a.mode)||r.is_paid)&&(a.mode!=='invoice'||!!r.invoice));
 const needle=normalized(a.query);
 if(needle){
  const values=(r:Expense)=>[r.vendor,r.description,r.assigned_broker,r.category].filter((s):s is string=>typeof s==='string');
  const exact=found.filter(r=>values(r).some(s=>s.trim().toLocaleLowerCase('fr-CA')===a.query.trim().toLocaleLowerCase('fr-CA')));
  const equivalent=found.filter(r=>values(r).some(s=>normalized(s)===needle));
  found=exact.length?exact:equivalent.length?equivalent:found.filter(r=>values(r).some(s=>normalized(s).includes(needle)));
 }
 const date=(r:Expense)=>a.mode==='payment'||a.mode==='paid_total'?r.paid_at:a.mode==='invoice'?r.invoice?.uploaded_at:r.expense_date;
 const missingPeriodDates=!!(a.from||a.to)&&found.some(r=>!date(r));
 if(a.from||a.to)found=found.filter(r=>{const d=date(r)?.slice(0,10);return !!d&&(!a.from||d>=a.from)&&(!a.to||d<=a.to);});
 found.sort((a,b)=>(date(b)||'').localeCompare(date(a)||'')||b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id));
 const ambiguous=new Set(found.map(r=>JSON.stringify([normalized(r.vendor||''),r.assigned_broker||'equipe',r.category]))).size>1;
 const uncertain=found.some(r=>!date(r));
 const single=['latest','payment'].includes(a.mode)&&!ambiguous&&!uncertain;
 const explanation=[a.mode==='invoice'?'Factures jointes : tri par date de dépôt du document, et non par date de facturation (non disponible).':['payment','paid_total'].includes(a.mode)?'Paiements : tri par date de paiement enregistrée (paid_at).':'Dépenses : tri par date de dépense enregistrée (expense_date).',
  uncertain?'Certaines dates sont absentes; leur date de création sert uniquement de repli. Impossible de garantir le dernier enregistrement sans compléter les dates.':'',
  missingPeriodDates?'Des enregistrements sans date ont été exclus du filtre de période; ils ne permettent pas de confirmer un total complet.':'',
  ambiguous?'Plusieurs fournisseurs, attributions ou catégories correspondent. Précisez le contexte voulu.':'',
  a.mode==='paid_total'?`Somme des dépenses marquées payées, ${a.from||a.to?'dans la période demandée':'toutes dates'}; ce n’est pas un relevé bancaire.`:'',
 ].filter(Boolean).join(' ');
 return {explanation,ambiguous:ambiguous&&!a.aggregate,data:found.slice(0,single?1:5).map(r=>({id:r.id,vendor:r.vendor,description:r.description,assigned_broker:r.assigned_broker,category:r.category,expense_date:r.expense_date,created_at:r.created_at,amount:r.amount,is_paid:r.is_paid,paid_at:r.paid_at,invoice_uploaded_at:r.invoice?.uploaded_at})),truncated:!single&&found.length>5,
  ...((a.aggregate||a.mode==='paid_total'&&!ambiguous)&&!missingPeriodDates&&!found.some(r=>r.amount===null)?{total:found.reduce((sum,r)=>sum+Math.round(r.amount!*100),0)/100}:{})};
}
