import type {ChatInput} from './policy';
import {normalize,recognizeIntent} from './intents';
import {help,modules,type Module} from './knowledge';
import {preparePrivateContext,assembleLocalAnswer} from './privacy';
type Mode='HOW_TO'|'READ'|'EXPLAIN'|'SUMMARY'|'COMPARE'|'WRITE_REQUEST'|'FOLLOW_UP'|'UNKNOWN';
type State={module?:Module;question?:string;broker?:string;mode?:Mode;action?:string};
const moduleRules:[Module,RegExp][]=[['mortgage',/hypothec/],['inventory',/pancart|\bbac\b|inventaire|stock/],['accounting',/comptabil|depense|facture|paiement|montant|fournisseur/],['settings',/connect.*google|google.*connect|parametre/],['calendar',/calendrier|agenda/],['emails',/campagne|courriels auto/],['drive',/\bdrive\b/],['software',/logiciel|generateur|calculatrice/],['transactions',/transaction|dossier|\bpa\b/],['listings',/listing|propriete|inscription|maison/],['contacts',/contact|client/]];
export function classify(question:string){
 const q=normalize(question).replace(/[’']/g,' ');
 const module=moduleRules.find(([,r])=>r.test(q))?.[0];
 const action=/supprim|effac/.test(q)?'delete':/modifi|corrig/.test(q)?'edit':/connect/.test(q)?'connect':/envo/.test(q)?'send':/visite/.test(q)?'visits':/pa acceptee/.test(q)&&/cre|transaction/.test(q)?'accepted-pa':/cre|ajout|nouveau/.test(q)?'create':/enregistr/.test(q)?'save':'browse';
 const instructional=/\bcomment\b|explique.*(?:faire|enregistr|creer)|(?:ou|etapes|procedure|marche a suivre).*(?:modifi|cre|ajout|supprim|envo|consulter)|(?:je ne trouve pas|je cherche).*(?:ou|bouton)/.test(q);
 const explain=/c est quoi|qu est ce|que signifie|explique|definition/.test(q);
 const execute=/\b(?:cree|creer|supprime|supprimer|ajoute|ajouter|modifie|modifier|envoie|envoyer|efface|finalise|paye|marque|enregistre)\b/.test(q);
 const negated=/\b(?:ne|n )\b.*\b(?:pas|jamais|rien)\b/.test(q)&&!instructional;
 const mode:Mode=instructional?'HOW_TO':explain?'EXPLAIN':negated&&execute?'UNKNOWN':execute?'WRITE_REQUEST':/\bcompar/.test(q)?'COMPARE':/^(et\b|lesquell|lequell|celles?\b|ceux\b)|\b(?:la meme|les memes)\b/.test(q)?'FOLLOW_UP':recognizeIntent(question).intent==='summary'?'SUMMARY':recognizeIntent(question).intent!=='unknown'?'READ':'UNKNOWN';
 return {mode,module,action,negated};
}
function contextualize(question:string,state:State){
 const c=classify(question),q=normalize(question);
 const broker=q.match(/\b(maxime|france|sandrine)\b/)?.[1];
 if(c.mode!=='FOLLOW_UP')return {effective:question,state:{module:c.module,question,broker:recognizeIntent(question).broker,mode:c.mode,action:c.action} as State};
 if(!state.question)return {clarification:'À quelle recherche précédente fais-tu référence ? Précise le module ou la fiche.',state:{}};
 if(state.mode==='HOW_TO')return {effective:`Comment ${state.action==='create'?'ajouter':state.action==='delete'?'supprimer':state.action==='edit'?'modifier':'consulter'} ${modules[c.module??state.module??'contacts'].label} ?`,state:{...state,module:c.module??state.module}};
 if(!['READ','SUMMARY','FOLLOW_UP'].includes(state.mode??''))return {clarification:'Précise la recherche CRM à reprendre; je ne peux pas déduire ce contexte.',state:{}};
 if(/echeance|demain|semaine prochaine/.test(q)){
  if(state.module==='listings')return {clarification:'Les échéances sont liées aux Transactions. Quelle transaction veux-tu consulter ?',state};
  const b=broker??state.broker;
  const effective=`Quelles échéances ${b?`de ${b}`:''} ${q.includes('semaine prochaine')?'la semaine prochaine':q.includes('demain')?'demain':''} ?`;
  return {effective,state:{module:'transactions',broker:b,question:effective,mode:'READ'} as State};
 }
 if(broker){const effective=state.question.replace(/\b(maxime|france|sandrine)\b/gi,broker)+(!state.broker?` de ${broker}`:'');return {effective,state:{...state,question:effective,broker}};}
 return {clarification:'Veux-tu changer le courtier, la période ou consulter une fiche précise ?',state};
}
/** Rebuild only bounded semantic hints from questions. Old answers and client-supplied IDs are never evidence. */
export async function answerConversation(input:ChatInput,...args:Parameters<typeof preparePrivateContext> extends [ChatInput,...infer R]?R:never){
 let state:State={};for(const turn of input.history.slice(-4)){const resolved=contextualize(turn.question,state);state=resolved.state;}
 const parts=input.question.split(/\?\s*(?=\S)/).map(s=>s.trim()).filter(Boolean);
 if(parts.length>2)return {answer:'Pose au plus deux questions à la fois pour garder une réponse précise.',links:[],source:'crm'};
 const answers:string[]=[],links:{href:string;label:string}[]=[];
 for(const question of parts.length?parts:[input.question]){
  const resolved=contextualize(question,state);state=resolved.state;
  if(resolved.clarification){answers.push(resolved.clarification);continue;}
  const effective=resolved.effective!,c=classify(effective);
  if(c.mode==='HOW_TO'){const r=help(c.module??(c.action==='send'?'contacts':undefined),c.action);answers.push(r.answer);links.push(...r.links);continue;}
  if(c.mode==='EXPLAIN'){
   const q=normalize(effective);
   if(/pa acceptee/.test(q)){answers.push('Dans le CRM, PA acceptée indique qu’une promesse d’achat a été acceptée. Les conditions et échéances restent à suivre; ce n’est pas une vente finalisée.');links.push({href:'/transactions',label:'Ouvrir Transactions'});}
   else if(/conditionnel/.test(q)){answers.push('Le statut conditionnel indique un dossier encore soumis à des conditions. Consulte ses échéances et documents; ce statut ne confirme pas à lui seul que les conditions sont levées.');links.push({href:'/transactions',label:'Ouvrir Transactions'});}
   else {const r=help(c.module,'browse');answers.push(r.answer);links.push(...r.links);}continue;
  }
  if(c.mode==='WRITE_REQUEST'){answers.push('Lecture seule : je peux t’expliquer les étapes, mais je ne peux pas exécuter cette modification. Aucune action n’a été effectuée.');continue;}
  if(c.mode==='COMPARE'){
   const candidates=effective.replace(/^compare(?:r)?\s+(?:les (?:proprietes|propriétés|listings)\s+)?/i,'').replace(/[?]+$/,'').split(/\s+(?:et|avec|versus|vs)\s+/i);
   if(candidates.length!==2||candidates.some(s=>!/[0-9]/.test(s))){answers.push('Quelles deux propriétés veux-tu comparer ? Donne leurs deux adresses, séparées par « et ». Je peux présenter leurs prix et statuts enregistrés, sans déduire une valeur marchande.');continue;}
   for(const candidate of candidates){const prepared=await preparePrivateContext({...input,question:`Résume la propriété ${candidate}`,context:undefined,history:[]},...args);answers.push(assembleLocalAnswer(prepared));links.push(...prepared.links);}continue;
  }
  if(c.mode==='UNKNOWN'){answers.push(c.negated?'Aucune action ne sera effectuée. Quelle information veux-tu consulter ?':'Veux-tu de l’aide pour utiliser un écran ou rechercher une donnée ? Précisez le module et le renseignement voulu.');continue;}
  const prepared=await preparePrivateContext({...input,question:effective},...args);answers.push(assembleLocalAnswer(prepared));links.push(...prepared.links);
 }
 return {answer:answers.join('\n\n').slice(0,6000),links:[...new Map(links.map(l=>[l.href,l])).values()].slice(0,10),source:'crm'};
}
