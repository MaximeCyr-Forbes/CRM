import type { WorkingBroker, WorkspaceUser } from '../workspace';
import { isWorkingBroker } from '../workspace';
export type EmailRecipient = {id:string;name:string;email:string|null};
export function directClientEmailValid(email: unknown): email is string {
 return typeof email==='string' && email.trim().length<=320 && /^[^\s@<>,;:\"()[\]\\]+@[^\s@<>,;:\"()[\]\\]+\.[^\s@<>,;:\"()[\]\\]+$/.test(email.trim()) && !/[\r\n]/.test(email);
}
export function uniqueDirectEmailRecipients<T extends EmailRecipient>(rows:T[]):T[]{
 const seen=new Set<string>();return rows.filter(row=>{if(!directClientEmailValid(row.email))return false;const key=row.email.trim().toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
}
export function directEmailSender(actor:WorkspaceUser,requested:unknown):WorkingBroker{
 if(!isWorkingBroker(requested)||actor!=='immoplus'&&requested!==actor)throw new TypeError('L’expéditeur doit correspondre à votre espace courtier.');
 return requested;
}
export type DirectEmailReceipt={id:string;direct_client_id:string|null;recipient_name:string;recipient_email:string;status:'pending'|'sending'|'sent'|'failed'|'uncertain';error:string|null;gmail_message_id:string|null};
export type DirectEmailResult={results:DirectEmailReceipt[];sent:number;failed:number;uncertain:number;pending:number};
export function directEmailSummary(results:DirectEmailReceipt[]):DirectEmailResult{return {results,sent:results.filter(r=>r.status==='sent').length,failed:results.filter(r=>r.status==='failed').length,uncertain:results.filter(r=>r.status==='uncertain'||r.status==='sending').length,pending:results.filter(r=>r.status==='pending').length};}
export type DirectEmailHistoryEntry={id:string;recipient_name:string;recipient_email:string;subject:string;sender_broker:string;updated_at:string};
export type DirectEmailHistory={entries:DirectEmailHistoryEntry[];hasMore:boolean};
