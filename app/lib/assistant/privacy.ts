import {z} from 'zod';
import type {CRMMember} from '../auth/identity';
import type {ChatInput} from './policy';
import type {VerifiedLink} from './tools';
import {recognizeIntent,normalize} from './intents';
type Row=Record<string,unknown>;
type Read=(name:string,args:Row)=>Promise<{data:unknown;links:VerifiedLink[]}>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.slice(0,5).map(row):[];
const text=(v:unknown)=>typeof v==='string'?v.slice(0,400):'';
const name=(r:Row)=>text(r.name)||[r.first_name,r.last_name].filter(Boolean).join(' ')||text(r.address)||text(r.label)||'Fiche';
const keys=['summary','people','deadlines','inventory','results'] as const;
type SectionKey=typeof keys[number];
export type PrivateContext={sections:Partial<Record<SectionKey,string[]>>;links:VerifiedLink[];localAnswer?:string};
const plan=z.strictObject({sections:z.array(z.enum(keys)).min(1).max(5).refine(a=>new Set(a).size===a.length)});
export function assembleLocalAnswer(prepared:PrivateContext){
 return [prepared.localAnswer,...keys.flatMap(k=>prepared.sections[k]??[])].filter(Boolean).join('\n').slice(0,6000)||'Précisez le module CRM et l’information que vous souhaitez retrouver.';
}
/** Only validated ordering is used. Model text never enters a private answer. */
export function assemblePrivateAnswer(prepared:PrivateContext,output:string){
 const order=plan.parse(JSON.parse(output)).sections;
 return [...order,...keys.filter(k=>!order.includes(k))].flatMap(k=>prepared.sections[k]??[]).join('\n').slice(0,6000);
}
const line=(r:Row)=>[name(r),text(r.displayStatus)||text(r.status),text(r.broker)].filter(Boolean).join(' — ');
const deadline=(r:Row)=>[text(r.title)||text(r.label)||'Échéance',text(r.dueDate)||text(r.due_date)||text(r.date),text(r.dueTime)||text(r.due_time)].filter(Boolean).join(' — ');

