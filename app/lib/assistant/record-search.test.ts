import {expect,it,vi} from 'vitest';
import {answerConversation} from './conversation';
import {verifiedLinks} from './tools';
import type {CRMMember} from '../auth/identity';
const id='11111111-1111-4111-8111-111111111111';
const member={memberId:id,identityId:id,authUserId:id,broker:'maxime',role:'broker',brokers:['maxime']} as CRMMember;
it.each([['Ouvre le Listing du 123 Exemple.','listings','listing'],['Ouvre la Transaction du 456 Exemple.','transactions','transaction']])('explicit module is isolated: %s',async(question,section,type)=>{
 const record={id,address:question.includes('123')?'123 Exemple':'456 Exemple'};
 const read=vi.fn(async(name:string)=>{const raw=name.includes('search')?{data:[record],nextPage:null}:record;return {data:raw,links:verifiedLinks(name,raw)};});
 const result=await answerConversation({question,history:[],requestId:id},member,read);
 expect(read.mock.calls.map(c=>c[0])).toEqual([`crm_search_${section}`,`crm_get_${type}`]);expect(result.navigateTo).toBe(`/${section}/${id}`);
});
it('truncated search never opens the only visible candidate',async()=>{
 const read=vi.fn(async()=>({data:{data:[{id,first_name:'Ariane',last_name:'Exemple'}],nextPage:1},links:[{href:`/contacts/${id}`,label:'Ariane Exemple'}]}));
 const result=await answerConversation({question:'Ouvre la fiche contact de Ariane Exemple',history:[],requestId:id},member,read);expect(result.navigateTo).toBeUndefined();expect(read).toHaveBeenCalledTimes(1);
});
it('multiple questions do not trigger automatic navigation',async()=>{
 const record={id,first_name:'Ariane',last_name:'Exemple'};const read=vi.fn(async(name:string)=>{const raw=name.includes('search')?{data:[record],nextPage:null}:record;return {data:raw,links:verifiedLinks(name,raw)};});
 const result=await answerConversation({question:'Ouvre la fiche contact de Ariane Exemple ? Comment ajouter un contact ?',history:[],requestId:id},member,read);expect(result.navigateTo).toBeUndefined();expect(result.links[0].href).toBe(`/contacts/${id}`);
});
