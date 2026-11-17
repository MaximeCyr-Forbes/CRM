import { z } from 'zod';
import { accessible, checked, type ToolDefinition } from '../mcp/read-tools';
import { broker, date, requireBroker, uuid } from '../mcp/access';
import { listListings } from '../listings/server-service';
import { getListingDisplayStatus } from '../listings/display-status';
import {filterListings,type ListingStatusFilter} from '../listings/presentation';
import { listExpenses } from '../accounting/server';
import { selectAccounting } from './accounting-query';

// Complements existing MCP reads; executed only inside the same authenticated request scope.
export const queryTools: ToolDefinition[] = [
  {
    name:'crm_get_listing_transactions',write:false,description:'Dossiers réellement liés au Listing par listing_transaction_links.',schema:z.strictObject({listing_id:uuid}),
    run:async(a,db)=>{await accessible(db,'listings',a.listing_id);const rows=await checked(db.from('listing_transaction_links').select('transactions!inner(id,address,broker,status)').eq('listing_id',a.listing_id).order('transaction_id').limit(6));return {transactions:rows.slice(0,5).map(r=>r.transactions),truncated:rows.length>5};},
  },
  ...[
    {name:'crm_get_listing_visits',table:'listing_visits',fields:'id,visit_date,visit_time,interest_level'},
    {name:'crm_get_listing_offers',table:'listing_offers',fields:'id,offer_date,amount,status'},
    {name:'crm_get_listing_signs',table:'sign_assignments',fields:'id,sign_type,has_bac,returned_at'},
  ].map(({name,table,fields}):ToolDefinition=>({name,write:false,description:'Lire les éléments liés au Listing par sa clé officielle, sans opération de gestion.',schema:z.strictObject({listing_id:uuid}),run:async(a,db)=>{await accessible(db,'listings',a.listing_id);const rows=await checked(db.from(table).select(fields).eq('listing_id',a.listing_id).order('id').limit(6));return {data:rows.slice(0,5),truncated:rows.length>5};}})),
  {
    name:'crm_count_records',write:false,description:'Total exact dans le périmètre RLS, sans charger un extrait pour calculer le compte.',
    schema:z.strictObject({entity:z.enum(['contacts','transactions']),broker:broker.optional(),active:z.boolean().default(false)}),
    run:async(a,db,i)=>{if(a.broker)requireBroker(i,a.broker);let q=db.from(a.entity).select('id',{count:'exact',head:true}).in('broker',a.broker?[a.broker]:i.brokers);if(a.entity==='transactions'&&a.active)q=q.not('status','in','(completed,cancelled)');const {count,error}=await q;if(error)throw error;if(count===null)throw Error('ASSISTANT_INVALID_COUNT');return {total:count};},
  },
  {
    name:'crm_get_contact_transactions',write:false,description:'Transactions liées par la relation officielle transaction_contacts.',
    schema:z.strictObject({contact_id:uuid}),
    run:async(a,db)=>{await accessible(db,'contacts',a.contact_id);const rows=await checked(db.from('transaction_contacts').select('transactions!inner(id,address,broker,status)').eq('contact_id',a.contact_id).order('transaction_id').limit(6));return {transactions:rows.slice(0,5).map(r=>r.transactions),truncated:rows.length>5};},
  },
  {
    name:'crm_get_transaction_contacts',write:false,description:'Contacts liés au dossier; leur lien seul ne prouve pas un rôle de vendeur.',
    schema:z.strictObject({transaction_id:uuid}),
    run:async(a,db)=>{await accessible(db,'transactions',a.transaction_id);const rows=await checked(db.from('transaction_contacts').select('contacts!inner(id,first_name,last_name,broker)').eq('transaction_id',a.transaction_id).order('contact_id').limit(6));return {contacts:rows.slice(0,5).map(r=>r.contacts),truncated:rows.length>5};},
  },
  {
    name:'crm_query_accounting',write:false,description:'Rechercher des dépenses existantes sans matérialiser les récurrences; distinguer dépenses, paiements et factures.',
    schema:z.strictObject({query:z.string().max(160).default(''),mode:z.enum(['latest','expenses','payment','invoice','paid_total']),unpaid:z.boolean().default(false),broker:broker.optional(),from:date.optional(),to:date.optional(),aggregate:z.boolean().optional()}),
    run:async(a,_db,i)=>{requireBroker(i,null);if(a.broker)requireBroker(i,a.broker);return selectAccounting(await listExpenses({materialize:false}),a as Parameters<typeof selectAccounting>[1]);},
  },
  {
    name:'crm_get_listing_owners',write:false,description:'Lire les propriétaires réellement liés au Listing accessible, sans inférer de vendeur depuis une adresse.',
    schema:z.strictObject({listing_id:uuid}),
    run:async(a,db)=>{await accessible(db,'listings',a.listing_id);const rows=await checked(db.from('listing_contacts').select('contacts!inner(id,first_name,last_name)').eq('listing_id',a.listing_id).eq('role','owner').order('contact_id').limit(6));return {contacts:rows.slice(0,5).map(r=>r.contacts),truncated:rows.length>5};},
  },
  {
    name:'crm_get_broker_listings',write:false,description:'Lire les inscriptions d’un courtier autorisé, tous statuts, sans confusion avec les propriétaires.',
    schema:z.strictObject({broker,sort:z.enum(['price_desc']).optional(),status:z.enum(['all','active','upcoming','offers','conditional','closed']).optional(),purpose:z.enum(['sale','rental']).optional()}),
    run:async(a,_db,i)=>{requireBroker(i,a.broker);let rows=await listListings({broker:a.broker});if(a.status||a.purpose)rows=filterListings(rows,{broker:'all',status:(a.status??'all') as ListingStatusFilter,purpose:a.purpose??'all',search:''});if(a.sort)rows.sort((a,b)=>(b.askingPrice??-1)-(a.askingPrice??-1));return {total:rows.length,listings:rows.slice(0,5).map(r=>({id:r.id,address:r.address,broker:r.broker,status:r.status,askingPrice:r.askingPrice,displayStatus:getListingDisplayStatus(r).label})),truncated:rows.length>5};},
  },
  {
    name:'crm_get_due_contact_followups',write:false,description:'Lire les suivis enregistrés dus ou en retard, sans analyser les notes.',
    schema:z.strictObject({to:date,broker:broker.optional()}),
    run:async(a,db,i)=>{if(a.broker)requireBroker(i,a.broker);const rows=await checked(db.from('contacts').select('id,first_name,last_name,broker,next_follow_up_date').in('broker',a.broker?[a.broker]:i.brokers).lte('next_follow_up_date',a.to).order('next_follow_up_date').order('id').limit(6));return {data:rows.slice(0,5),truncated:rows.length>5};},
  },
  {
    name:'crm_get_private_deadlines',write:false,description:'Lire les échéances ouvertes des Transactions non closes autorisées, triées par date. Le filtre conditions cible les étapes en cours, sans interprétation juridique.',
    schema:z.strictObject({from:date,to:date,broker:broker.optional(),conditions:z.boolean().default(false),count:z.boolean().optional()}),
    run:async(a,db,i)=>{if(a.broker)requireBroker(i,a.broker);if(a.to<a.from)throw Error('INVALID_RANGE');let q=db.from('transaction_deadlines').select('id,transaction_id,title,due_date,due_time,transactions!inner(id,address,broker,status)',a.count?{count:'exact'}:undefined).eq('completed',false).in('transactions.broker',a.broker?[a.broker]:i.brokers).not('transactions.status','in','(completed,cancelled)').gte('due_date',a.from).lte('due_date',a.to);if(a.conditions)q=q.in('transactions.status',['pa_accepted','inspection','financing','other_conditions']);const result=await q.order('due_date').order('id').limit(6);if(result.error)throw result.error;const rows=result.data??[];if(a.count&&typeof result.count!=='number')throw Error('ASSISTANT_INVALID_COUNT');return {data:rows.slice(0,5),truncated:rows.length>5,...(a.count?{total:result.count}:{})};},
  },
  {
    name: 'crm_get_contact_listings', write: false,
    description: 'Vérifier les liens propriétaires réels entre un Contact identifié et ses Listings. Ne pas déduire un lien par adresse similaire. Résultats limités à cinq.',
    schema: z.strictObject({ contact_id: uuid }),
    run: async (args, db) => {
      await accessible(db, 'contacts', args.contact_id);
      const rows = await checked(db.from('listing_contacts')
        .select('listing_id,listings!inner(id,address,civic_number,city,broker,status,purpose,centris_standard_status,centris_mls_status)')
        .eq('contact_id', args.contact_id).eq('role', 'owner').order('listing_id').limit(6));
      return { listings: rows.slice(0, 5).map(row => row.listings), truncated: rows.length > 5 };
    },
  },
  {
    name: 'crm_get_active_broker_listings', write: false,
    description: 'Lire les Listings classés Actifs d’un courtier autorisé, selon la même classification Centris que le CRM. Retourne le total et cinq fiches maximum.',
    schema: z.strictObject({ broker,sort:z.enum(['price_desc']).optional(),purpose:z.enum(['sale','rental']).optional() }),
    run: async (args, _db, identity) => {
      requireBroker(identity, args.broker);
      const rows = await listListings({ broker: args.broker, status: 'active',...(args.purpose?{purpose:args.purpose}:{}) });
      if(args.sort)rows.sort((a,b)=>(b.askingPrice??-1)-(a.askingPrice??-1));
      return { total: rows.length, truncated: rows.length > 5, listings: rows.slice(0, 5).map(row => ({
        id: row.id, address: row.address, civicNumber: row.civicNumber, city: row.city,
        broker: row.broker, status: row.status, purpose: row.purpose,
        askingPrice: row.askingPrice, monthlyRent: row.monthlyRent, displayStatus: getListingDisplayStatus(row).label,
      })) };
    },
  },
  {
    name: 'crm_get_active_broker_transactions', write: false,
    description: 'Lire les Transactions non terminées et non annulées d’un courtier autorisé. Retourne cinq dossiers maximum, sans notes privées.',
    schema: z.strictObject({ broker }),
    run: async (args, db, identity) => {
      requireBroker(identity, args.broker);
      const rows = await checked(db.from('transactions').select('id,address,broker,type,status,price,notary_date')
        .eq('broker', args.broker).not('status', 'in', '(completed,cancelled)').order('id').limit(6));
      return { transactions: rows.slice(0, 5), truncated: rows.length > 5 };
    },
  },
];
