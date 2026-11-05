/** Evidence checks shared by native-to-visual review and the protected route. */
import { consolidate, resolveAcceptance } from './engine';
const types={financement:'financing',inspection:'inspection',inspection_rapport:'inspection_report',documents:'documents_delivery',documents_lecture:'documents_review',acte_vente:'notary',occupation:'occupancy',financement_preuve_fonds:'proof_of_funds'};
export function mergeVisualReview(transaction, document, facts, pages) {
 const tx=structuredClone(transaction),allowed=new Set(pages);
 if(!facts||typeof facts!=='object'||Array.isArray(facts))throw new Error('Lecture visuelle invalide.');
 for(const k of ['conditions','overrides','terms','issues','buyers','sellers'])if(facts[k]!==undefined&&!Array.isArray(facts[k]))throw new Error('Structure visuelle invalide.');
 const evidence=x=>x&&allowed.has(x.source_page)&&typeof x.text==='string'&&x.text.trim()&&typeof x.confidence==='number'&&Number.isFinite(x.confidence)&&x.confidence>=0&&x.confidence<=1;
 const form=document.form_id, kind=form.split('-')[0],isAmendment=['CP','MO','BO'].includes(kind);
 const proof=x=>({source_form:form,source_clause:String(x.clause||x.source_clause||''),source_page:x.source_page,detected_text:x.text,confidence:x.confidence,method:'vision'});
 const response=facts.response;
 let acceptance;
 if(response&&Array.isArray(response.signatures)&&Array.isArray(response.required_signers)){
  acceptance=resolveAcceptance({...response,signatures:response.signatures.filter(evidence).map(s=>({...s,source:proof(s)}))});
 }
 if(facts.number&&form.split('-')[1]&&facts.number!==form.split('-')[1]){tx.issues.push(`${form} : numéro contradictoire entre texte et image.`);return consolidate(tx);}
 if(isAmendment&&(!acceptance?.complete||!tx.acceptance?.complete||Date.parse(acceptance.datetime)<Date.parse(tx.acceptance.datetime))){
  tx.issues.push(`${form} : signatures et applicabilité de la modification à confirmer.`);return consolidate(tx);
 }
 if(!isAmendment&&form===tx.main_form&&acceptance?.complete){
  if(tx.acceptance.complete&&tx.acceptance.datetime!==acceptance.datetime)tx.issues.push('La lecture visuelle et les signatures natives indiquent des réponses différentes.');
  else tx.acceptance=acceptance;
 }
 const idMap=new Map((facts.conditions||[]).filter(evidence).map(c=>[String(c.id),`${form}:vision:${c.id}`]));
 for(const incoming of facts.conditions||[]){
  if(!evidence(incoming)||!incoming.id){tx.issues.push(`${form} : condition visuelle sans preuve vérifiable.`);continue;}
  const c={...incoming,id:idMap.get(String(incoming.id)),type:types[incoming.type]||incoming.type||'other',source:proof(incoming),form:kind,
   active:['empty','crossed_out'].includes(incoming.activation)?false:incoming.activation==='uncertain'?null:typeof incoming.active==='boolean'?incoming.active:null};
  if(c.trigger?.startsWith('condition:'))c.trigger='condition:'+(idMap.get(c.trigger.slice(10))||c.trigger.slice(10));
  const matches=tx.conditions.filter(old=>isAmendment?(c.replaces_clause&&old.clause===c.replaces_clause)||(c.replaces_type&&old.type===(types[c.replaces_type]||c.replaces_type)):old.source?.source_form===form&&old.clause===c.clause);
  if(matches.length>1){tx.issues.push(`${form} : plusieurs conditions correspondent à ${c.clause}.`);continue;}
  const previous=matches[0];
  if(isAmendment&&c.active===false&&!c.removes_clause)continue;
  if(previous){
   if(!isAmendment&&previous.confidence>=.9&&((previous.explicit_date&&c.explicit_date!==previous.explicit_date)||(previous.duration_days!=null&&c.duration_days!==previous.duration_days))){tx.issues.push(`${form} ${c.clause} : lectures contradictoires à confirmer.`);continue;}
   const generatedId=c.id;c.id=previous.id;
   for(const [k,v] of idMap)if(v===generatedId)idMap.set(k,c.id);
   tx.conditions=tx.conditions.filter(old=>old!==previous);
   tx.amendments.push({previous,replacement:c});
  }
  if(c.removes_clause&&previous){
   const removed=new Set([previous.id]);let changed=true;
   while(changed){changed=false;tx.conditions=tx.conditions.filter(old=>{if(old.trigger?.startsWith('condition:')&&removed.has(old.trigger.slice(10))){removed.add(old.id);changed=true;return false;}return true;});}
  } else tx.conditions.push(c);
 }
 for(const c of tx.conditions)if(c.trigger?.startsWith('condition:')){
  const match=[...idMap].find(([key])=>`${form}:vision:${key}`===c.trigger.slice(10));if(match)c.trigger='condition:'+match[1];
 }
 for(const o of facts.overrides||[])if(evidence(o))tx.overrides.push({...o,source:proof(o),priority:20,condition_ids:(o.condition_ids||[]).map(id=>idMap.get(id)||id),exclude_ids:(o.exclude_ids||[]).map(id=>idMap.get(id)||id)});
 for(const term of facts.terms||[])if(evidence(term)&&term.value)tx.terms[term.name]={value:term.value,...proof(term)};
 tx.issues.push(...(facts.issues||[]).filter(i=>typeof i==='string'));
 return consolidate(tx);
}
