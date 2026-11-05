import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({rows:[] as Record<string,unknown>[],clients:[] as Record<string,unknown>[],send:vi.fn(),prepare:vi.fn()}));
vi.mock('./direct-clients-server',()=>({listDirectClients:async(id:string)=>state.clients.filter(c=>c.transaction_id===id)}));
vi.mock('../google-gmail/service',async()=>({...await vi.importActual('../google-gmail/service'),prepareGmailSender:state.prepare,sendPreparedGmailMessage:state.send}));
vi.mock('../supabase/server',()=>({getSupabaseAdmin:()=>({from:()=>{
 const filters:[string,unknown][]=[];let operation='select',values:Record<string,unknown>|Record<string,unknown>[]={};
 const run=()=>{if(operation==='insert'){const list=values as Record<string,unknown>[];if(list.some(v=>state.rows.some(r=>r.batch_id===v.batch_id&&r.normalized_email===v.normalized_email)))return {data:null,error:{code:'23505'}};state.rows.push(...list.map(v=>({...v,id:crypto.randomUUID(),gmail_message_id:null,error:null})));return{data:[],error:null};}const rows=state.rows.filter(r=>filters.every(([k,v])=>r[k]===v));if(operation==='update')rows.forEach(r=>Object.assign(r,values));return {data:rows.map(r=>({...r})),error:null};};
 const q={select:()=>q,eq:(k:string,v:unknown)=>{filters.push([k,v]);return q;},order:()=>q,range:async(from:number,to:number)=>{const r=run();return {...r,data:r.data?.slice(from,to+1)};},insert:(v:Record<string,unknown>[])=>{operation='insert';values=v;return q;},update:(v:Record<string,unknown>)=>{operation='update';values=v;return q;},maybeSingle:async()=>{const r=run();return {...r,data:r.data?.[0]??null};},then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(run()).then(resolve)};return q;
}})}));
import {previewDirectClientEmail,directClientEmailHistory,sendDirectClientEmail} from './direct-client-email-server';
import {directClientEmailValid,uniqueDirectEmailRecipients,directEmailSender} from './direct-client-email';
import {buildGmailRawMessage,GmailSendError,GmailSendUncertainError} from '../google-gmail/service';
const tx='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',id2='33333333-3333-4333-8333-333333333333';
const input=()=>({requestId:crypto.randomUUID(),senderBroker:'maxime',clientIds:[id],subject:'QA subject',message:'Synthetic message'});
beforeEach(()=>{vi.clearAllMocks();state.rows=[];state.clients=[{id,transaction_id:tx,name:'Synthetic A',email:'a@example.invalid',phone:'5145550100'},{id:id2,transaction_id:tx,name:'Synthetic B',email:'b@example.invalid',phone:null}];state.prepare.mockResolvedValue({identity:{sendAsEmail:'sender@example.invalid',signature:'<b>Existing signature</b>'}});state.send.mockResolvedValue({id:'gmail-test'});});
it('uses email only even when phone exists and works without phone',async()=>{await sendDirectClientEmail(tx,{...input(),clientIds:[id,id2]},'maxime');expect(state.send).toHaveBeenCalledTimes(2);for(const call of state.send.mock.calls){expect(Object.keys(call[1]).sort()).toEqual(['message','subject','to']);expect(call[1].to).toContain('@');expect(call[0].identity.signature).toContain('Existing signature');}});
it('never falls back to phone when email is missing',async()=>{state.clients[0].email=null;await expect(sendDirectClientEmail(tx,input(),'maxime')).rejects.toThrow('courriel valide');expect(state.send).not.toHaveBeenCalled();expect(state.rows).toHaveLength(0);});
it.each(['bad','a@example.invalid,b@example.invalid','a@example.invalid\r\nBcc: b@example.invalid',''])('rejects invalid email %s',async email=>{state.clients[0].email=email;expect(directClientEmailValid(email)).toBe(false);await expect(sendDirectClientEmail(tx,input(),'maxime')).rejects.toThrow();expect(state.send).not.toHaveBeenCalled();});
it('deduplicates normalized email and keeps stored address',async()=>{state.clients[1].email=' A@EXAMPLE.INVALID ';const result=await sendDirectClientEmail(tx,{...input(),clientIds:[id,id2]},'maxime');expect(result.sent).toBe(1);expect(state.send).toHaveBeenCalledTimes(1);expect(uniqueDirectEmailRecipients(state.clients as never)).toHaveLength(1);});
it('enforces transaction scope',async()=>{state.clients[0].transaction_id='other';await expect(sendDirectClientEmail(tx,input(),'maxime')).rejects.toMatchObject({status:404});expect(state.send).not.toHaveBeenCalled();});
it('enforces signed actor while allowing assistant working broker',()=>{expect(directEmailSender('immoplus','france')).toBe('france');expect(()=>directEmailSender('maxime','france')).toThrow();expect(()=>directEmailSender('maxime','unassigned')).toThrow();});
it.each([{subject:''},{message:'  '}])('requires subject and body',async override=>{await expect(sendDirectClientEmail(tx,{...input(),...override},'maxime')).rejects.toThrow();expect(state.send).not.toHaveBeenCalled();});
it('protects concurrent double submit and later replay',async()=>{const body={...input(),clientIds:[id,id2]};await Promise.all([sendDirectClientEmail(tx,body,'maxime'),sendDirectClientEmail(tx,body,'maxime')]);await sendDirectClientEmail(tx,body,'maxime');expect(state.send).toHaveBeenCalledTimes(2);expect(state.rows).toHaveLength(2);});
it('rejects changed payload using the same key',async()=>{const body=input();await sendDirectClientEmail(tx,body,'maxime');await expect(sendDirectClientEmail(tx,{...body,message:'Different'},'maxime')).rejects.toMatchObject({status:409});expect(state.send).toHaveBeenCalledTimes(1);});
it('reports precise partial failure and never blindly retries successful or failed messages',async()=>{state.send.mockResolvedValueOnce({id:'one'}).mockRejectedValueOnce(new GmailSendError());const body={...input(),clientIds:[id,id2]};const result=await sendDirectClientEmail(tx,body,'maxime');expect(result).toMatchObject({sent:1,failed:1});expect(result.results.find(r=>r.status==='failed')?.direct_client_id).toBe(id2);await sendDirectClientEmail(tx,body,'maxime');expect(state.send).toHaveBeenCalledTimes(2);});
it('does not resend uncertain Gmail outcomes',async()=>{state.send.mockRejectedValue(new GmailSendUncertainError('Unknown'));const body=input();expect(await sendDirectClientEmail(tx,body,'maxime')).toMatchObject({uncertain:1});await sendDirectClientEmail(tx,body,'maxime');expect(state.send).toHaveBeenCalledTimes(1);});
it('generates one To and no CC/BCC for each recipient using the existing MIME builder',async()=>{state.send.mockImplementation(async(sender,input)=>{const raw=Buffer.from(buildGmailRawMessage(input,sender.identity),'base64url').toString();expect(raw.match(/^To:/gm)).toHaveLength(1);expect(raw).not.toMatch(/^(Cc|Bcc):/mi);expect(raw).toContain('To: '+input.to+'\r\n');return{id:'individual'};});expect(await sendDirectClientEmail(tx,{...input(),clientIds:[id,id2]},'maxime')).toMatchObject({sent:2});});

