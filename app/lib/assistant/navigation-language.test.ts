import {afterEach,expect,it,vi} from 'vitest';
import {answerConversation} from './conversation';
import {buildQueryPlan} from './query-plan';
import type {CRMMember} from '../auth/identity';

const id='11111111-1111-4111-8111-111111111111';
const member:CRMMember={memberId:id,identityId:id,authUserId:id,broker:'maxime',role:'broker',brokers:['maxime','france','sandrine']};
// Independent expected destinations, not imported from the implementation aliases.
const destinations=[['Accueil','/dashboard'],['Contacts','/contacts'],['Listings','/listings'],['Transactions','/transactions'],['Références hypothécaires','/mortgage-referrals'],['Calendrier','/calendar'],['Drive','/drive'],['Statistiques','/statistics'],['Comptabilité','/accounting'],['Pancartes / BAC','/sign-inventory'],['Courriels Auto','/automatic-emails'],['Paramètres','/settings'],['Générateur ACM','/logiciels/generateur-acm'],['Calculatrice Plex','/logiciels/calculatrice-plex'],['Délais de promesse d’achat','/logiciels/generateur-courriel']] as const;
const stems=["Peux-tu m'amener dans la section",'Peux tu mamener dans',"Peux-tu m'envoyer dans la page",'Va me chercher le menu','On va dans','Va donc dans','Montre-moi la section',"l’onglet"];
const navigations=destinations.flatMap(([name,route])=>stems.map(stem=>({question:`${stem} ${name}`,route})));
afterEach(()=>vi.unstubAllGlobals());
it.each(navigations)('natural grammar: $question',async({question,route})=>{
 const read=vi.fn(),external=vi.fn(()=>{throw Error('NETWORK FORBIDDEN');});vi.stubGlobal('fetch',external);
 const result=await answerConversation({requestId:id,question,history:[]},member,read);
 expect(result).toMatchObject({status:'SUCCESS',mode:'navigate',navigateTo:route,toolCount:0});expect(read).not.toHaveBeenCalled();expect(external).not.toHaveBeenCalled();
});
const safety=destinations.flatMap(([name])=>[
 {question:`Comment ouvrir ${name} ?`,mode:'how_to'},
 {question:`Pourquoi ${name} ne fonctionne pas ?`,mode:'how_to'},
 {question:`Je ne veux pas ouvrir ${name}`,mode:'clarify'},
 {question:`N'ouvre pas ${name}`,mode:'clarify'},
 {question:`Crée un dossier dans ${name}`,mode:'write_denied'},
 {question:`Supprime les données de ${name}`,mode:'write_denied'},
]);
it.each(safety)('safety: $question',async({question,mode})=>{
 const read=vi.fn();const result=await answerConversation({requestId:id,question,history:[]},member,read);
 expect(result.mode).toBe(mode);expect(result.navigateTo).toBeUndefined();expect(read).not.toHaveBeenCalled();
});
it.each(["l'onglet drive",'La comptabilité','Le calendrier','Les transactions','Non, je parle de Drive',"C’est bien Drive",'Je parlais de Drive, pas de Contacts'])('clarification and signed-state follow-up: %s',async question=>{
 const first=await answerConversation({requestId:id,question:'Peux tu mamener dans la section drive',history:[]},member,vi.fn());
 for(const context of [{state:first.state,history:[]},{history:[{question:'Peux tu mamener dans la section drive',answer:'Précise le module'}]}]){
  const result=await answerConversation({requestId:id,question,...context},member,vi.fn());
  expect(result.status).toBe('SUCCESS');expect(result.navigateTo).toBe(question.includes('comptabilité')?'/accounting':question.includes('calendrier')?'/calendar':question.includes('transactions')?'/transactions':'/drive');
 }
});
it.each(['Trouve Exemple Client','Dépenses impayées de France','Quelles échéances demain ?','Quels Listings actifs ?'])('explicit navigation replaces %s',async previous=>{
 const result=await answerConversation({requestId:id,question:'Peux tu mamener dans la section drive',history:[{question:previous,answer:'ancienne réponse'}]},member,vi.fn());
 expect(result).toMatchObject({navigateTo:'/drive',toolCount:0});expect(result.state?.lastPlan.context).toBe('none');expect(result.state?.lastPlan.lookup).toBeUndefined();
});
it.each(['Ouvre Drive ou Contacts','Va dans Calendrier ou Comptabilité','Montre la section Drive et Contacts'])('multiple destinations stay a choice: %s',async question=>{
 const result=await answerConversation({requestId:id,question,history:[]},member,vi.fn());
 expect(result.status).toBe('AMBIGUOUS');expect(result.navigateTo).toBeUndefined();expect(result.links).toHaveLength(2);
});
it.each(['Trouve le dossier Drive du 1010 Exemple',"J’aimerais voir mes dossiers Drive",'Ouvre la fiche de Exemple Drive','Ouvre la Transaction du 147 Exemple','Ouvre https://evil.test','Ouvre Drive puis supprime les contacts','Envoyer mes contacts'])('record/read/unsafe suffix is never module navigation: %s',question=>{
 expect(buildQueryPlan(question).target?.kind).not.toBe('module');
});
it.each(['Peux tu mamener dans la section drive',"l'onglet Contacts",'Va dans ma comptabilité'])('membership required: %s',async question=>{
 const read=vi.fn();const result=await answerConversation({requestId:id,question,history:[]},{...member,brokers:[]},read);
 expect(result.status).toBe('FORBIDDEN');expect(result.navigateTo).toBeUndefined();expect(read).not.toHaveBeenCalled();
});
it('benchmark contains at least 200 distinct inputs across positive and safety families',()=>expect(new Set([...navigations,...safety].map(c=>c.question)).size).toBeGreaterThanOrEqual(200));
it.each([
 ['Amène moi au Drive','/drive'],['Amène-moi à mon calendrier','/calendar'],['Va dans ma comptabilité','/accounting'],
 ['Je veux aller dans mon Drive','/drive'],['Peut tu ouvrir les paramètres','/settings'],['Ammene moi vers Contacts','/contacts'],
 ['Emmenne moi sur la page Statistiques','/statistics'],['SVP ouvre le menu Courriels Auto','/automatic-emails'],
 ['Pourrais-tu me montrer mon espace Comptabilité ?','/accounting'],["J’aimerais voir la page Listings",'/listings'],
 ['Ouvre la section du calendrier','/calendar'],
])('dictation and minor grammar: %s',async(question,route)=>{
 const result=await answerConversation({requestId:id,question,history:[]},member,vi.fn());expect(result.navigateTo).toBe(route);
});