/** Private result. Never serialize this object into a provider request. */
export async function preparePrivateContext(input:ChatInput,member:CRMMember,read:Read,now=new Date()):Promise<PrivateContext>{
 const parsed=recognizeIntent(input.question),q=normalize(input.question);
 const sections:PrivateContext['sections']={},links:VerifiedLink[]=[];let calls=0;
 const done=(localAnswer?:string):PrivateContext=>({sections,links:[...new Map(links.map(l=>[l.href,l])).values()].slice(0,10),localAnswer});
 const run=async(tool:string,args:Row)=>{if(++calls>4)throw Error('ASSISTANT_TOOL_LIMIT');const value=await read(tool,args);links.push(...value.links);return row(value.data);};
 if(parsed.intent==='write')return done('Lecture seule : aucune modification, aucun envoi ni action externe.');
 if(parsed.broker&&!member.brokers.includes(parsed.broker as CRMMember['broker']))throw Error('ASSISTANT_FORBIDDEN');
 const brokers=parsed.broker?[parsed.broker]:parsed.mine?[member.broker]:member.brokers;
 const today=new Intl.DateTimeFormat('fr-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const add=(days:number)=>{const d=new Date(`${today}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
 const scoped=parsed.broker||parsed.mine?{broker:brokers[0]}:{};
 if(parsed.intent==='accounting'){
  const r=await run('crm_query_accounting',{query:parsed.entity,mode:parsed.accountingMode,unpaid:parsed.unpaid,...(parsed.broker?{broker:parsed.broker}:{})});
  sections.results=[text(r.explanation),...rows(r.data).map(e=>[
   `${text(e.vendor)||'Fournisseur non renseigné'} — ${typeof e.amount==='number'?e.amount.toLocaleString('fr-CA',{style:'currency',currency:'CAD'}):'Montant non renseigné'}`,
   `Date de dépense : ${text(e.expense_date)||'non renseignée'}. Description : ${text(e.description)||'non renseignée'}.`,
   ...(!e.expense_date?[`Création de l’enregistrement (pas la date de dépense) : ${text(e.created_at)||'non renseignée'}.`]:[]),
   ...(parsed.accountingMode==='invoice'?[`Dépôt de la facture (pas sa date de facturation) : ${text(e.invoice_uploaded_at)||'non renseigné'}.`]:[]),
   `Statut : ${e.is_paid?'payé':'non payé'}. Paiement enregistré : ${text(e.paid_at)||'non renseigné'}. Attribution : ${text(e.assigned_broker)||'équipe'}.`,
  ].join('\n'))];
  if(!rows(r.data).length)sections.results.push(`Je n’ai trouvé aucune ${parsed.accountingMode==='invoice'?'facture':parsed.accountingMode==='payment'||parsed.accountingMode==='paid_total'?'dépense payée':'dépense'} correspondant à ${parsed.entity||'ces critères'} dans les données comptables auxquelles vous avez accès.`);
  if(typeof r.total==='number')sections.results.push(`Total des montants enregistrés comme payés : ${r.total.toLocaleString('fr-CA',{style:'currency',currency:'CAD'})}.`);
  if(r.truncated)sections.results.push('Extrait limité à cinq résultats; consultez Comptabilité pour la suite.');return done();
 }
 if(parsed.intent==='mortgage'){
  for(const broker of brokers){const r=await run('crm_get_mortgage_referrals',{broker,limit:5});(sections.results??=[]).push(`Références hypothécaires — ${broker} :`,...rows(r.data).map(r=>`${text(r.mortgage_advisor_name)||'Conseiller non renseigné'} — ${text(r.institution_name)} — ${r.paid_at?'payé':'à venir'}${typeof r.paid_amount==='number'?` — ${r.paid_amount} CAD`:''}`));if(!rows(r.data).length)sections.results.push('Aucune référence accessible.');if(r.nextPage!=null)sections.results.push('Extrait limité à cinq références.');}return done();
 }
 if(parsed.intent==='coordinates'){
  if(input.context){const [,section,id]=input.context.split('/');const type=section==='contacts'?'contact':section==='listings'?'listing':'transaction';await run(`crm_get_${type}`,{[`${type}_id`]:id});}
  return done('Les coordonnées, notes et documents restent dans la fiche CRM autorisée. Ouvrez son lien pour les consulter.');
 }
 if(parsed.intent==='inventory'){
  const r=await run('crm_get_sign_inventory',{limit:5});sections.inventory=rows(r.data).map(r=>`${name(r)} : ${r.available??'inconnu'} disponible(s), ${r.used??'inconnu'} utilisé(s), total ${r.total??'inconnu'}.`);
  if(!sections.inventory.length)sections.inventory=['Aucun stock accessible trouvé.'];if(r.nextPage!=null)sections.inventory.push('Extrait limité à cinq stocks.');return done();
 }
 if(parsed.intent==='listings'&&!parsed.entity){
  let total=0;const found:Row[]=[];
  for(const broker of brokers){const r=await run(parsed.active?'crm_get_active_broker_listings':'crm_get_broker_listings',{broker});if(typeof r.total!=='number'||!Number.isSafeInteger(r.total)||r.total<0)throw Error('ASSISTANT_INVALID_COUNT');total+=r.total;found.push(...rows(r.listings));}
  sections.results=[`${total} inscription(s) ${parsed.active?'active(s) ':''}dans le périmètre demandé.`,...(!parsed.count?found.slice(0,5).map(line):[])];if(!parsed.count&&total>5)sections.results.push('Cinq fiches maximum affichées; consultez Listings pour la suite.');return done();
 }
 if(parsed.intent==='transactions'&&!parsed.entity){
  const found:Row[]=[];for(const broker of brokers){const r=await run('crm_get_active_broker_transactions',{broker});found.push(...rows(r.transactions));}
  sections.results=['Transactions actives — extrait limité à cinq fiches.',...found.slice(0,5).map(line)];if(!found.length)sections.results.push('Aucune transaction active trouvée.');return done();
 }
 if(['deadlines','conditions','urgent'].includes(parsed.intent)){
  const overdue=q.includes('retard');
  const from=overdue?'1900-01-01':q.includes('demain')?add(1):parsed.intent==='urgent'||parsed.intent==='conditions'?'1900-01-01':today;
  const to=overdue?add(-1):q.includes('demain')?add(1):q.includes('aujourd')?today:parsed.intent==='conditions'?'2200-12-31':add(7);
  const r=await run('crm_get_private_deadlines',{from,to,...scoped,conditions:parsed.intent==='conditions'});
  sections.deadlines=[parsed.intent==='conditions'?'Conditions : échéances ouvertes des dossiers aux étapes PA acceptée, inspection, financement ou autres conditions.':'Échéances non terminées, classées par date; les retards apparaissent en premier pour les urgences.',...rows(r.data).map(d=>`${deadline(d)} — ${text(row(d.transactions).address)}`)];
  if(!rows(r.data).length)sections.deadlines.push('Aucune échéance correspondant à ces critères.');if(r.truncated)sections.deadlines.push('Extrait limité à cinq échéances.');return done();
 }
 if(parsed.intent==='followups'){
  const r=await run('crm_get_due_contact_followups',{to:today,...scoped});sections.people=['Contacts dont le suivi enregistré est dû ou en retard (ce n’est pas une déduction depuis leurs notes).',...rows(r.data).map(c=>`${name(c)} — suivi prévu ${text(c.next_follow_up_date)}`)];
  if(!rows(r.data).length)sections.people.push('Aucun suivi dû trouvé.');if(r.truncated)sections.people.push('Extrait limité à cinq contacts.');return done();
 }
 let entity=parsed.entity;
 // Re-resolve only the previous question, never trust prior answer facts or IDs.
 if(!entity&&!input.context&&input.history.length&&/\b(ce|cette|son|sa|ses|leurs|leur)\b/.test(q))entity=recognizeIntent(input.history.at(-1)!.question).entity;
 if(parsed.intent==='relation'){
  if(!entity)return done('Quel Contact souhaitez-vous rechercher ?');
  const r=await run('crm_search_contacts',{query:entity,limit:5}),found=rows(r.data);
  if(found.length!==1||r.nextPage!=null)return done(found.length?'Plusieurs contacts correspondent. Précisez le nom ou ouvrez la fiche voulue.':'Aucun contact accessible trouvé.');
  const related=await run('crm_get_contact_listings',{contact_id:found[0].id});sections.results=[`Listings liés à ${name(found[0])} :`,...rows(related.listings).map(line)];if(!rows(related.listings).length)sections.results.push('Aucun lien propriétaire enregistré.');return done();
 }
 let kind='',id:unknown,record:Row|undefined;
 if(input.context&&['summary','sellers'].includes(parsed.intent)){
  const [,section,contextId]=input.context.split('/');kind=section;id=contextId;
 }else if(entity&&['search','summary','sellers','listings','transactions'].includes(parsed.intent)){
  const r=await run('crm_search',{query:entity,limit:5});
  const kinds=parsed.intent==='sellers'?(rows(row(r.listings).data).length?['listings']:['transactions']):parsed.concepts.has('transactions')?['transactions']:parsed.concepts.has('listings')?['listings']:parsed.concepts.has('contacts')?['contacts']:['contacts','listings','transactions'];
  const found=kinds.flatMap(k=>rows(row(r[k]).data).map(record=>({kind:k,record}))),truncated=kinds.some(k=>row(r[k]).nextPage!=null);
  if(found.length!==1||truncated){sections.results=found.slice(0,5).map(f=>`${f.kind} : ${name(f.record)}`);return done(found.length?'Plusieurs fiches correspondent. Précisez votre recherche ou ouvrez la fiche voulue.':'Aucune fiche accessible trouvée.');}
  ({kind,record}=found[0]);id=record.id;
 }else return done('Précisez une fiche, ses vendeurs, les conditions à lever, les rappels, les urgences, les propriétés d’un courtier ou les stocks.');
 if(parsed.intent==='sellers'){
  if(kind==='transactions'){
   const tx=await run('crm_get_transaction',{transaction_id:id}),linked=row(tx.sourceListing).listingId;
   if(!linked)return done('Aucun Listing source lié ne permet de confirmer les propriétaires. Les Contacts de la Transaction ne prouvent pas à eux seuls leur rôle de vendeur.');
   id=linked;kind='listings';
  }
  if(kind!=='listings')return done('Ouvrez un Listing pour consulter ses propriétaires enregistrés.');
  const r=await run('crm_get_listing_owners',{listing_id:id});sections.people=['Propriétaires enregistrés du Listing (sans déduire un rôle depuis une simple adresse) :',...rows(r.contacts).map(name)];if(!rows(r.contacts).length)sections.people.push('Aucun propriétaire lié accessible.');if(r.truncated)sections.people.push('Extrait limité à cinq propriétaires.');return done();
 }
 const type=kind==='contacts'?'contact':kind==='listings'?'listing':'transaction';record=await run(`crm_get_${type}`,{[`${type}_id`]:id});
 sections.summary=[line(record)];const price=record.price??record.askingPrice??record.asking_price;if(typeof price==='number')sections.summary.push(`Prix enregistré : ${price.toLocaleString('fr-CA')} CAD.`);
 const notary=text(record.notaryDate)||text(record.notary_date);if(notary)sections.summary.push(`Date de notaire enregistrée : ${notary}.`);
 const ds=rows(record.deadlines);if(ds.length)sections.deadlines=['Échéances du dossier (extrait) :',...ds.map(d=>`${deadline(d)}${d.completed?' — fait':''}`)];
 sections.summary.push('Résumé structuré assemblé dans le CRM. Les notes et documents privés ne sont pas interprétés par l’IA externe.');return done();
}
