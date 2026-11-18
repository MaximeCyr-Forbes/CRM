import type {ChatInput} from './policy';
import type {CRMMember} from '../auth/identity';
import {normalize} from './intents';
import {help} from './knowledge';
import {preparePrivateContext,assembleLocalAnswer} from './privacy';
import {recordPath} from './record-request';
import {resolveRecord} from './record-search';
import {buildQueryPlan,conversationState,queryPlan,queryResult,type ConversationState,type QueryPlan} from './query-plan';
import {moduleCapability,relationships,isSafeCrmNavigationPath,teamCalendarPath,catalog} from './catalog';

type Read=Parameters<typeof preparePrivateContext>[2];
type Link={href:string;label:string};
type Status='SUCCESS'|'CLARIFICATION'|'AMBIGUOUS'|'NOT_FOUND'|'FORBIDDEN'|'UNSUPPORTED'|'TECHNICAL_ERROR';
type Result={answer:string;links:Link[];source:string;status:Status;navigateTo?:string;resolved?:ConversationState['resolved'];candidateCount?:number;truncated?:boolean};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const plural={contact:'contacts',listing:'listings',transaction:'transactions'} as const;
function fieldLines(data:unknown,fields:QueryPlan['fields']){
 const labels:Record<string,string>={phone:'Téléphone',email:'Courriel',notes:'Notes enregistrées',client_provenance:'Provenance'};
 return fields.map(field=>{const value=object(data)[field];const text=Array.isArray(value)?value.slice(0,5).map(v=>object(v).content).filter(v=>typeof v==='string').join('\n'):typeof value==='string'||typeof value==='number'?String(value):'';return `${labels[field]??field} : ${text||'non renseigné'}`;}).join('\n');
}

