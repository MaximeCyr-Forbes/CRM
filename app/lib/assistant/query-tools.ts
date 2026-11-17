import { z } from 'zod';
import { accessible, checked, type ToolDefinition } from '../mcp/read-tools';
import { broker, requireBroker, uuid } from '../mcp/access';
import { listListings } from '../listings/server-service';
import { getListingDisplayStatus } from '../listings/display-status';

// Complements existing MCP reads; executed only inside the same authenticated request scope.
export const queryTools: ToolDefinition[] = [
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
