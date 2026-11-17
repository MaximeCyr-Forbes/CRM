// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {AssistantForbes} from './assistant-forbes';
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({error:'Assistant désactivé'})}));HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('opening closing and rerendering never call AI',()=>{const view=render(<AssistantForbes/>);fireEvent.click(screen.getByRole('button',{name:'Assistant Forbes'}));expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByText(/Salut !/)).toBeTruthy();view.rerender(<AssistantForbes/>);fireEvent.click(screen.getByLabelText('Fermer l’assistant'));expect(fetch).not.toHaveBeenCalled();});
it('only explicit question sends and disabled feedback is visible',async()=>{render(<AssistantForbes/>);fireEvent.click(screen.getByRole('button',{name:'Assistant Forbes'}));fireEvent.change(screen.getByLabelText('Votre question'),{target:{value:'Bonjour'}});fireEvent.click(screen.getByLabelText('Envoyer la question'));await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('Assistant désactivé'));expect(fetch).toHaveBeenCalledTimes(1);});
it('new conversation cancels and cannot display stale response',async()=>{let resolve:(value:Response)=>void=()=>{};vi.mocked(fetch).mockReturnValue(new Promise<Response>(r=>{resolve=r;}));render(<AssistantForbes/>);fireEvent.click(screen.getByRole('button',{name:'Assistant Forbes'}));fireEvent.change(screen.getByLabelText('Votre question'),{target:{value:'Bonjour'}});fireEvent.click(screen.getByLabelText('Envoyer la question'));fireEvent.click(screen.getByRole('button',{name:'Nouvelle conversation'}));resolve(Response.json({answer:'Old answer'}));await waitFor(()=>expect((screen.getByLabelText('Votre question') as HTMLTextAreaElement).value).toBe(''));expect(screen.queryByText('Old answer')).toBeNull();});
it('renders a privately assembled answer and sends follow-up questions only to the CRM',async()=>{
 vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({answer:'Propriétaire synthétique : Ariane Exemple',links:[{href:'/listings/11111111-1111-4111-8111-111111111111',label:'Fiche synthétique'}]})} as Response);
 render(<AssistantForbes/>);fireEvent.click(screen.getByRole('button',{name:'Assistant Forbes'}));fireEvent.change(screen.getByLabelText('Votre question'),{target:{value:'Vendeurs du 147 Exemple'}});fireEvent.click(screen.getByLabelText('Envoyer la question'));
 await waitFor(()=>expect(screen.getByText('Propriétaire synthétique : Ariane Exemple')).toBeTruthy());expect(screen.getByRole('link',{name:'Fiche synthétique →'}).getAttribute('href')).toContain('/listings/');
 fireEvent.change(screen.getByLabelText('Votre question'),{target:{value:'Résume cette fiche'}});fireEvent.click(screen.getByLabelText('Envoyer la question'));await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
 const [url,options]=vi.mocked(fetch).mock.calls[1];expect(url).toBe('/api/assistant/chat');expect(JSON.parse(String(options?.body)).history).toEqual([{question:'Vendeurs du 147 Exemple',answer:''}]);expect(String(options?.body)).not.toContain('Ariane');
});
it('synchronous double submit is locked and reset clears private history',async()=>{
 let resolve:(v:Response)=>void=()=>{};vi.mocked(fetch).mockReturnValue(new Promise<Response>(r=>{resolve=r;}));render(<AssistantForbes/>);fireEvent.click(screen.getByRole('button',{name:'Assistant Forbes'}));
 fireEvent.change(screen.getByLabelText('Votre question'),{target:{value:'Comment créer un contact ?'}});const form=screen.getByLabelText('Votre question').closest('form')!;fireEvent.submit(form);fireEvent.submit(form);expect(fetch).toHaveBeenCalledTimes(1);
 resolve(Response.json({answer:'Étapes vérifiées',links:[{href:'/contacts',label:'Ouvrir Contacts'}]}));await waitFor(()=>expect(screen.getByText('Étapes vérifiées')).toBeTruthy());
 fireEvent.click(screen.getByRole('button',{name:'Nouvelle conversation'}));vi.mocked(fetch).mockResolvedValue(Response.json({answer:'Précise la recherche'}));fireEvent.change(screen.getByLabelText('Votre question'),{target:{value:'Et pour France ?'}});fireEvent.submit(form);await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)).history).toEqual([]);
});
it('long conversation keeps only four private question hints, never answer facts',async()=>{
 vi.mocked(fetch).mockImplementation(async()=>Response.json({answer:'Réponse privée'}));render(<AssistantForbes/>);fireEvent.click(screen.getByRole('button',{name:'Assistant Forbes'}));
 for(let i=0;i<7;i++){fireEvent.change(screen.getByLabelText('Votre question'),{target:{value:`Question ${i}`}});fireEvent.click(screen.getByLabelText('Envoyer la question'));await waitFor(()=>expect((screen.getByLabelText('Votre question') as HTMLTextAreaElement).value).toBe(''));}
 const payload=JSON.parse(String(vi.mocked(fetch).mock.calls[6][1]?.body));expect(payload.history).toHaveLength(4);expect(payload.history[0].question).toBe('Question 2');expect(JSON.stringify(payload)).not.toContain('Réponse privée');
});
