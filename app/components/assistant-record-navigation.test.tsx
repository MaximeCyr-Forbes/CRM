// @vitest-environment jsdom
import React from 'react';
import {expect,it,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
const mocks=vi.hoisted(()=>({auth:vi.fn(),push:vi.fn(),rpc:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:mocks.push})}));
vi.mock('../lib/auth/server',()=>({getAuthenticatedMember:mocks.auth}));
vi.mock('../lib/supabase/server',()=>({getSupabaseServiceClient:()=>({rpc:mocks.rpc})}));
import {AssistantForbes} from './assistant-forbes';
import {handleChat} from '../lib/assistant/service';
const id='11111111-1111-4111-8111-111111111111',id2='22222222-2222-4222-8222-222222222222';
const contact={id,first_name:'Élodie',last_name:"D'Arcy",broker:'maxime'};
let records:Record<string,unknown>[],fault:unknown,accessible:boolean,db:any,query:any;
beforeEach(()=>{
 records=[contact];fault=null;accessible=true;mocks.push.mockReset();mocks.rpc.mockReset();
 query={select:vi.fn().mockReturnThis(),or:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),range:vi.fn(async()=>({data:records,error:fault})),maybeSingle:vi.fn(async()=>({data:accessible?{id}:null,error:fault})),single:vi.fn(async()=>({data:contact,error:fault}))};
 db={from:vi.fn(()=>query)};mocks.auth.mockResolvedValue({member:{memberId:id,authUserId:id,identityId:id,role:'broker',broker:'maxime',brokers:['maxime']},client:db});
 vi.stubEnv('ASSISTANT_ENABLED','false');vi.stubGlobal('React',React);
 vi.stubGlobal('fetch',vi.fn(async(url,options)=>{expect(url).toBe('/api/assistant/chat');return handleChat(new Request('https://crm.test/api/assistant/chat',{...options,headers:{...options.headers,origin:'https://crm.test'}}));}));
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs();});
async function ask(q:string){render(<AssistantForbes/>);fireEvent.click(screen.getByRole('button',{name:'Assistant Forbes'}));fireEvent.change(screen.getByLabelText('Votre question'),{target:{value:q}});fireEvent.click(screen.getByLabelText('Envoyer la question'));await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());}
it('question → real handler → real read tool → member DB → verified UUID → router',async()=>{
 await ask("Peux-tu m'ouvrir la fiche contact de Elodie D’Arcy ?");expect(mocks.push).toHaveBeenCalledWith(`/contacts/${id}`);expect(db.from.mock.calls.every(([t]:string[])=>t==='contacts')).toBe(true);expect(query.or).toHaveBeenCalledWith(expect.not.stringMatching(/ouvrir|fiche/));expect(query.maybeSingle).toHaveBeenCalled();expect(query.single).toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(1);expect(mocks.rpc).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Assistant Forbes'}));expect(screen.getByRole('link').getAttribute('href')).toBe(`/contacts/${id}`);
});
it('homonyms require a choice and never navigate',async()=>{records=[contact,{...contact,id:id2}];await ask("Ouvre la fiche contact de Élodie D'Arcy");expect(screen.getByText(/Plusieurs fiches/)).toBeTruthy();expect(screen.getAllByRole('link')).toHaveLength(2);expect(mocks.push).not.toHaveBeenCalled();expect(query.single).not.toHaveBeenCalled();});
it('zero results are distinct from SQL failure',async()=>{records=[];await ask('Ouvre la fiche contact de Personne Absente');expect(screen.getByText(/Aucune fiche accessible/)).toBeTruthy();expect(mocks.push).not.toHaveBeenCalled();});
it('SQL failure is reported, never a false empty result',async()=>{fault=new Error('SQL failure');await ask('Ouvre la fiche contact de Elodie D’Arcy');expect(screen.getByRole('alert').textContent).toContain('lecture CRM');expect(screen.queryByText(/Aucune fiche accessible/)).toBeNull();expect(mocks.push).not.toHaveBeenCalled();});
it('detail access denied prevents navigation even after search',async()=>{accessible=false;await ask('Ouvre la fiche contact de Elodie D’Arcy');expect(screen.getByRole('alert').textContent).toContain('accès CRM');expect(mocks.push).not.toHaveBeenCalled();});
it('partial name alone never opens an arbitrary Contact',async()=>{await ask('Ouvre la fiche contact de Élodie');expect(mocks.push).not.toHaveBeenCalled();expect(screen.getByRole('link')).toBeTruthy();});
it('removes SQL wildcard false positives before choosing a name',async()=>{records=[contact,{id:id2,first_name:'Alodia',last_name:'Darco'}];await ask('Ouvre la fiche contact de Elodie D’Arcy');expect(mocks.push).toHaveBeenCalledWith(`/contacts/${id}`);});
it('broad candidate cap is an error, never a false unique result',async()=>{records=Array(200).fill(contact);await ask('Ouvre la fiche contact de Elodie D’Arcy');expect(screen.getByRole('alert')).toBeTruthy();expect(mocks.push).not.toHaveBeenCalled();});
it.each(['Comment ouvrir une fiche Contact ?','Crée un nouveau Contact.'])('no record navigation for %s',async q=>{await ask(q);expect(mocks.push).not.toHaveBeenCalled();expect(db.from).not.toHaveBeenCalled();});
it('unauthenticated request cannot search',async()=>{mocks.auth.mockResolvedValue(null);await ask('Ouvre la fiche contact de Elodie D’Arcy');expect(screen.getByRole('alert')).toBeTruthy();expect(db.from).not.toHaveBeenCalled();expect(mocks.push).not.toHaveBeenCalled();});
