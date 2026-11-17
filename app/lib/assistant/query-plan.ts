import {z} from 'zod';
import {recognizeIntent,normalize} from './intents';
import {parseRecordRequest,recordPath} from './record-request';

export const entityType=z.enum(['contact','listing','transaction','expense','deadline','inventory','mortgage_referral','unknown']);
export const moduleId=z.enum(['contacts','listings','transactions','accounting','inventory','mortgage','calendar','drive','emails','statistics','software','settings']);
export const queryPlan=z.strictObject({
 version:z.literal(1),
 operation:z.enum(['sellers','listings','transactions','summary','conditions','deadlines','urgent','followups','inventory','search','relation','coordinates','write','unknown','accounting','mortgage']),
 accountingMode:z.enum(['latest','expenses','payment','invoice','paid_total']),
 mode:z.enum(['navigate','search','read','summarize','count','aggregate','compare','how_to','explain','clarify','write_denied']),
 module:moduleId.optional(),entityType,
 lookup:z.strictObject({query:z.string().max(160),kind:z.enum(['name','address','text'])}).optional(),
 filters:z.strictObject({broker:z.enum(['maxime','sandrine','france']).optional(),mine:z.boolean(),active:z.boolean(),listingStatus:z.enum(['all','active','upcoming','offers','conditional','closed']).optional(),purpose:z.enum(['sale','rental']).optional(),
  period:z.enum(['all','today','tomorrow','next_week','overdue','month','year']),year:z.number().int().min(1900).max(2200).optional(),month:z.number().int().min(1).max(12).optional(),payment:z.enum(['all','paid','unpaid'])}),
 relation:z.enum(['contact_listings','contact_transactions','transaction_contacts','transaction_deadlines','transaction_drive','listing_owners','listing_transactions','listing_visits','listing_offers','listing_signs']).optional(),
 fields:z.array(z.enum(['name','address','price','status','phone','email','notes','date','amount','broker','client_provenance','next_follow_up_date'])).max(8),
 sort:z.enum(['default','latest','price_desc']),
 context:z.enum(['none','previous_query','resolved_entity']),
 action:z.enum(['browse','create','delete','edit','send','connect','visits','accepted-pa','save']),
});
export type QueryPlan=z.infer<typeof queryPlan>;
export const conversationState=z.strictObject({version:z.literal(1),memberId:z.string().max(100),expiresAt:z.number(),turn:z.number().int().min(1).max(20),
 lastPlan:queryPlan,resolved:z.strictObject({type:z.enum(['contact','listing','transaction']),id:z.uuid()}).optional()});
export type ConversationState=z.infer<typeof conversationState>;
export const resultStatus=z.enum(['SUCCESS','CLARIFICATION','AMBIGUOUS','NOT_FOUND','FORBIDDEN','UNSUPPORTED','TECHNICAL_ERROR']);
export const queryResult=z.strictObject({
 answer:z.string().max(6000),source:z.literal('crm'),status:resultStatus,
 links:z.array(z.strictObject({href:z.string().max(150).refine(v=>recordPath(v)||/^\/(contacts|listings|transactions|accounting|sign-inventory|mortgage-referrals|calendar|drive|automatic-emails|statistics|settings|logiciels\/generateur-courriel)$/.test(v)),label:z.string().max(400)})).max(10),
 navigateTo:z.string().refine(recordPath).optional(),state:conversationState.optional(),
 coverage:z.strictObject({truncated:z.boolean(),candidateCount:z.number().int().min(0)}).optional(),
 timing:z.strictObject({planningMs:z.number().nonnegative(),readingMs:z.number().nonnegative(),totalMs:z.number().nonnegative()}).optional(),
 mode:queryPlan.shape.mode.optional(),module:moduleId.optional(),toolCount:z.number().int().min(0).max(8),
}).superRefine((r,ctx)=>{if(r.navigateTo&&(r.status!=='SUCCESS'||!r.links.some(l=>l.href===r.navigateTo)))ctx.addIssue({code:'custom',message:'Unverified navigation'});});

