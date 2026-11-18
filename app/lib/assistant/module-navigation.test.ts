import {expect,it,vi} from 'vitest';
import {existsSync} from 'node:fs';
import {catalog,isSafeCrmNavigationPath} from './catalog';
import {buildQueryPlan,queryResult} from './query-plan';
import {answerConversation} from './conversation';
import type {CRMMember} from '../auth/identity';
const id='11111111-1111-4111-8111-111111111111';
const member:CRMMember={memberId:id,identityId:id,authUserId:id,broker:'maxime',role:'broker',brokers:['maxime','france','sandrine']};
const destinations=[['mon calendrier','calendar','/calendar'],['mes contacts','contacts','/contacts'],['mes Listings','listings','/listings'],['mes Transactions','transactions','/transactions'],['ma comptabilité','accounting','/accounting'],['Pancartes et BAC','inventory','/sign-inventory'],['les références hypothécaires','mortgage','/mortgage-referrals'],['Drive','drive','/drive'],['les statistiques','statistics','/statistics'],['les Courriels Auto','emails','/automatic-emails'],['les Paramètres','settings','/settings'],["l’accueil",'dashboard','/dashboard'],['ACM','acm','/logiciels/generateur-acm'],['Calculatrice Plex','plex','/logiciels/calculatrice-plex']] as const;
const commands=['Amène-moi à','Amene moi a','Va dans','Va sur','Ouvre','Affiche','Montre-moi','Dirige-moi vers','Accède à','Je veux aller à','Je veux voir','Je voudrais consulter','Retourne à','Emmène-moi sur','Peux-tu ouvrir','Pourriez-vous ouvrir'];
const variants=destinations.flatMap(([noun,module,route])=>commands.map(command=>({q:`${command} ${noun}, s’il vous plaît.`,module,route})));
it.each(variants)('module navigation: $q',async({q,module,route})=>{
 const read=vi.fn();const p=buildQueryPlan(q);expect(p).toMatchObject({mode:'navigate',module,context:'none',target:{kind:'module',moduleId:module}});
 const result=await answerConversation({requestId:id,question:q,history:[]},member,read);
 expect(result).toMatchObject({status:'SUCCESS',navigateTo:route,toolCount:0});expect(result.links).toContainEqual(expect.objectContaining({href:route}));expect(read).not.toHaveBeenCalled();
});
it.each(['Va au calendrier de l’équipe.','Montre-moi le calendrier partagé.','Ouvre l’agenda d’équipe.'])('team: %s',async question=>{const r=await answerConversation({requestId:id,question,history:[]},member,vi.fn());expect(r.navigateTo).toBe('/calendar?mode=team');});
it.each(['Trouve Claude Sauvé','Quelles dépenses de France sont impayées ?','Question ambiguë','Et celles de France ?'])('new complete command ignores previous context: %s',async question=>{
 const read=vi.fn();const r=await answerConversation({requestId:id,question:'amène moi a mon calendrier',history:[{question,answer:'Ancienne erreur'}]},member,read);
 expect(r).toMatchObject({mode:'navigate',module:'calendar',navigateTo:'/calendar',status:'SUCCESS'});expect(r.state?.lastPlan.filters.broker).toBeUndefined();expect(read).not.toHaveBeenCalled();
});
it.each([['Comment consulter mon calendrier ?','how_to'],['Quels rendez-vous ai-je demain ?','read'],['Ajoute une visite à mon calendrier.','write_denied']])('distinct intent: %s',async(question,mode)=>{
 expect(buildQueryPlan(question).mode).toBe(mode);const read=vi.fn();const r=await answerConversation({requestId:id,question,history:[]},member,read);expect(r.navigateTo).toBeUndefined();expect(read).not.toHaveBeenCalled();if(mode==='read')expect(r.status).toBe('UNSUPPORTED');
});
it.each(['https://evil.test','//evil.test','javascript:alert(1)','/admin','/calendar?redirect=https://evil.test','/calendar?mode=team&broker=france','/calendar/../settings','/unknown','/contacts/not-a-uuid','/contacts#redirect','/calendar?mode=personal'])('rejects unapproved destination %s',href=>{
 expect(isSafeCrmNavigationPath(href)).toBe(false);expect(queryResult.safeParse({answer:'OK',source:'crm',status:'SUCCESS',links:[{href,label:'Ouvrir'}],navigateTo:href,toolCount:0}).success).toBe(false);
});
it('all catalog routes exist and pass the same validator',()=>{for(const entry of catalog){expect(existsSync(`app${entry.route}/page.tsx`)).toBe(true);expect(isSafeCrmNavigationPath(entry.route)).toBe(true);}expect(isSafeCrmNavigationPath(`/contacts/${id}`)).toBe(true);});
it('session without membership cannot navigate',async()=>{const read=vi.fn();const r=await answerConversation({requestId:id,question:'Ouvre mon calendrier',history:[]},{...member,brokers:[]},read);expect(r.status).toBe('FORBIDDEN');expect(r.navigateTo).toBeUndefined();expect(read).not.toHaveBeenCalled();});
it('software selector is explicit, not an arbitrary tool',async()=>{const r=await answerConversation({requestId:id,question:'Ouvre les logiciels',history:[]},member,vi.fn());expect(r.status).toBe('CLARIFICATION');expect(r.navigateTo).toBeUndefined();expect(r.links).toHaveLength(3);});
it.each([['Ouvre la fiche de Claude Sauvé','contact'],['Va au 1010 Laurier','listing'],['Ouvre la Transaction du 147 Maurice','transaction']])('record navigation remains typed: %s',(q,entityType)=>{expect(buildQueryPlan(q)).toMatchObject({mode:'navigate',target:{kind:'record',entityType}});});
