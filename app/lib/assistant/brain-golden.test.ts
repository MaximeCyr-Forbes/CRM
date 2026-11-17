import {describe,it,expect,vi} from 'vitest';
import {buildQueryPlan,queryPlan,type ConversationState} from './query-plan';
import {answerConversation} from './conversation';
import type {CRMMember} from '../auth/identity';
const id='11111111-1111-4111-8111-111111111111';
const member:CRMMember={memberId:id,identityId:id,authUserId:id,broker:'maxime',role:'broker',brokers:['maxime','france','sandrine']};
const input=(question:string,state?:ConversationState)=>({requestId:id,question,history:[],state});
// Entirely synthetic names. Composition crosses grammar, punctuation, particles and accent boundaries.
const names=[['Éloïse','Exemple'],['Jean-Pierre','Du Test'],['Anaïs','De la Rivière'],['Noémie','D’Essai'],['Léo','Témoin'],['Zoé','Saint-Exemple'],['Maëlle','Du Pont'],['André','L’Échantillon'],['Éric','Banc Test'],['Renée','Spécimen']];
const commands=['Ouvre la fiche de','Peux-tu ouvrir la fiche de','Pourrais-tu ouvrir la fiche de','Je voudrais ouvrir la fiche de','Montre-moi la fiche de','Consulter la fiche de'];
const suffixes=['',' dans mes contacts',' parmi mes clients',' dans le CRM',' dans les Contacts'];
const golden=names.flatMap(([first,last])=>commands.flatMap(command=>suffixes.map(suffix=>({question:`${command} ${first} ${last}${suffix} ?`,first,last}))));
describe('300 golden record queries — plan, isolated tool, resolution and navigation',()=>{
 it.each(golden)('$question',async({question,first,last})=>{
  const href=`/contacts/${id}`,label=`${first} ${last}`;
  const read=vi.fn(async(name:string)=>({data:name==='crm_search_contacts'?{data:[{id,first_name:first,last_name:last}],nextPage:null}:{id,first_name:first,last_name:last},links:[{href,label}]}));
  const plan=buildQueryPlan(question);expect(queryPlan.safeParse(plan).success).toBe(true);
  expect(plan).toMatchObject({mode:'navigate',module:'contacts',entityType:'contact',lookup:{query:label.replace(/’/g,"'"),kind:'name'}});
  const result=await answerConversation(input(question),member,read);
  expect(result).toMatchObject({status:'SUCCESS',navigateTo:href,state:{resolved:{type:'contact',id}}});
  expect(read.mock.calls.map(c=>c[0])).toEqual(['crm_search_contacts','crm_get_contact']);
 });
});
it('golden dataset has 300 distinct queries',()=>expect(new Set(golden.map(c=>c.question)).size).toBe(300));
it.each(['contact','listing','transaction'] as const)('explicit %s never queries another entity',async type=>{
 const section=type==='contact'?'contacts':type==='listing'?'listings':'transactions',name=type==='contact'?'Éloïse Exemple':'123 Rue Exemple',href=`/${section}/${id}`;
 const read=vi.fn(async(tool:string)=>({data:tool.includes('search')?{data:[{id,first_name:'Éloïse',last_name:'Exemple',address:name}]}:{id},links:[{href,label:name}]}));
 const result=await answerConversation(input(`Ouvre la fiche ${type} de ${name}`),member,read);
 expect(result.navigateTo).toBe(href);expect(read.mock.calls.map(c=>c[0])).toEqual([`crm_search_${section}`,`crm_get_${type}`]);
});
it.each(['HIGH_CONFIDENCE','AMBIGUOUS','NO_MATCH'] as const)('never auto-navigates uncertain resolution %s',async kind=>{
 const records=kind==='NO_MATCH'?[]:Array.from({length:kind==='AMBIGUOUS'?2:1},()=>({id,first_name:'Éloïse',last_name:'Exemple'}));
 const read=vi.fn(async(tool:string)=>({data:tool.includes('search')?{data:records}:{id},links:records.length?[{href:`/contacts/${id}`,label:'Éloïse Exemple'}]:[]}));
 const result=await answerConversation(input('Ouvre la fiche contact de Éloïse'),member,read);expect(result.navigateTo).toBeUndefined();
 if(kind==='NO_MATCH')expect(result.status).toBe('NOT_FOUND');if(kind==='AMBIGUOUS')expect(result.status).toBe('AMBIGUOUS');
});
it('multi-turn resolves then rechecks the reference and follows an official relation',async()=>{
 const href=`/contacts/${id}`;
 const read=vi.fn(async(tool:string)=>({data:tool==='crm_search_contacts'?{data:[{id,first_name:'Éloïse',last_name:'Exemple'}]}:tool==='crm_get_contact_listings'?{listings:[]}:{id},links:[{href,label:'Contact synthétique'}]}));
 const first=await answerConversation(input('Trouve le contact Éloïse Exemple'),member,read);
 expect(first.state?.resolved?.id).toBe(id);read.mockClear();
 const second=await answerConversation(input('Et ses propriétés ?',first.state),member,read);
 expect(second.status).toBe('NOT_FOUND');expect(read.mock.calls.map(c=>c[0])).toEqual(['crm_get_contact','crm_get_contact_listings']);
 read.mockClear();const third=await answerConversation(input('Ouvre sa fiche',second.state),member,read);
 expect(third.navigateTo).toBe(href);expect(read).toHaveBeenCalledTimes(1);
});
it.each(['expired','member','excessive'] as const)('invalid %s state cannot authorize a reference',async reason=>{
 const state:ConversationState={version:1,memberId:reason==='member'?'someone-else':id,turn:reason==='excessive'?20:1,expiresAt:reason==='expired'?0:Date.now()+60_000,lastPlan:buildQueryPlan('Trouve le contact Éloïse Exemple'),resolved:{type:'contact',id}};
 const read=vi.fn();const result=await answerConversation(input('Ouvre sa fiche',state),member,read);expect(result.status).toBe('CLARIFICATION');expect(read).not.toHaveBeenCalled();
});
it('permissions are rechecked even for structurally valid state',async()=>{
 const state:ConversationState={version:1,memberId:id,turn:1,expiresAt:Date.now()+60_000,lastPlan:buildQueryPlan('Trouve le contact Éloïse Exemple'),resolved:{type:'contact',id}};
 const read=vi.fn().mockRejectedValue(Error('FORBIDDEN'));await expect(answerConversation(input('Ouvre sa fiche',state),member,read)).rejects.toThrow('FORBIDDEN');
});
it.each(['Supprime les contacts','Envoie un courriel','Finalise la transaction','Ajoute une dépense','Modifie le stock'])('write request blocked: %s',async question=>{const read=vi.fn();const r=await answerConversation(input(question),member,read);expect(r.status).toBe('UNSUPPORTED');expect(read).not.toHaveBeenCalled();});
it.each(['contacts','transactions'])('exact count for %s does not use an excerpt',async module=>{const read=vi.fn().mockResolvedValue({data:{total:73},links:[]});const r=await answerConversation(input(`Combien de ${module} ?`),member,read);expect(r.answer).toContain('73');expect(read).toHaveBeenCalledWith('crm_count_records',{entity:module,active:false});});
it('read error never becomes NOT_FOUND',async()=>{const read=vi.fn().mockRejectedValue(Error('READ_FAILURE'));await expect(answerConversation(input('Ouvre la fiche Éloïse Exemple dans mes contacts'),member,read)).rejects.toThrow('READ_FAILURE');});
it('plan rejects arbitrary tools, SQL and unknown input keys',()=>{const plan=buildQueryPlan('Quels Listings sont actifs ?');expect(queryPlan.safeParse({...plan,sql:'select anything'}).success).toBe(false);expect(queryPlan.safeParse({...plan,mode:'delete'}).success).toBe(false);});
const brokerCases=(['maxime','france','sandrine'] as const).flatMap(broker=>[
 {question:`Quels Listings de ${broker} sont actifs ?`,tool:'crm_get_active_broker_listings',args:{broker},data:{total:7,listings:[],truncated:true}},
 {question:`Quels Listings de ${broker} sont vendus ?`,tool:'crm_get_broker_listings',args:{broker,status:'closed'},data:{total:2,listings:[]}},
 {question:`Quels Listings de ${broker} sont conditionnels ?`,tool:'crm_get_broker_listings',args:{broker,status:'conditional'},data:{total:2,listings:[]}},
 {question:`Quelles transactions de ${broker} sont actives ?`,tool:'crm_get_active_broker_transactions',args:{broker},data:{transactions:[]}},
 {question:`Combien de contacts de ${broker} ?`,tool:'crm_count_records',args:{broker,entity:'contacts',active:false},data:{total:42}},
 {question:`Combien de transactions actives de ${broker} ?`,tool:'crm_count_records',args:{broker,entity:'transactions',active:true},data:{total:42}},
 ...(['demain','en retard','la semaine prochaine'] as const).map(period=>({question:`Quelles échéances de ${broker} ${period} ?`,tool:'crm_get_private_deadlines',args:{broker,conditions:false,from:period==='demain'?'2026-11-18':period==='en retard'?'1900-01-01':'2026-11-23',to:period==='demain'?'2026-11-18':period==='en retard'?'2026-11-16':'2026-11-29'},data:{data:[],truncated:false}})),
]);
it.each(brokerCases)('golden business scope: $question',async({question,tool,args,data})=>{
 const read=vi.fn().mockResolvedValue({data,links:[]});const r=await answerConversation(input(question),member,read,new Date('2026-11-17T12:00:00Z'));
 expect(read).toHaveBeenCalledTimes(1);expect(read).toHaveBeenCalledWith(tool,args);expect(r.navigateTo).toBeUndefined();
});
it.each(['contact','listing','transaction','dépense','pancarte','référence hypothécaire','calendrier','Drive','campagne','statistiques','logiciel','paramètres'])('golden help remains a guide without reads: %s',async entity=>{
 const read=vi.fn();const r=await answerConversation(input(`Comment consulter ${entity} ?`),member,read);expect(read).not.toHaveBeenCalled();expect(r.links).toHaveLength(1);expect(r.navigateTo).toBeUndefined();
});
it.each(['ce mois','novembre 2026','en 2026'])('golden accounting period: %s',async period=>{
 const read=vi.fn().mockResolvedValue({data:{total:123,data:[],explanation:'Total vérifié'},links:[]});
 await answerConversation(input(`Total des dépenses ${period}`),member,read,new Date('2026-11-17T12:00:00Z'));
 expect(read).toHaveBeenCalledWith('crm_query_accounting',{query:'',mode:'expenses',unpaid:false,aggregate:true,from:period==='en 2026'?'2026-01-01':'2026-11-01',to:period==='en 2026'?'2026-12-31':'2026-11-30'});
});
it('broker → conditions → tomorrow preserves structured filters past four turns',async()=>{
 const read=vi.fn().mockResolvedValue({data:{transactions:[],data:[],total:0},links:[]});let state:ConversationState|undefined;
 for(const question of ['Quelles transactions sont actives ?','Et celles de France ?','Et celles de Sandrine ?','Et celles de Maxime ?','Et celles de France ?','Lesquelles ont des conditions ?','Et demain ?']){const r=await answerConversation(input(question,state),member,read,new Date('2026-11-17T12:00:00Z'));state=r.state;}
 expect(read).toHaveBeenLastCalledWith('crm_get_private_deadlines',{broker:'france',from:'2026-11-18',to:'2026-11-18',conditions:true});
});
it('new write command cannot inherit a previous navigation mode',async()=>{
 const read=vi.fn();const state:ConversationState={version:1,memberId:id,expiresAt:Date.now()+60000,turn:1,lastPlan:buildQueryPlan('Ouvre le contact Éloïse Exemple'),resolved:{type:'contact',id}};
 const r=await answerConversation(input('Et supprime sa fiche',state),member,read);expect(r.status).toBe('UNSUPPORTED');expect(read).not.toHaveBeenCalled();
});
it('partial suggestion cannot become an automatically resolved reference on the next turn',async()=>{
 const read=vi.fn(async(tool:string)=>({data:tool.includes('search')?{data:[{id,first_name:'Éloïse',last_name:'Exemple'}]}:{id},links:[{href:`/contacts/${id}`,label:'Éloïse Exemple'}]}));
 const first=await answerConversation(input('Trouve Éloïse'),member,read);expect(first.state?.resolved).toBeUndefined();read.mockClear();
 const next=await answerConversation(input('Ouvre sa fiche',first.state),member,read);expect(next.status).toBe('CLARIFICATION');expect(read).not.toHaveBeenCalled();
});
it('sorting follow-up keeps broker and active filter',async()=>{
 const read=vi.fn().mockResolvedValue({data:{total:2,listings:[{id,address:'Exemple',askingPrice:500000}]},links:[]});let state:ConversationState|undefined;
 for(const question of ['Quels Listings de Sandrine sont actifs ?','Et ceux de Maxime ?','Les plus chères ?'])state=(await answerConversation(input(question,state),member,read)).state;
 expect(read).toHaveBeenLastCalledWith('crm_get_active_broker_listings',{broker:'maxime',sort:'price_desc'});
});
it.each(['Quel est le téléphone de Éloïse Exemple ?','Quel est le courriel d’Éloïse Exemple ?','Montre les coordonnées du contact Éloïse Exemple'])('golden authorized field read: %s',async question=>{
 const href=`/contacts/${id}`;const read=vi.fn(async(tool:string)=>({data:tool==='crm_search_contacts'?{data:[{id,first_name:'Éloïse',last_name:'Exemple'}]}:{id,email:'synthetic@example.test',phone:'555-0100'},links:[{href,label:'Exemple'}]}));
 const r=await answerConversation(input(question),member,read);expect(r.status).toBe('SUCCESS');expect(r.answer).toMatch(/555-0100|synthetic@example.test/);expect(r.navigateTo).toBeUndefined();expect(read.mock.calls[0][0]).toBe('crm_search_contacts');
});
it('name before action and bare name with module are grammatical equivalents',()=>{
 expect(buildQueryPlan('Éloïse Exemple, ouvre sa fiche contact')).toMatchObject({mode:'navigate',lookup:{query:'Éloïse Exemple'}});
 expect(buildQueryPlan('Éloïse Exemple dans mes contacts')).toMatchObject({mode:'search',lookup:{query:'Éloïse Exemple'}});
});
it('bounded parser performance over synthetic golden inputs',()=>{
 const timings:number[]=[];
 for(const {question} of golden){const started=performance.now();buildQueryPlan(question);timings.push(performance.now()-started);}
 timings.sort((a,b)=>a-b);const p95=timings[Math.ceil(timings.length*.95)-1];
 expect(p95).toBeLessThan(25);console.info('assistant_parser_benchmark',{samples:timings.length,p95Ms:Number(p95.toFixed(3)),maxMs:Number(timings.at(-1)!.toFixed(3))});
});
