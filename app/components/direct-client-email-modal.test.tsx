// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import DirectClientEmailModal from './direct-client-email-modal';
import {renderDirectEmail} from '../lib/transactions/direct-client-email';
vi.mock('../lib/workspace',()=>({restoreWorkspace:()=>({workingBroker:'maxime'})}));
vi.mock('../lib/workspace-request',()=>({workspaceRequest:vi.fn(()=>{throw Error('No email request allowed in this test');})}));
vi.mock('../lib/use-dialog-lifecycle',()=>({useDialogLifecycle:vi.fn()}));
import {workspaceRequest} from '../lib/workspace-request';
const expected=`Bonjour {{firstName}},

je me permets de faire un petit suivi à la suite de votre demande d'information concernant l'une de mes propriétés.

Je voulais simplement savoir si vous êtes toujours à la recherche d'une propriété et si vous êtes actuellement accompagné par un courtier immobilier.

Si ce n'est pas le cas, sachez que j'accompagne également les acheteurs dans leurs démarches, que ce soit pour trouver la bonne propriété, organiser les visites ou les conseiller tout au long du processus d'achat.

Si vous êtes toujours à la recherche, nous pourrions prendre un moment pour discuter de votre projet et de vos critères. Ça me ferait réellement plaisir de pouvoir vous accompagner!

Au plaisir,`;
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('prefills each new composition, preserves edits across renders and never sends automatically',async()=>{
 vi.stubGlobal('React',React);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({connections:[{broker:'maxime',gmailSendEnabled:true,gmailSignatureEnabled:true}]})}));
 HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.open=true;});
 HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.open=false;});
 const props={recipients:[{id:'qa',name:'Yannick Exemple',email:'qa@example.invalid'}],endpoint:'/qa',onClose:vi.fn(),onComplete:vi.fn()};
 const view=render(<DirectClientEmailModal {...props}/>);
 const message=screen.getByLabelText('Message') as HTMLTextAreaElement;
 expect(message.value).toBe(expected);expect((screen.getByLabelText('Objet') as HTMLInputElement).value).toBe('');
 for(const firstName of ['Yannick','Pascale','Jade']){
  const rendered=renderDirectEmail('Objet QA',message.value,{id:firstName,name:firstName+' Exemple',email:firstName.toLowerCase()+'@example.invalid'});
  expect(rendered.message).toBe(expected.replace('{{firstName}}',firstName));expect(rendered.blockingReasons).toEqual([]);
 }
 await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());
 fireEvent.change(message,{target:{value:'Brouillon modifié'}});view.rerender(<DirectClientEmailModal {...props}/>);
 expect(message.value).toBe('Brouillon modifié');
 fireEvent.change(screen.getByLabelText('Objet'),{target:{value:'Objet QA'}});
 expect((screen.getByRole('button',{name:'Envoyer 1 courriel'}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Prévisualiser avec la signature Gmail'}) as HTMLButtonElement).disabled).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Annuler'}));expect(props.onClose).toHaveBeenCalledOnce();view.unmount();
 render(<DirectClientEmailModal {...props}/>);expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe(expected);
 expect(workspaceRequest).not.toHaveBeenCalled();
});
