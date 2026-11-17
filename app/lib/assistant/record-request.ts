/** Extract the entity after the command, never remove words inside a person's name. */
export type RecordRequest={section:'contacts'|'listings'|'transactions'|undefined;query:string;open:boolean;broker?:'maxime'|'france'|'sandrine'};
export const recordKey=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
export const recordPath=(value:unknown):value is string=>typeof value==='string'&&/^\/(contacts|listings|transactions)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function parseRecordRequest(question:string):RecordRequest|undefined{
 let q=question.trim().replace(/[’]/g,"'").replace(/\s+/g,' ').replace(/[?.!]+$/,'').trim();
 q=q.replace(/[, ]+(?:svp|stp|s'il (?:te|vous) pla[îi]t)$/i,'').trim();
 // A trailing command or module is grammatical context, not part of the name.
 const inverted=q.match(/^(.+?),\s*(ouvre(?:-moi)?|ouvrir|cherche|trouve)\s+(?:sa |la )?fiche(?:\s+(contact|client|listing|transaction))?$/i);
 if(inverted)q=`${inverted[2]} la fiche ${inverted[3]??'contact'} de ${inverted[1]}`;
 const bareSuffix=q.match(/^(.+?)\s+(?:dans|parmi)\s+(?:(?:mes|les|nos)\s+)?(contacts|clients|listings|transactions)$/i);
 if(bareSuffix&&!/^(?:peux|pourrais|pouvez|pourriez|je|ouvre|ouvrir|consulter|montre|trouve|cherche|recherche|retrouve|acc[èe]de|am[èe]ne)/i.test(q))q=`cherche ${q}`;
 q=q.replace(/^(?:s'il (?:te|vous) pla[îi]t[, ]+)?(?:(?:peux|pourrais|pouvez|pourriez)[ -](?:tu|vous)\s+|je (?:veux|voudrais|souhaite)\s+)?/i,'');
 const command=q.match(/^(?:(?:m'|me )?(ouvrir|consulter|trouver|chercher)|(?:ouvre|montre|trouve|cherche|recherche|retrouve)(?:-moi)?|acc[èe]de|am[èe]ne-moi)\s+/i);
 const bare=/^(?:(?:la|le|une?)\s+)?(?:fiche (?:contact|client)|contact|client|listing|propri[ée]t[ée]|transaction|dossier transaction)\s+(?:de|du|au|à)\s+/i.test(q);
 if(!command&&!bare)return;
 const open=!!command&&(/ouvr|consulter|acc[èe]de|am[èe]ne/i.test(command[0])||(/montre/i.test(command[0])&&/^(?:la\s+)?fiche\b/i.test(q.slice(command[0].length))));
 if(command)q=q.slice(command[0].length);
 q=q.replace(/^(?:à|a)\s+/i,'');
 let section:RecordRequest['section'];
 const suffix=q.match(/\s+(?:dans|parmi)\s+(?:(?:les?|mes|nos|vos|tes)\s+)?(contacts|clients|listings|transactions|le CRM|CRM)$/i);
 if(suffix){section=/contact|client/i.test(suffix[1])?'contacts':/listing/i.test(suffix[1])?'listings':/transaction/i.test(suffix[1])?'transactions':undefined;q=q.slice(0,-suffix[0].length);}
 const prefix=q.match(/^(?:(?:la|le|une?)\s+)?(?:(?:fiche|dossier)\s+)?(contact|client|listing|propri[ée]t[ée]|transaction)\s+(?:(?:de|du|au|à)\s+)?/i);
 if(prefix){section=/contact|client/i.test(prefix[1])?'contacts':/transaction/i.test(prefix[1])?'transactions':'listings';q=q.slice(prefix[0].length);}
 else {const dossier=/^(?:(?:le|un)\s+)?dossier\s+(?:de|du|au|à)\s+/i.test(q);if(dossier)section='transactions';q=q.replace(/^(?:(?:la|le|une?)\s+)?(?:fiche|dossier)\s+(?:de|du|au|à)\s+/i,'');}
 q=q.replace(/[, ]+(?:svp|stp|s'il (?:te|vous) pla[îi]t)$/i,'').trim();
 if(q.length>160)return;
 if(!section&&open&&!/\d/.test(q))section='contacts';
 return {section,query:q,open};
}
