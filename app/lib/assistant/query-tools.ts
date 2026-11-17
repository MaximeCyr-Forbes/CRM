import { z } from 'zod';
import { accessible, checked, type ToolDefinition } from '../mcp/read-tools';
import { broker, date, requireBroker, uuid } from '../mcp/access';
import { listListings } from '../listings/server-service';
import { getListingDisplayStatus } from '../listings/display-status';

// Complements existing MCP reads; executed only inside the same authenticated request scope.
export const queryTools: ToolDefinition[] = [
  {
    name:'crm_get_listing_owners',write:false,description:'Lire les propriétaires réellement liés au Listing accessible, sans inférer de vendeur depuis une adresse.',
    schema:z.strictObject({listing_id:uuid}),
    run:async(a,db)=>{await accessible(db,'listings',a.listing_id);const rows=await checked(db.from('listing_contacts').select('contacts!inner(id,first_name,last_name)').eq('listing_id',a.listing_id).eq('role','owner').order('contact_id').limit(6));return {contacts:rows.slice(0,5).map(r=>r.contacts),truncated:rows.length>5};},
  },
  {
    name:'crm_get_broker_listings',write:false,description:'Lire les inscriptions d’un courtier autorisé, tous statuts, sans confusion avec les propriétaires.',
    schema:z.strictObject({broker}),
    run:async(a,_db,i)=>{requireBroker(i,a.broker);const rows=await listListings({broker:a.broker});return {total:rows.length,listings:rows.slice(0,5).map(r=>({id:r.id,address:r.address,broker:r.broker,status:r.status,displayStatus:getListingDisplayStatus(r).label})),truncated:rows.length>5};},
  },
  {
    name:'crm_get_due_contact_followups',write:false,description:'Lire les suivis enregistrés dus ou en retard, sans analyser les notes.',
    schema:z.strictObject({to:date,broker:broker.optional()}),
    run:async(a,db,i)=>{if(a.broker)requireBroker(i,a.broker);const rows=await checked(db.from('contacts').select('id,first_name,last_name,broker,next_follow_up_date').in('broker',a.broker?[a.broker]:i.brokers).lte('next_follow_up_date',a.to).order('next_follow_up_date').order('id').limit(6));return {data:rows.slice(0,5),truncated:rows.length>5};},
  },
  {
    name:'crm_get_private_deadlines',write:false,description:'Lire les échéances ouvertes des Transactions non closes autorisées, triées par date. Le filtre conditions cible les étapes en cours, sans interprétation juridique.',
    schema:z.strictObject({from:date,to:date,broker:broker.optional(),conditions:z.boolean().default(false)}),
    run:async(a,db,i)=>{if(a.broker)requireBroker(i,a.broker);if(a.to<a.from)throw Error('INVALID_RANGE');let q=db.from('transaction_deadlines').select('id,transaction_id,title,due_date,due_time,transactions!inner(id,address,broker,status)').eq('completed',false).in('transactions.broker',a.broker?[a.broker]:i.brokers).not('transactions.status','in','(completed,cancelled)').gte('due_date',a.from).lte('due_date',a.to);if(a.conditions)q=q.in('transactions.status',['pa_accepted','inspection','financing','other_conditions']);const rows=await checked(q.order('due_date').order('id').limit(6));return {data:rows.slice(0,5),truncated:rows.length>5};},
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
    schema: z.strictObject({ broker }),
    run: async (args, _db, identity) => {
      requireBroker(identity, args.broker);
      const rows = await listListings({ broker: args.broker, status: 'active' });
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