/** Legacy classifier API delegates to the same plan used by execution. */
export function classify(question:string){
 const p=buildQueryPlan(question),q=normalize(question);
 const follow=/^(et\b|lesquell|lequell|celles?\b|ceux\b)|\b(?:la meme|les memes)\b/.test(q);
 const modes={how_to:'HOW_TO',explain:'EXPLAIN',write_denied:'WRITE_REQUEST',compare:'COMPARE',clarify:'UNKNOWN',summarize:'SUMMARY',navigate:'READ',search:'READ',read:'READ',count:'READ',aggregate:'READ'} as const;
 return {mode:follow?'FOLLOW_UP':modes[p.mode],module:p.module,action:p.action,negated:/\bne\b.*\bpas\b/.test(q)};
}
function validState(input:ChatInput,member:CRMMember,now:Date){
 const parsed=conversationState.safeParse(input.state);
 if(parsed.success&&parsed.data.memberId===member.memberId&&parsed.data.expiresAt>now.getTime()&&parsed.data.expiresAt<=now.getTime()+30*60_000&&parsed.data.turn<20)return parsed.data;
 if(input.state)return undefined;
 // Compatibility: old questions supply query hints, never resolved IDs or answer facts.
 let state:ConversationState|undefined;
 for(const turn of input.history.slice(-4)){
  const plan=buildQueryPlan(turn.question,state,now);
  if(plan.mode==='clarify'){state=undefined;continue;}
  state={version:1,memberId:member.memberId,expiresAt:now.getTime()+20*60_000,turn:1,lastPlan:plan};
 }
 return state;
}
async function execute(plan:QueryPlan,input:ChatInput,member:CRMMember,read:Read,now:Date,state?:ConversationState):Promise<Result>{
 const base=(answer:string,status:Status='SUCCESS',links:Link[]=[]):Result=>({answer,status,links,source:'crm'});
 if(plan.mode==='navigate'&&plan.target?.kind==='module'){
  if(!member.memberId||!member.authUserId||!member.brokers.includes(member.broker))return base('Cette destination n’est pas accessible avec la session courante.','FORBIDDEN');
  const target=plan.target,entry=catalog.find(m=>m.id===target.moduleId);
  if(!entry||plan.module!==entry.id)return base('Cette destination n’est pas accessible avec la session courante.','FORBIDDEN');
  if(target.chooseSoftware)return base('Quel logiciel veux-tu ouvrir ?','CLARIFICATION',catalog.filter(m=>['software','acm','plex'].includes(m.id)).map(m=>({href:m.route,label:m.id==='software'?'Délais de promesse d’achat':m.label})));
  const href=entry.id==='calendar'&&target.view==='team'?teamCalendarPath:entry.route;
  if(!isSafeCrmNavigationPath(href))return base('Cette destination n’est pas accessible avec la session courante.','FORBIDDEN');
  return {...base(entry.id==='calendar'?target.view==='team'?"J’ouvre le calendrier de l’équipe.":"J’ouvre ton calendrier.":`J’ouvre ${entry.label}.`,'SUCCESS',[{href,label:entry.label}]),navigateTo:href};
 }
 if(plan.filters.broker&&!member.brokers.includes(plan.filters.broker))throw Error('ASSISTANT_FORBIDDEN');
 if(plan.mode==='count'&&['contact','transaction'].includes(plan.entityType)&&!plan.lookup){
  const r=await read('crm_count_records',{entity:plural[plan.entityType as 'contact'|'transaction'],active:plan.filters.active,...(plan.filters.broker||plan.filters.mine?{broker:plan.filters.broker??member.broker}:{})});
  const total=object(r.data).total;if(typeof total!=='number'||!Number.isSafeInteger(total)||total<0)throw Error('ASSISTANT_INVALID_COUNT');
  return base(`${total} ${plan.entityType==='contact'?'contact(s)':'transaction(s)'} dans le périmètre demandé.`);
 }
 if(plan.mode==='how_to'){const r=help(plan.module??(plan.action==='send'?'contacts':undefined),plan.action);return {...base(r.answer),links:r.links};}
 if(plan.mode==='write_denied')return base('Lecture seule : je peux t’expliquer les étapes, mais je ne peux pas exécuter cette modification. Aucune action n’a été effectuée.','UNSUPPORTED');
 if(plan.mode==='clarify')return base('À quelle recherche fais-tu référence ? Précise le module, la personne ou la fiche à consulter.','CLARIFICATION');
 if(plan.mode==='explain'){
  const q=normalize(input.question);
  if(/pa acceptee/.test(q))return base('Dans le CRM, PA acceptée indique qu’une promesse d’achat a été acceptée. Les conditions et échéances restent à suivre; ce n’est pas une vente finalisée.','SUCCESS',[{href:'/transactions',label:'Ouvrir Transactions'}]);
  if(/conditionnel/.test(q))return base('Le statut conditionnel indique un dossier encore soumis à des conditions. Consulte ses échéances et documents; ce statut ne confirme pas à lui seul que les conditions sont levées.');
  const r=help(plan.module,'browse');return base(r.answer,'SUCCESS',r.links);
 }
 if(plan.context!=='none'&&state?.lastPlan.module==='listings'&&plan.entityType==='deadline'&&!state.resolved)return base('Les échéances sont liées aux Transactions. Quelle transaction veux-tu consulter ?','CLARIFICATION');
 if(plan.context==='resolved_entity'){
  const ref=state?.resolved;
  if(!ref)return base('Quelle fiche veux-tu consulter ? Aucune référence unique n’a encore été résolue.','CLARIFICATION');
  const detail=await read(`crm_get_${ref.type}`,{[`${ref.type}_id`]:ref.id}),href=`/${plural[ref.type]}/${ref.id}`;
  if(object(detail.data).id!==ref.id||!detail.links.some(l=>l.href===href))throw Error('ASSISTANT_INVALID_RECORD');
  if(plan.relation){
   const relation=relationships[plan.relation as keyof typeof relationships];
   if(!relation||relation.from!==ref.type)return base('Ce lien métier n’est pas disponible dans les lectures vérifiées.','UNSUPPORTED');
   const result=relation.tool===`crm_get_${ref.type}`?detail:await read(relation.tool,{[`${ref.type}_id`]:ref.id});
   const data=object(result.data),collection=data[relation.collection],values=Array.isArray(collection)?collection.map(object):[];
   const lines=values.slice(0,5).map(r=>[r.address,[r.first_name,r.last_name].filter(Boolean).join(' '),r.title,r.folder_name,r.due_date,r.dueDate,r.status,r.visit_date,r.visit_time,r.offer_date,r.amount,r.sign_type,r.has_bac===true?'BAC':undefined,r.returned_at?'retourné':undefined].filter(v=>v!==undefined&&v!==null&&v!=='').join(' — '));
   return {...base(lines.length?lines.join('\n'):'Aucun lien enregistré dans le périmètre accessible.',lines.length?'SUCCESS':'NOT_FOUND',result.links),resolved:ref,truncated:data.truncated===true};
  }
  return {...base(plan.fields.length?fieldLines(detail.data,plan.fields):'Fiche retrouvée.','SUCCESS',detail.links),resolved:ref,...(plan.mode==='navigate'?{navigateTo:href}:{})};
 }
 if(plan.mode==='compare'){
  const candidates=input.question.replace(/^compare(?:r)?\s+(?:les (?:proprietes|propriétés|listings)\s+)?/i,'').replace(/[?]+$/,'').split(/\s+(?:et|avec|versus|vs)\s+/i);
  if(candidates.length!==2||candidates.some(s=>!/[0-9]/.test(s)))return base('Quelles deux propriétés veux-tu comparer ? Donne leurs deux adresses, séparées par « et ».','CLARIFICATION');
  const answers:string[]=[],links:Link[]=[];
  for(const candidate of candidates){const question=`Résume la propriété ${candidate}`,p=buildQueryPlan(question,undefined,now);const r=await preparePrivateContext({...input,question,context:undefined,history:[]},member,read,now,p);answers.push(assembleLocalAnswer(r));links.push(...r.links);}
  return base(answers.join('\n\n'),'SUCCESS',links);
 }
 if(plan.lookup&&['navigate','search'].includes(plan.mode)&&['contact','listing','transaction'].includes(plan.entityType))return resolveRecord({query:plan.lookup.query,section:plural[plan.entityType as keyof typeof plural],open:plan.mode==='navigate',broker:plan.filters.broker},read);
 if(plan.lookup&&['summary','coordinates','search','listings','transactions'].includes(plan.operation)&&['contact','listing','transaction'].includes(plan.entityType)){
  const result=await resolveRecord({query:plan.lookup.query,section:plural[plan.entityType as keyof typeof plural],open:false,broker:plan.filters.broker},read);
  if(!result.resolved)return result;
  const ref=result.resolved,context=`/${plural[ref.type]}/${ref.id}`;
  if(plan.fields.length){const detail=await read(`crm_get_${ref.type}`,{[`${ref.type}_id`]:ref.id});return {...result,answer:fieldLines(detail.data,plan.fields)};}
  const prepared=await preparePrivateContext({...input,context,history:[]},member,read,now,{...plan,lookup:undefined,operation:'summary'});
  return {...result,answer:assembleLocalAnswer(prepared)};
 }
 const capability=moduleCapability(plan);
 if(capability&&!capability.tools.length)return base(`${capability.help}\nLa lecture des données de ce module n’est pas encore disponible dans l’Assistant.`,'UNSUPPORTED',[{href:capability.route,label:capability.label}]);
 const prepared=await preparePrivateContext(input,member,read,now,plan);
 return {...base(assembleLocalAnswer(prepared),prepared.status??'SUCCESS',prepared.links),truncated:prepared.truncated};
}
/** Single pipeline: parse → validate → authorize → execute → structured result. */
export async function answerConversation(input:ChatInput,member:CRMMember,read:Read,now=new Date()){
 const started=performance.now();let state=validState(input,member,now),calls=0,planningMs=0,readingMs=0;
 const bounded:Read=async(name,args)=>{if(++calls>8)throw Error('ASSISTANT_TOOL_LIMIT');const start=performance.now();try{return await read(name,args);}finally{readingMs+=performance.now()-start;}};
 const parts=input.question.split(/\?\s*(?=\S)/).map(s=>s.trim()).filter(Boolean);
 if(parts.length>2)return {answer:'Pose au plus deux questions à la fois pour garder une réponse précise.',links:[] as Link[],source:'crm',status:'CLARIFICATION',toolCount:0,navigateTo:undefined,state:undefined,mode:undefined,module:undefined};
 const answers:Result[]=[];let lastPlan:QueryPlan|undefined;
 for(const question of parts.length?parts:[input.question]){
  const planningStart=performance.now(),plan=queryPlan.parse(buildQueryPlan(question,state,now));planningMs+=performance.now()-planningStart;lastPlan=plan;
  const result=await execute(plan,{...input,question},member,bounded,now,state);answers.push(result);
  state={version:1,memberId:member.memberId,expiresAt:now.getTime()+20*60_000,turn:Math.min(20,(state?.turn??0)+1),lastPlan:plan,...(result.resolved?{resolved:result.resolved}:plan.context!=='none'&&state?.resolved?{resolved:state.resolved}:{})};
 }
 const links=[...new Map(answers.flatMap(a=>a.links).map(l=>[l.href,l])).values()].slice(0,10);
 const navigation=answers.length===1?answers[0].navigateTo:undefined;
 return queryResult.parse({answer:answers.map(a=>a.answer).join('\n\n').slice(0,6000),links,source:'crm',status:answers.find(a=>a.status!=='SUCCESS')?.status??'SUCCESS',
  ...(navigation&&isSafeCrmNavigationPath(navigation)?{navigateTo:navigation}:{}),state,
  coverage:{truncated:answers.some(a=>a.truncated),candidateCount:answers.reduce((n,a)=>n+(a.candidateCount??0),0)},
  timing:{planningMs,readingMs,totalMs:performance.now()-started},
  mode:lastPlan?.mode,module:lastPlan?.module,toolCount:calls});
}
