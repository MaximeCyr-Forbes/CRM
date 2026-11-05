/** Port of transaction_engine.py at 1474422. Pure, no delivery or persistence. */
import { addDays, inToronto, torontoDateTime } from '../../oaciq-reader/dates';
const MONTHS = 'janvier février mars avril mai juin juillet août septembre octobre novembre décembre'.split(' ');
export function isoDateTime(value) {
 if (!value) return null;
 try {
  const s=String(value), m=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return null;
  if (/[Z+-]\d{0,2}:?\d{0,2}$/.test(s.slice(10)) && /(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) return inToronto(new Date(s));
  return torontoDateTime(+m[1],+m[2],+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0));
 } catch {return null;}
}
const frenchDay = value => {const s=String(value);return `${+s.slice(8,10)} ${MONTHS[+s.slice(5,7)-1]} ${s.slice(0,4)}`;};
export const verified = item => item.confirmed === true || (typeof item.confidence === 'number' && Number.isFinite(item.confidence) && item.confidence >= .90);
function excluded(item, form='') {
 if (!item || typeof item !== 'object') return false;
 const proof=item.source||{}, kind=String(proof.source_form||item.source_form||item.form||form).trim().toUpperCase().split(/[\s-]/)[0];
 const number=/^(?:clause\s+)?((?:[A-Z]\d+|\d+)\.\d+(?:\.\d+)*)(?![\w.])/i.exec(String(proof.source_clause||item.source_clause||item.clause||'').trim())?.[1].toUpperCase();
 return ['5.2','5.3','6.3','7.1','11.3'].includes(number) || (['PA','PAD'].includes(kind) && number==='10.7');
}
export function resolveAcceptance(input) {
 const r=structuredClone(input||{}), signatures=r.signatures||[],required=r.required_signers||[];
 r.action_confidence ??= r.confidence||0;
 if (signatures.length) r.confidence=Math.min(r.confidence||0,...signatures.filter(s=>required.includes(s.signer_id)).map(s=>s.confidence||0));
 r.datetime=null;r.complete=false;
 if (r.action!=='accept') return r;
 if (r.confirmed) {
  const moment=/T\d{2}:\d{2}/.test(r.confirmed_datetime)?isoDateTime(r.confirmed_datetime):null;
  if (moment && r.signatures_confirmed) Object.assign(r,{datetime:moment,complete:true,confidence:1});
  return r;
 }
 if (!required.length || !signatures.length || !verified(r)) return r;
 const moments=[];
 for (const id of required) {
  const matches=signatures.filter(s=>s.signer_id===id && s.present===true && verified(s));
  if (matches.length!==1) return r;
  const moment=/T\d{2}:\d{2}/.test(matches[0].datetime)?isoDateTime(matches[0].datetime):null;
  if (!moment) return r;moments.push(moment);
 }
 const last=moments.sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1);
 if (last) Object.assign(r,{datetime:last,complete:true,confidence:Math.min(r.confidence||0,...signatures.map(s=>s.confidence||0)),source:signatures.find(s=>required.includes(s.signer_id)&&isoDateTime(s.datetime)===last)?.source||{}});
 return r;
}
export function calculate(conditions, acceptance={}, overrides=[], events={}) {
 const items=structuredClone(conditions.filter(c=>!excluded(c)));
 overrides=overrides.filter(o=>!excluded(o));
 const byId=new Map(items.map(c=>[c.id,c]));if(byId.size!==items.length) throw new Error('Identifiants de conditions en double.');
 const eventValues=Object.fromEntries(Object.entries(events).filter(([,v])=>!excluded(v)));
 if (acceptance.complete) eventValues.acceptance={datetime:acceptance.datetime,confidence:acceptance.confidence||0,confirmed:acceptance.confirmed||false,source:acceptance.source||{}};
 else delete eventValues.acceptance;
 const resolved=new Map(),visiting=new Set();
 function resolve(id) {
  if(resolved.has(id))return resolved.get(id);
  const item=byId.get(id),out={...item,date:null,time:null,status:'pending',calculation:null,trigger_used:item.trigger,trigger_source:null,trigger_evidence:null};resolved.set(id,out);
  if(item.active===false){out.status='inactive';return out;}
  if(item.active!==true||!verified(item)){out.status='review';return out;}
  if(visiting.has(id)){out.status='cycle';return out;}visiting.add(id);
  try {
   let trigger=item.trigger||'acceptance',base=null,days=0,hours=0;
   const relevant=o=>(o.from_trigger||'acceptance')===trigger&&(!o.condition_ids?.length||o.condition_ids.includes(id))&&!(o.exclude_ids||[]).includes(id);
   if(overrides.some(o=>o.active===null&&relevant(o))){out.status='review';return out;}
   const applicable=overrides.filter(o=>o.active===true&&relevant(o));
   if(applicable.length){const priority=Math.max(...applicable.map(o=>o.priority||0)),winners=applicable.filter(o=>(o.priority||0)===priority);
    if(new Set(winners.map(o=>o.to_trigger)).size!==1||!winners.every(verified)){out.status='review';return out;}
    trigger=winners.at(-1).to_trigger;out.trigger_source=winners.at(-1).source;
   }
   out.trigger_used=trigger;
   if(item.explicit_date){base=isoDateTime(item.explicit_date);if(!base)throw new Error();out.calculation=`Date explicite : ${item.explicit_date}`;}
   else {
    days=item.duration_days;hours=item.duration_hours||0;
    if(days==null&&!hours){out.status='review';return out;}
    if((days!=null&&(!Number.isInteger(days)||days<0||days>36500))||!Number.isInteger(hours)||hours<0||hours>876000)throw new Error();
    let confidence=1;
    if(trigger.startsWith('condition:')){
     const dependency=trigger.slice(10);if(visiting.has(dependency)){out.status='cycle';return out;}
     const previous=byId.has(dependency)?resolve(dependency):null;
     if(previous?.status==='calculated'){base=isoDateTime(previous.date+'T'+(previous.time||'00:00'));confidence=previous.confidence||0;out.trigger_evidence={condition_id:dependency,source:previous.source,calculation:previous.calculation};if(hours&&!previous.time)base=null;}
     else if(['review','cycle'].includes(previous?.status))out.status=previous.status;
    } else {
     const event=eventValues[trigger];if(event&&verified(event)){base=isoDateTime(event.datetime);confidence=event.confirmed?1:event.confidence||0;out.trigger_evidence={event:trigger,...event};if(hours&&String(event.datetime||'').length<=10)base=null;}
    }
    const alt=item.alternative_trigger,event=alt&&eventValues[alt];
    if(event){const candidate=isoDateTime(event.datetime);if(!verified(event)||!candidate){out.status='review';return out;}
     if(!base||Date.parse(candidate)<Date.parse(base)){base=candidate;out.trigger_used=alt;out.trigger_evidence={event:alt,...event};confidence=event.confirmed?1:event.confidence||0;}}
    if(!base)return out;
    out.confidence=Math.min(item.confirmed?1:item.confidence||0,confidence);
    out.calculation=`${base} + ${days||0} jours${hours?` + ${hours} heures`:''}`;
    base=isoDateTime(addDays(base.slice(0,10),days||0)+'T'+base.slice(11,19));
    if(hours)base=inToronto(new Date(Date.parse(base)+hours*3600000));
   }
   let clock=item.deadline_time;
   if(clock&&!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(clock))throw new Error();
   if(clock?.length===8&&clock.endsWith(':00'))clock=clock.slice(0,5);
   Object.assign(out,{status:'calculated',date:base.slice(0,10),time:clock||(hours?base.slice(11,16):null)});
  } catch {out.status='review';} finally {visiting.delete(id);}return out;
 }
 return items.map(c=>resolve(c.id));
}
export function consolidate(input) {
 const tx=structuredClone(input),form=tx.main_form||'';
 for(const k of ['conditions','overrides'])tx[k]=(tx[k]||[]).filter(c=>!excluded(c,form));
 tx.terms=Object.fromEntries(Object.entries(tx.terms||{}).filter(([,v])=>!excluded(v,form)));
 tx.events=Object.fromEntries(Object.entries(tx.events||{}).filter(([,v])=>!excluded(v,form)));
 tx.issues=(tx.issues||[]).filter(issue=>{const refs=[...String(issue).matchAll(/\bclause\s+((?:[A-Z]\d+|\d+)\.\d+(?:\.\d+)*)\b/gi)].map(m=>m[1]);return !refs.length||!refs.every(clause=>excluded({clause},form));});
 tx.acceptance=resolveAcceptance(tx.acceptance);const manual=tx.manual_override===true;
 if(manual)tx.conditions=tx.conditions.map(c=>({...c,date:c.explicit_date||c.date||null,time:c.deadline_time||c.time||null,trigger_used:c.trigger||'acceptance',status:c.active===false?'inactive':c.explicit_date||c.date?'calculated':'review',calculation:null}));
 else tx.conditions=calculate(tx.conditions,tx.acceptance,tx.overrides,tx.events);
 const reviews=[...tx.issues];
 if(!tx.main_form)reviews.push("Promesse d'achat principale manquante : annexes conservées, transaction à compléter.");
 if(!tx.acceptance.complete)reviews.push('Confirmez la réponse du vendeur, la date et toutes les signatures requises.');
 if(tx.conditions.some(c=>['review','cycle'].includes(c.status)))reviews.push('Certaines conditions ou leur activation doivent être confirmées.');
 tx.warnings=[...new Set(manual?[...(tx.warnings||[]),...reviews]:reviews)];
 tx.needs_review=manual?(!tx.main_form||!tx.acceptance.complete):reviews.length>0;
 tx.acceptance_date=tx.acceptance.complete?frenchDay(tx.acceptance.datetime):'À confirmer';
 tx.acceptance_time=tx.acceptance.complete?tx.acceptance.datetime.slice(11,16).replace(':','h'):'';
 tx.deadlines=tx.conditions.filter(c=>c.status!=='inactive').map(c=>{
  let display;
  if(c.date)display=frenchDay(c.date)+(c.time?' à '+c.time.replace(':','h'):'');
  else if(['review','cycle'].includes(c.status)&&!(manual&&(c.duration_days!=null||c.duration_hours)))display='À confirmer';
  else {
   const labels={acceptance:"l'acceptation",seller_notice:"la réception de l'avis écrit du vendeur",sale_fulfilled:'la réalisation de la vente',refusal_notice:"l'avis de refus"};
   const trigger=c.trigger_used||c.trigger||'acceptance',dep=trigger.startsWith('condition:')&&tx.conditions.find(d=>d.id===trigger.slice(10));
   const tail=trigger.startsWith('condition:')?(dep?`l'expiration du délai « ${dep.label} »`:'un autre délai'):(labels[trigger]||trigger.replaceAll('_',' '));
   display=(c.duration_days!=null?`${c.duration_days} jours après ${tail}`:`${c.duration_hours||''} heures après ${tail}`)+' (événement à renseigner)';
  }
  const proof=c.source||{};return {id:c.id,label:c.label,date_text:display,details:`${proof.source_form} · ${proof.source_clause} · page ${proof.source_page??'None'}`,source:proof,status:c.status,contingency:c.contingency||''};
 });
 tx.final_contract=Object.fromEntries(tx.conditions.filter(c=>c.active!==false).map(c=>[c.type,{value:c.date||c.explicit_date||c.duration_days,time:c.time||c.deadline_time,...c.source,overrides:c.overrides||[]}]));
 for(const [key,term] of Object.entries(tx.terms))tx.final_contract[key]??=term;
 const names=tx.client_names||[],greeting='Bonjour'+(names.length?' '+names.filter(n=>n.trim()).map(n=>n.trim().split(/\s+/)[0].toLocaleLowerCase('fr-CA').replace(/(^|[-'’])(\p{L})/gu,(_,a,b)=>a+b.toLocaleUpperCase('fr-CA'))).join(' et '):'')+',';
 tx.email=tx.needs_review?'':[greeting,"Félicitations pour votre promesse d'achat acceptée!",'Voici les délais à suivre :',...tx.deadlines.map(d=>`${d.label} : ${d.date_text}${d.contingency?'. '+d.contingency:''}`),'Bonne journée'].join('\n\n');
 tx.raw={acceptance:tx.acceptance,conditions:tx.conditions,overrides:tx.overrides,documents:tx.documents||[],events:tx.events,amendments:tx.amendments||[],terms:tx.terms,final_contract:tx.final_contract,review_log:tx.review_log||[],...(manual?{manual_override:true}:{})};
 tx.ok=true;return tx;
}
export function confirmManually(input) {
 const tx=structuredClone(input);
 if(!tx.id||!tx.main_form)throw new Error('Aucune transaction principale détectée.');
 const r=tx.acceptance||{},moment='confirmed_datetime' in r?r.confirmed_datetime:r.datetime||resolveAcceptance(r).datetime;
 if(!isoDateTime(moment))throw new Error("Saisissez une date d'acceptation avant de confirmer.");
 if(['refuse','counter'].includes(r.action))throw new Error('La transaction doit être acceptée pour générer ce courriel.');
 tx.acceptance={...r,action:'accept',confirmed:true,confirmed_datetime:moment,signatures_confirmed:true};tx.manual_override=true;return consolidate(tx);
}
