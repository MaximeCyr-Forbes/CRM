/** Extract the entity after the command, never remove words inside a person's name. */
export type RecordRequest={section:'contacts'|'listings'|'transactions'|undefined;query:string;open:boolean};
export const recordKey=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
export const recordPath=(value:unknown):value is string=>typeof value==='string'&&/^\/(contacts|listings|transactions)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function parseRecordRequest(question:string):RecordRequest|undefined{
 let q=question.trim().replace(/[’]/g,"'").replace(/\s+/g,' ').replace(/[?.!]+$/,'').trim();
 q=q.replace(/^(?:s'il (?:te|vous) pla[îi]t[, ]+)?(?:(?:peux|pourrais|pouvez|pourriez)[ -](?:tu|vous)\s+|je (?:veux|voudrais|souhaite)\s+)?/i,'');
 const command=q.match(/^(?:(?:m'|me )?(ouvrir|consulter)|(?:ouvre|montre|trouve|cherche|recherche|retrouve)(?:-moi)?|acc[èe]de|am[èe]ne-moi)\s+/i);
 const bare=/^(?:(?:la|le|une?)\s+)?(?:fiche (?:contact|client)|contact|client|listing|propri[ée]t[ée]|transaction|dossier transaction)\s+(?:de|du|au|à)\s+/i.test(q);
 if(!command&&!bare)return;
 const open=!!command&&(/ouvr|consulter|acc[èe]de|am[èe]ne/i.test(command[0])||(/montre/i.test(command[0])&&/^(?:la\s+)?fiche\b/i.test(q.slice(command[0].length))));
 if(command)q=q.slice(command[0].length);
 q=q.replace(/^(?:à|a)\s+/i,'');
 let section:RecordRequest['section'];
 const suffix=q.match(/\s+dans (?:les? )?(Contacts|Listings|Transactions)$/i);
 if(suffix){section=suffix[1].toLowerCase() as RecordRequest['section'];q=q.slice(0,-suffix[0].length);}
 const prefix=q.match(/^(?:(?:la|le|une?)\s+)?(?:(?:fiche|dossier)\s+)?(contact|client|listing|propri[ée]t[ée]|transaction)\s+(?:(?:de|du|au|à)\s+)?/i);
 if(prefix){section=/contact|client/i.test(prefix[1])?'contacts':/transaction/i.test(prefix[1])?'transactions':'listings';q=q.slice(prefix[0].length);}
 else q=q.replace(/^(?:(?:la|le|une?)\s+)?fiche\s+(?:de|du|au|à)\s+/i,'');
 q=q.replace(/[, ]+(?:svp|stp|s'il (?:te|vous) pla[îi]t)$/i,'').trim();
 if(!q||q.length>160)return;
 if(!section&&open&&!/\d/.test(q))section='contacts';
 return {section,query:q,open};
}
