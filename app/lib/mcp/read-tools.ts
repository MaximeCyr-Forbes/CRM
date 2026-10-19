import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import {getTransaction} from '../transactions/server-service';
import {getListing} from '../listings/server-service';
import {listExpenses} from '../accounting/server';
import {filterExpenses,expenseTotals,todayToronto} from '../accounting/model';
import {listBrokerBalances} from '../accounting/balances-server';
import {listReferrals} from '../mortgage-referrals/server';
import {paymentSummary} from '../mortgage-referrals/payments';
import {MCPAccessError,broker,date,pagination,pageResult,requireBroker,search,searchNeedle,uuid,type MCPIdentity} from './access';

export type ToolDefinition = {name:string;description:string;schema:z.ZodObject;write:boolean;run:(input:Record<string,any>,db:SupabaseClient,identity:MCPIdentity)=>Promise<unknown>};
const contactColumns='id,first_name,last_name,phone,email,broker,client_type,client_provenance,source,address,civic_number,city,postal_code,status';
const transactionColumns='id,address,centris_number,broker,type,status,price,notary_date,promise_date';
const listingColumns='id,civic_number,address,city,centris_number,broker,status,asking_price,monthly_rent';
export async function checked<T>(query:PromiseLike<{data:T;error:unknown}>) {const {data,error}=await query;if(error)throw error;return data as NonNullable<T>;}
export async function accessible(db:SupabaseClient,table:string,id:string) {
 const row=await checked(db.from(table).select('id').eq('id',id).maybeSingle());
 if(!row)throw new MCPAccessError('NOT_FOUND','Ressource introuvable ou inaccessible.');
 return row;
}
const read=(name:string,description:string,shape:z.ZodRawShape,run:ToolDefinition['run']):ToolDefinition=>({name,description,schema:z.strictObject(shape),write:false,run});
const searchEntity=async(db:SupabaseClient,table:string,columns:string,fields:string[],a:Record<string,any>)=>{
 const needle=searchNeedle(a.query);if(!needle)throw new MCPAccessError('INVALID_INPUT','Recherche trop imprécise.');
 const tokens=needle.split(/\s+/).filter(Boolean).slice(0,8);
 const whole=fields.map(f=>`${f}.ilike.%${needle}%`);
 if(tokens.length>1) whole.push(`and(${tokens.map(token=>`or(${fields.map(f=>`${f}.ilike.%${token}%`).join(',')})`).join(',')})`);
 const digits=needle.replace(/\D/g,'');
 if(fields.includes('phone') && /^[\d\s+()-]+$/.test(needle) && digits.length>=7) whole.push(`phone.ilike.%${digits.split('').join('%')}%`);
 const rows=await checked(db.from(table).select(columns).or(whole.join(',')).order('id').range(a.page*a.limit,(a.page+1)*a.limit));
 return pageResult(rows,a.page,a.limit);
};
const accountingShape={...pagination,period:z.enum(['month','year','all','undated']).default('all'),category:z.enum(['all','marketing','operation','broker']).default('all'),broker:broker.optional(),year:z.string().regex(/^\d{4}$/).optional(),month:z.string().regex(/^(0[1-9]|1[0-2])$/).optional(),search:z.string().max(160).default(''),status:z.enum(['all','paid','unpaid']).default('all')};
async function accountingRows(a:Record<string,any>,identity:MCPIdentity){
 if(a.category==='broker'){if(a.broker)requireBroker(identity,a.broker);}else requireBroker(identity,null);
 return filterExpenses(await listExpenses({materialize:false}),{category:a.category,broker:a.broker,period:a.period,year:a.year??todayToronto().slice(0,4),month:a.month,search:a.search,payment:a.status});
}
export const readTools:ToolDefinition[]=[
 read('crm_search','Rechercher contacts, listings et transactions par nom ou adresse. Utiliser ensuite leur identifiant pour un détail ou une action. Ne retourne aucun résultat hors de votre accès.',{query:search,...pagination},async(a,db)=>({
  contacts:await searchEntity(db,'contacts',contactColumns,['first_name','last_name','email','phone','address'],a),
  listings:await searchEntity(db,'listings',listingColumns,['civic_number','address','centris_number','city'],a),
  transactions:await searchEntity(db,'transactions',transactionColumns,['address','centris_number'],a),
 })),
 read('crm_search_contacts','Rechercher des contacts par nom, téléphone, courriel, adresse ou provenance. Résultats paginés; ne pas utiliser pour une modification.',{query:search,...pagination},(a,db)=>searchEntity(db,'contacts',contactColumns,['first_name','last_name','email','phone','address','client_provenance'],a)),
 read('crm_get_contact','Lire les coordonnées et la provenance d’un contact identifié. Pour chercher un identifiant, utiliser crm_search_contacts.',{contact_id:uuid},async(a,db)=>{await accessible(db,'contacts',a.contact_id);return checked(db.from('contacts').select(contactColumns+',contact_addresses(id,civic_number,address,city,province,postal_code,is_primary)').eq('id',a.contact_id).single());}),
 read('crm_search_listings','Rechercher les propriétés inscrites par adresse ou numéro Centris; ne modifie aucune inscription.',{query:search,...pagination},(a,db)=>searchEntity(db,'listings',listingColumns,['civic_number','address','city','centris_number'],a)),
 read('crm_get_listing','Lire une inscription accessible à partir de son identifiant CRM.',{listing_id:uuid},async(a,db)=>{await accessible(db,'listings',a.listing_id);return getListing(a.listing_id);}),
 read('crm_search_transactions','Rechercher une transaction par adresse partielle ou numéro Centris. Retourne les identifiants pour les actions suivantes.',{query:search,...pagination},(a,db)=>searchEntity(db,'transactions',transactionColumns,['address','centris_number'],a)),
 read('crm_get_transaction','Lire le dossier transactionnel: adresse, statut, courtier, prix, contacts, notaire, notes récentes et échéances. Aucun contenu Drive n’est téléchargé.',{transaction_id:uuid},async(a,db)=>{
  await accessible(db,'transactions',a.transaction_id);const tx=await getTransaction(a.transaction_id);
  const {count,error}=await db.from('transaction_direct_clients').select('id',{count:'exact',head:true}).eq('transaction_id',tx.id);if(error)throw error;
  return {...tx,notes:tx.notes.slice(0,20).map(n=>({...n,content:n.content.slice(0,2000),truncated:n.content.length>2000})),deadlines:tx.deadlines.slice(0,50).map(d=>({...d,source:d.source ? {...d.source,text:undefined} : undefined})),direct_clients_count:count,crm_url:`${process.env.NEXT_PUBLIC_APP_URL}/transactions/${tx.id}`};
 }),
 read('crm_get_transaction_timeline','Lire les échéances avec date, heure réelle ou null, statut, source et confiance. Ne crée aucun événement Google.',{transaction_id:uuid,...pagination},async(a,db)=>{
  await accessible(db,'transactions',a.transaction_id);const rows=await checked(db.from('transaction_deadlines').select('id,title,due_date,due_time,completed,source_type,source_document,source_form,source_section,source_confidence').eq('transaction_id',a.transaction_id).order('due_date').order('id').range(a.page*a.limit,(a.page+1)*a.limit));
  return pageResult(rows.map(r=>({id:r.id,label:r.title,date:r.due_date,time:r.due_time,status:r.completed?'done':'pending',source:{type:r.source_type,document:r.source_document,form:r.source_form,section:r.source_section},confidence:r.source_confidence})),a.page,a.limit);
 }),
 ...['crm_get_transaction_documents','crm_get_transaction_drive_links'].map(name=>read(name,'Lire les dossiers Drive liés à la transaction. Le CRM conserve les liens, pas le contenu des fichiers; utiliser le connecteur Google Drive pour ouvrir les documents.',{transaction_id:uuid,...pagination},async(a,db)=>{
  await accessible(db,'transactions',a.transaction_id);return pageResult(await checked(db.from('google_drive_entity_links').select('id,folder_id,folder_name,web_view_link,broker').eq('transaction_id',a.transaction_id).order('id').range(a.page*a.limit,(a.page+1)*a.limit)),a.page,a.limit);
 })),
 read('crm_get_direct_clients','Lire les prospects directs d’une transaction, avec leurs coordonnées et la demande reçue. Aucun courriel n’est envoyé.',{transaction_id:uuid,...pagination},async(a,db)=>{await accessible(db,'transactions',a.transaction_id);return pageResult(await checked(db.from('transaction_direct_clients').select('id,name,email,phone,source,request_date,request_note').eq('transaction_id',a.transaction_id).order('id').range(a.page*a.limit,(a.page+1)*a.limit)),a.page,a.limit);}),
 read('crm_get_accounting_expenses','Lire les dépenses et métadonnées de factures, toutes périodes par défaut (y compris futures et sans date). category=broker pour les dépenses des courtiers; autres catégories pour les dépenses d’équipe. Aucune récurrence n’est créée par cette lecture.',accountingShape,async(a,_db,i)=>{const rows=await accountingRows(a,i);return pageResult(rows.slice(a.page*a.limit,(a.page+1)*a.limit+1),a.page,a.limit);}),
 read('crm_get_accounting_summary','Calculer les totaux comptables avec les mêmes filtres que la liste des dépenses. Les totaux couvrent toutes les lignes filtrées, pas seulement une page.',accountingShape,async(a,_db,i)=>expenseTotals(await accountingRows(a,i))),
 read('crm_get_broker_balances','Lire les soldes marketing accessibles et leur version requise pour une modification.',{...pagination},async(a)=>{const rows=await listBrokerBalances();return pageResult(rows.slice(a.page*a.limit,(a.page+1)*a.limit+1),a.page,a.limit);}),
 read('crm_get_mortgage_referrals','Lire les références hypothécaires d’un courtier autorisé. Filtrer les paiements par année; les références à venir n’ont pas encore de date de paiement.',{broker,status:z.enum(['all','upcoming','paid']).default('all'),year:z.number().int().min(1900).max(2200).optional(),...pagination},async(a,_db,i)=>{requireBroker(i,a.broker);const rows=(await listReferrals(a.broker)).filter(r=>(a.status==='all'||(a.status==='paid'?!!r.paid_at:!r.paid_at))&&(!a.year||!r.paid_at||r.paid_at.slice(0,4)===String(a.year)));return pageResult(rows.slice(a.page*a.limit,(a.page+1)*a.limit+1),a.page,a.limit);}),
 read('crm_get_mortgage_referral_summary','Lire les montants réellement reçus dans une année et les références à venir, selon la logique annuelle du CRM.',{broker,year:z.number().int().min(1900).max(2200)},async(a,_db,i)=>{requireBroker(i,a.broker);return paymentSummary(await listReferrals(a.broker),a.broker,a.year);}),
 read('crm_get_sign_inventory','Lire les stocks et disponibilités autorisés. Les quantités partagées sont calculées sur tout l’inventaire, sans exposer les dossiers d’autres courtiers.',{...pagination},async(a,db)=>{const rows=await checked(db.rpc('crm_inventory_availability'));return pageResult(rows.slice(a.page*a.limit,(a.page+1)*a.limit+1),a.page,a.limit);}),
 read('crm_get_sign_assignments','Lire les attributions de pancartes, BAC et ajouts avec leur version. history=true inclut uniquement le matériel retourné.',{history:z.boolean().default(false),...pagination},async(a,db)=>{let q=db.from('sign_assignments').select('id,listing_id,address_snapshot,broker,sign_type,has_bac,version,created_at,returned_at,sign_assignment_addons(stock_id)');q=a.history?q.not('returned_at','is',null):q.is('returned_at',null);return pageResult(await checked(q.order('id').range(a.page*a.limit,(a.page+1)*a.limit)),a.page,a.limit);}),
 read('crm_get_recommendations','Lire les recommandations internes. Réservé à l’administrateur disposant de cette permission; ne remplace pas une recherche de contacts.',{...pagination},async(a,db,i)=>{if(!i.canManageRecommendations)throw new MCPAccessError('FORBIDDEN','Permission administrateur requise.');return pageResult(await checked(db.from('crm_recommendations').select('id,title,content,submitted_by,status,is_completed,created_at').order('created_at',{ascending:false}).order('id').range(a.page*a.limit,(a.page+1)*a.limit)),a.page,a.limit);}),
 read('crm_get_upcoming_deadlines','Lire les prochaines échéances internes non terminées dans une plage de dates. Aucun événement Google n’est créé.',{from:date,to:date,...pagination},async(a,db)=>{if(a.to<a.from)throw new MCPAccessError('INVALID_INPUT','Plage de dates invalide.');return pageResult(await checked(db.from('transaction_deadlines').select('id,transaction_id,title,due_date,due_time,source_form,source_confidence').eq('completed',false).gte('due_date',a.from).lte('due_date',a.to).order('due_date').order('id').range(a.page*a.limit,(a.page+1)*a.limit)),a.page,a.limit);}),
];
