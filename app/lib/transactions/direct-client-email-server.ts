import {getSupabaseAdmin} from '../supabase/server';
import {listDirectClients} from './direct-clients-server';
import {DirectClientError,directClientId} from './direct-clients';
import {directClientEmailValid,directEmailSender,directEmailSummary,uniqueDirectEmailRecipients,type DirectEmailReceipt} from './direct-client-email';
import {prepareGmailSender,sendPreparedGmailMessage,validateGmailMessage,GmailSendUncertainError,GmailSendError,GmailAuthorizationRequiredError} from '../google-gmail/service';
import type {WorkspaceUser} from '../workspace';
const table='transaction_direct_client_email_deliveries';
type Receipt=DirectEmailReceipt & {transaction_id:string;actor:string;payload_hash:string;sender_broker:string};
async function receipts(batchId:string):Promise<Receipt[]>{const {data,error}=await getSupabaseAdmin().from(table).select('*').eq('batch_id',batchId).order('created_at').order('id');if(error)throw error;return data;}
export async function sendDirectClientEmail(transactionId:string,body:Record<string,unknown>,actor:WorkspaceUser){
 directClientId(transactionId);const batchId=directClientId(body.requestId);const broker=directEmailSender(actor,body.senderBroker);
 if(!Array.isArray(body.clientIds)||!body.clientIds.length||body.clientIds.length>100)throw new DirectClientError('Sélectionnez entre 1 et 100 clients.');
 const ids=[...new Set(body.clientIds.map(directClientId))].sort();
 if(typeof body.subject!=='string'||typeof body.message!=='string')throw new DirectClientError('Objet et message requis.');
 const input=validateGmailMessage({to:'validation@example.invalid',subject:body.subject,message:body.message});
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([transactionId,actor,broker,ids,input.subject,input.message])))),b=>b.toString(16).padStart(2,'0')).join('');
 // Scope is checked even on retries. No email supplied by the browser is trusted.
 const clients=await listDirectClients(transactionId);
 let rows=await receipts(batchId);
 if(!rows.length){
  const selected=ids.map(id=>clients.find(c=>c.id===id));
  if(selected.some(c=>!c))throw new DirectClientError('Client hors de cette transaction.',404);
  if(selected.some(c=>!directClientEmailValid(c!.email)))throw new DirectClientError('Un client sélectionné ne possède pas de courriel valide.');
  const recipients=uniqueDirectEmailRecipients(selected.map(c=>({id:c!.id,name:c!.name,email:c!.email})));
  const {error}=await getSupabaseAdmin().from(table).insert(recipients.map(r=>({batch_id:batchId,transaction_id:transactionId,direct_client_id:r.id,actor,sender_broker:broker,payload_hash:hash,recipient_name:r.name,recipient_email:r.email!.trim(),normalized_email:r.email!.trim().toLowerCase(),subject:input.subject,status:'pending'})));
  if(error&&error.code!=='23505')throw error;
  rows=await receipts(batchId);
 }
 if(!rows.length||rows.some(r=>r.transaction_id!==transactionId||r.actor!==actor||r.payload_hash!==hash||r.sender_broker!==broker))throw new DirectClientError('Cet identifiant d’envoi appartient à une autre demande.',409);
 const pending=rows.filter(r=>r.status==='pending');
 if(!pending.length)return directEmailSummary(rows);
 const sender=await prepareGmailSender(broker);
 // Claim before calling Gmail. Sending/uncertain rows are never automatically reclaimed.
 async function deliver(row:Receipt){
  const {data:claimed,error}=await getSupabaseAdmin().from(table).update({status:'sending',updated_at:new Date().toISOString()}).eq('id',row.id).eq('status','pending').select('id').maybeSingle();
  if(error)throw error;if(!claimed)return;
  let status:'sent'|'failed'|'uncertain'='uncertain',gmailId:string|null=null,message:string|null=null;
  const current=clients.find(c=>c.id===row.direct_client_id);
  if(!current||!directClientEmailValid(current.email)||current.email.trim().toLowerCase()!==row.recipient_email.toLowerCase()){
   status='failed';message='Client supprimé ou adresse modifiée. Aucun envoi.';
  }else try{const result=await sendPreparedGmailMessage(sender,{to:row.recipient_email,subject:input.subject,message:input.message});status='sent';gmailId=result.id;}
  catch(error){if(error instanceof GmailSendError||error instanceof GmailAuthorizationRequiredError){status='failed';message='Gmail a refusé cet envoi.';}else{status='uncertain';message=error instanceof GmailSendUncertainError?error.message:'Résultat Gmail inconnu. Vérifiez les messages envoyés.';}}
  const finished=await getSupabaseAdmin().from(table).update({status,gmail_message_id:gmailId,error:message,updated_at:new Date().toISOString()}).eq('id',row.id).eq('status','sending');
  if(finished.error)throw finished.error;
 }
 for(let i=0;i<pending.length;i+=4)await Promise.allSettled(pending.slice(i,i+4).map(deliver));
 return directEmailSummary(await receipts(batchId));
}
