import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({contact:{id:'contact',first_name:'Jade',last_name:'Exemple',email:'jade@example.test',phone:'5145550100'},prepare:vi.fn(),send:vi.fn()}));
vi.mock('../supabase/server',()=>({getSupabaseAdmin:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:structuredClone(state.contact),error:null})})})})})}));
vi.mock('./service',async original=>({...await original<typeof import('./service')>(),prepareGmailSender:state.prepare,sendPreparedGmailMessage:state.send}));
import {sendContactEmail} from './contact';
import {buildGmailRawMessage} from './service';
const input={contactId:'contact',to:'jade@example.test',expectedEmail:'jade@example.test',subject:'Pour {{firstName}}',message:'Bonjour {{firstName}},'};
beforeEach(()=>{state.contact={id:'contact',first_name:'Jade',last_name:'Exemple',email:'jade@example.test',phone:'5145550100'};state.prepare.mockReset().mockImplementation(async broker=>({identity:{sendAsEmail:`${broker}@example.test`,replyToAddress:`reply-${broker}@example.test`,signature:`<p>Signature ${broker}</p>`}}));state.send.mockReset().mockResolvedValue({id:'mock'});});
it.each(['maxime','france','sandrine'] as const)('uses current contact and selected %s identity',async broker=>{
 await sendContactEmail(broker,input);expect(state.prepare).toHaveBeenCalledWith(broker);
 const [sender,message]=state.send.mock.calls[0];expect(message).toEqual({to:input.to,subject:'Pour Jade',message:'Bonjour Jade,'});
 const mime=Buffer.from(buildGmailRawMessage(message,sender.identity),'base64url').toString();expect(mime).toContain(`From: ${broker}@example.test`);expect(mime).toContain(`Reply-To: reply-${broker}@example.test`);
 const html=Buffer.from(mime.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)![1].replace(/\s/g,''),'base64').toString();expect(html.split(sender.identity.signature)).toHaveLength(2);
});
it('rejects an address changed since composer opened',async()=>{state.contact.email='new@example.test';await expect(sendContactEmail('maxime',input)).rejects.toThrow('adresse');expect(state.send).not.toHaveBeenCalled();});
it('rejects changes during Gmail preparation',async()=>{state.prepare.mockImplementation(async()=>{state.contact.first_name='Changed';return {};});await expect(sendContactEmail('maxime',input)).rejects.toThrow('changé');expect(state.send).not.toHaveBeenCalled();});
it.each(['{{unknown}}','{{constructor}}'])('blocks %s before Gmail',async message=>{await expect(sendContactEmail('maxime',{...input,message})).rejects.toThrow('Variable non résolue');expect(state.prepare).not.toHaveBeenCalled();});
it('blocks missing first name',async()=>{state.contact.first_name='';await expect(sendContactEmail('maxime',input)).rejects.toThrow('Prénom manquant');expect(state.send).not.toHaveBeenCalled();});
it('preserves plain messages and the explicitly edited recipient',async()=>{await sendContactEmail('maxime',{...input,to:'intentional@example.test',subject:'Suivi',message:'Bonjour,'});expect(state.send.mock.calls[0][1]).toEqual({to:'intentional@example.test',subject:'Suivi',message:'Bonjour,'});});