it('history includes only sent receipts for this transaction after client removal',async()=>{state.clients=[];state.rows=[{id:'sent',transaction_id:tx,status:'sent',direct_client_id:null},{id:'failed',transaction_id:tx,status:'failed'},{id:'other',transaction_id:'other',status:'sent'}];expect(await directClientEmailHistory(tx)).toEqual({entries:[state.rows[0]],hasMore:false});expect(state.send).not.toHaveBeenCalled();});
it('history paginates without dropping the extra receipt',async()=>{state.rows=Array.from({length:51},(_,n)=>({id:String(n),transaction_id:tx,status:'sent'}));expect(await directClientEmailHistory(tx)).toMatchObject({entries:state.rows.slice(0,50),hasMore:true});expect(await directClientEmailHistory(tx,50)).toEqual({entries:state.rows.slice(50),hasMore:false});await expect(directClientEmailHistory(tx,-1)).rejects.toThrow('Page invalide');});

it.each([3,50,100])('renders %i independent recipients with no raw tokens',async count=>{
 state.clients=Array.from({length:count},(_,n)=>({id:crypto.randomUUID(),transaction_id:tx,name:`Prenom${String.fromCharCode(65+n%26)} Nom`,email:`synthetic${n}@example.test`,phone:'5145550100'}));
 const body={...input(),clientIds:state.clients.map(c=>c.id),subjectTemplate:'Pour {{firstName}}',messageTemplate:'Bonjour {{firstName}}, {{email}} {{phone}}'};
 const preview=await previewDirectClientEmail(tx,body,'maxime');
 expect(state.send).not.toHaveBeenCalled();
 expect(preview.recipients).toHaveLength(count);
 const result=await sendDirectClientEmail(tx,{...body,fingerprints:Object.fromEntries(preview.recipients.map(r=>[r.id,r.fingerprint]))},'maxime');
 expect(result.sent).toBe(count);expect(state.send).toHaveBeenCalledTimes(count);
 for(const [,message] of state.send.mock.calls){expect(message.message).toContain(message.to);expect(message.message).not.toMatch(/\{\{/);expect(message.subject).toMatch(/^Pour Prenom/);}
 expect(new Set(state.send.mock.calls.map(c=>c[1].message)).size).toBe(count);
});
it('blocks only the recipient without a usable first name',async()=>{
 state.clients.push({id:crypto.randomUUID(),transaction_id:tx,name:'',email:'missing@example.test'});
 const result=await sendDirectClientEmail(tx,{...input(),clientIds:state.clients.map(c=>c.id),messageTemplate:'Bonjour {{firstName}},'},'maxime');
 expect(result).toMatchObject({sent:2,failed:1});expect(result.results.find(r=>r.status==='failed')?.error).toContain('Prénom manquant.');
});
it('blocks unknown variables without Gmail calls',async()=>{
 const result=await sendDirectClientEmail(tx,{...input(),messageTemplate:'Bonjour {{unknown}}'},'maxime');
 expect(result.failed).toBe(1);expect(state.send).not.toHaveBeenCalled();
});
it('refuses changed email after preview',async()=>{
 const body=input(),preview=await previewDirectClientEmail(tx,body,'maxime');
 state.clients[0].email='changed@example.test';
 const result=await sendDirectClientEmail(tx,{...body,fingerprints:{[id]:preview.recipients[0].fingerprint}},'maxime');
 expect(result.failed).toBe(1);expect(state.send).not.toHaveBeenCalled();
});
it('re-reads after sender preparation even without a preview',async()=>{
 state.prepare.mockImplementationOnce(async()=>{state.clients[0]={...state.clients[0],email:'changed@example.test'};return {identity:{sendAsEmail:'maxime@example.test'}};});
 expect(await sendDirectClientEmail(tx,input(),'maxime')).toMatchObject({failed:1});expect(state.send).not.toHaveBeenCalled();
});
it('keeps the rendered subject in history',async()=>{
 await sendDirectClientEmail(tx,{...input(),subjectTemplate:'Bonjour {{firstName}}'},'maxime');
 expect(state.rows[0].subject).toBe('Bonjour Synthetic');
});

it('preserves one Gmail signature and Reply-To through the real pipeline',async()=>{
 const broker='maxime';
 const identity={sendAsEmail:`${broker}@example.test`,replyToAddress:`reply-${broker}@example.test`,signature:`<p>Signature ${broker}</p>`};
 state.prepare.mockResolvedValue({identity});
 state.send.mockImplementation(async(sender,message)=>{
  const {buildGmailRawMessage}=await import('../google-gmail/service');
  const mime=Buffer.from(buildGmailRawMessage(message,sender.identity),'base64url').toString();
  expect(mime).toContain(`From: ${broker}@example.test`);expect(mime).toContain(`Reply-To: reply-${broker}@example.test`);
  const html=Buffer.from(mime.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)![1].replace(/\s/g,''),'base64').toString();
  expect(html.split(identity.signature)).toHaveLength(2);expect(mime.match(/^To:/gm)).toHaveLength(1);expect(mime).not.toMatch(/^(Cc|Bcc):/mi);
  return {id:'mock-contract'};
 });
 await sendDirectClientEmail(tx,input(),'maxime');
 expect(state.send).toHaveBeenCalledTimes(1);
});