const moduleRules:[z.infer<typeof moduleId>,RegExp][]=[['mortgage',/hypothec/],['inventory',/pancart|\bbac\b|inventaire|stock/],['accounting',/comptabil|depense|facture|paiement|montant|fournisseur/],['settings',/connect.*google|google.*connect|parametre/],['calendar',/calendrier|agenda/],['emails',/campagne|courriels auto/],['drive',/\bdrive\b/],['statistics',/statistique/],['software',/logiciel|generateur|calculatrice/],['transactions',/transaction|dossier|\bpa\b/],['listings',/listing|propriete|inscription|maison/],['contacts',/contact|client/]];
const types:Partial<Record<z.infer<typeof moduleId>,QueryPlan['entityType']>>={contacts:'contact',listings:'listing',transactions:'transaction',accounting:'expense',inventory:'inventory',mortgage:'mortgage_referral'};
/** One bounded local plan. The legacy lexical analyser supplies concepts, never tool names or permissions. */
export function buildQueryPlan(question:string,previous?:ConversationState,now=new Date()):QueryPlan{
 const q=normalize(question).replace(/[’']/g,' '),lex=recognizeIntent(question),rawRecord=parseRecordRequest(question);
 const record=rawRecord&&!rawRecord.open&&!lex.entity&&['listings','transactions','accounting','inventory','deadlines','followups'].includes(lex.intent)?undefined:rawRecord;
 const fieldRequest=question.match(/(?:t[ée]l[ée]phone|courriel|email|notes|coordonn[ée]es|provenance)\s+(?:de\s+|du\s+|d['’])(.+?)[?.!]*$/i);
 let module=record?.section??moduleRules.find(([,r])=>r.test(q))?.[0];
 if(record&&!module&&!/\d/.test(record.query))module='contacts';
 const action:QueryPlan['action']=/supprim|effac/.test(q)?'delete':/modifi|corrig/.test(q)?'edit':/connect/.test(q)?'connect':/envo/.test(q)?'send':/visite/.test(q)?'visits':/pa acceptee/.test(q)&&/cre|transaction/.test(q)?'accepted-pa':/cre|ajout|nouveau/.test(q)?'create':/enregistr/.test(q)?'save':'browse';
 const how=/\bcomment\b|explique.*(?:faire|enregistr|creer)|(?:ou|etapes|procedure|marche a suivre).*(?:modifi|cre|ajout|supprim|envo|consulter)|(?:je ne trouve pas|je cherche).*(?:ou|bouton)/.test(q);
 const write=/\b(?:cree|creer|supprime|supprimer|ajoute|ajouter|modifie|modifier|envoie|envoyer|efface|finalise|paye|marque|enregistre)\b/.test(q);
 const pronoun=/\b(?:sa fiche|son dossier|ses listings|ses proprietes|ses transactions|ses echeances|ses contacts|ses clients|ses documents|ses notes|son telephone|son courriel|ses visites|ses offres|ses pancartes|ses proprietaires)\b/.test(q)||/^ouvre[- ](?:la|le)[?.! ]*$/.test(q);
 const explicitMention=!!record?.query&&!/^(?:sa fiche|son dossier|la|le)$/.test(normalize(record.query));
 const follow=/^(?:et\b|lesquell|lequell|celles?\b|ceux\b|les plus\b)|\b(?:la meme|les memes)\b/.test(q)||(pronoun&&!explicitMention);
 const deniedNegation=write&&/\b(?:ne|n )\b.*\b(?:pas|jamais|rien)\b/.test(q);
 let mode:QueryPlan['mode']=how?'how_to':/c est quoi|qu est ce|que signifie|explique|definition/.test(q)?'explain':deniedNegation?'clarify':write?'write_denied':/\bcompar/.test(q)?'compare':record?.open?'navigate':lex.count?'count':lex.accountingMode==='paid_total'?'aggregate':lex.intent==='summary'?'summarize':record?'search':lex.intent!=='unknown'?'read':'clarify';
 let entity=module?types[module]??'unknown':'unknown';
 if(['conditions','deadlines','urgent'].includes(lex.intent))entity='deadline';
 const period:QueryPlan['filters']['period']=/semaine prochaine/.test(q)?'next_week':/retard/.test(q)?'overdue':/demain/.test(q)?'tomorrow':/aujourd/.test(q)?'today':/ce mois|mois courant/.test(q)?'month':/cette annee|annee courante/.test(q)?'year':'all';
 const filters:QueryPlan['filters']={broker:lex.broker as QueryPlan['filters']['broker'],mine:!record&&(/\b(?:mes|mon|ma)\b/.test(q)||lex.intent==='followups'&&/dois.je/.test(q)),active:lex.active,period,payment:lex.unpaid?'unpaid':/\bpaye/.test(q)?'paid':'all'};
 if(record)filters.broker=undefined; // A person's name may itself be France or Maxime.
 if(module==='listings'&&!record){filters.listingStatus=/vendu|loue/.test(q)?'closed':/conditionnel/.test(q)?'conditional':/offres?/.test(q)?'offers':/a venir/.test(q)?'upcoming':lex.active?'active':'all';filters.purpose=/location|a louer/.test(q)?'rental':/a vendre/.test(q)?'sale':undefined;}
 if(period==='month'||period==='year'){const d=new Intl.DateTimeFormat('fr-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit'}).format(now);const parts=d.match(/\d+/g)!;filters.year=Number(parts[0]);if(period==='month')filters.month=Number(parts[1]);}
 let lookup=record?{query:record.query,kind:(module==='contacts'?'name':/\d/.test(record.query)?'address':'text') as 'name'|'address'|'text'}:lex.entity&&lex.entity.length<=160?{query:lex.entity,kind:'text' as const}:undefined;
 if(record&&!record.query){lookup=undefined;mode='clarify';}
 if(fieldRequest&&!['how_to','write_denied','explain'].includes(mode)){
  const extracted=parseRecordRequest(`trouve ${fieldRequest[1]}`);
  if(extracted){module=extracted.section??module??'contacts';entity=types[module]??'unknown';lookup={query:extracted.query,kind:module==='contacts'?'name':'text'};mode='read';}
 }
 if(module==='listings'&&!record&&lookup){const query=lookup.query.replace(/\b(?:vendus?|lou[ée]s?|conditionnelles?|conditionnels?|offres?|venir|vente|location|vendre|louer)\b/gi,'').trim();lookup=query?{...lookup,query}:undefined;}
 if(module==='accounting'){
  if(!['how_to','write_denied','explain'].includes(mode))mode='read';
  const months=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
  const explicit=q.match(new RegExp(`\\b(${months.join('|')})\\s+(20\\d{2})\\b`));
  if(explicit){filters.period='month';filters.year=Number(explicit[2]);filters.month=months.indexOf(explicit[1])+1;}
  const year=q.match(/\b(?:en|annee)\s+(20\d{2})\b/);if(!explicit&&year){filters.period='year';filters.year=Number(year[1]);}
  let entity=lex.entity.replace(/\b(?:ce mois|mois courant|cette ann[ée]e|ann[ée]e courante|mois|courant|ann[ée]e|total|totales?|non)\b/gi,'').replace(/\s+/g,' ').trim();
  if(explicit)entity=entity.split(/\s+/).filter(t=>normalize(t)!==explicit[1]&&t!==explicit[2]).join(' ');else if(year)entity=entity.replace(year[1],'').trim();
  lookup=entity?{query:entity,kind:'text'}:undefined;
  if(mode==='read'&&/\btotal|combien.*(?:depens|paye)/.test(q))mode='aggregate';
 }
 let relation:QueryPlan['relation'];
 let context:QueryPlan['context']='none';
 if(follow&&!['write_denied','how_to','explain'].includes(mode)&&!deniedNegation){
  context=pronoun?'resolved_entity':'previous_query';
  if(!previous)mode='clarify';
  else{
   module=module??previous.lastPlan.module;entity=module?types[module]??entity:entity;
   Object.assign(filters,previous.lastPlan.filters,{...(/\b(maxime|france|sandrine)\b/.test(q)?{broker:q.match(/\b(maxime|france|sandrine)\b/)![1],mine:false}:{}),...(period!=='all'?{period}: {})});
   lookup=previous.lastPlan.lookup;mode=previous.lastPlan.mode==='how_to'?'how_to':/ouvr/.test(q)?'navigate':previous.lastPlan.mode==='navigate'?'read':previous.lastPlan.mode;
   if(/condition|echeance|demain|semaine prochaine/.test(q)){entity='deadline';module='transactions';lookup=undefined;mode='read';}
   if(pronoun&&previous.resolved){
    lookup=undefined;
    if(previous.resolved.type==='contact')relation=/transaction/.test(q)?'contact_transactions':/listing|propriete/.test(q)?'contact_listings':undefined;
    if(previous.resolved.type==='transaction')relation=/contact|client/.test(q)?'transaction_contacts':/echeance/.test(q)?'transaction_deadlines':/drive|document/.test(q)?'transaction_drive':undefined;
    if(previous.resolved.type==='listing')relation=/transaction/.test(q)?'listing_transactions':/visite/.test(q)?'listing_visits':/offre/.test(q)?'listing_offers':/pancart|bac/.test(q)?'listing_signs':/proprietaire|vendeur/.test(q)?'listing_owners':undefined;
    if(relation)mode='read';
   }
  }
 }
 const fields:QueryPlan['fields']=[];if(/telephone|coordonnees/.test(q))fields.push('phone');if(/courriel|email|coordonnees/.test(q))fields.push('email');if(/note/.test(q))fields.push('notes');if(/provenance/.test(q))fields.push('client_provenance');
 const operation=fieldRequest?'coordinates':follow&&previous?(entity==='deadline'?/condition/.test(q)?'conditions':previous.lastPlan.operation==='conditions'?'conditions':'deadlines':previous.lastPlan.operation):lex.intent;
 if(!lookup&&mode==='search')mode='clarify';
 return queryPlan.parse({version:1,operation,accountingMode:lex.accountingMode,mode,module,entityType:entity,lookup,filters,relation,fields,sort:/plus cher|plus couteu/.test(q)?'price_desc':/dernier|derniere/.test(q)?'latest':'default',context,action:follow&&previous?.lastPlan.mode==='how_to'?previous.lastPlan.action:action});
}
