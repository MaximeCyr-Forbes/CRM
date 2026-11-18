import type { SupabaseClient } from '@supabase/supabase-js';
import { matchRecords, normalizeAddress, rankMatches, strongMatch, withLinkConflicts, type Entity, type Association } from './matching';
type Row = Record<string, any>;
const listingColumns = 'id,civic_number,address,apartment,city,postal_code,centris_number,broker,status,purpose,asking_price,monthly_rent,created_at,updated_at';
const transactionColumns = 'id,address,centris_number,broker,status,type,price,created_at,updated_at';
export function mapEntity(r: Row, side: 'listing' | 'transaction'): Entity { return { id: r.id, address: side === 'listing' ? [r.civic_number, r.address, r.apartment ? `app. ${r.apartment}` : '', r.city, r.postal_code].filter(Boolean).join(' ') : r.address, centris: r.centris_number ?? '', broker: r.broker, status: r.status, type: side === 'listing' ? r.purpose : r.type, price: side === 'listing' ? (r.purpose === 'rental' ? r.monthly_rent : r.asking_price) : r.price, createdAt: r.created_at, updatedAt: r.updated_at, ...(side === 'listing' ? { city: r.city, unit: r.apartment, postal: r.postal_code } : {}) }; }
async function all(db: SupabaseClient, table: string, columns: string) {
    const rows: Row[] = [];
    for (let offset = 0; offset < 10000; offset += 500) {
        const { data, error } = await db.from(table).select(columns).order(table === 'listing_transaction_links' ? 'transaction_id' : 'id').range(offset, offset + 499);
        if (error)
            throw error;
        rows.push(...data as Row[]);
        if (data.length < 500)
            return rows;
    }
    throw Error('ASSOCIATION_TOO_MANY_RESULTS');
}
export async function associationData(db: SupabaseClient) {
    const [lr, tr, ar, old] = await Promise.all([all(db, 'listings', listingColumns), all(db, 'transactions', transactionColumns), all(db, 'listing_transaction_associations', '*'), all(db, 'listing_transaction_links', 'listing_id,transaction_id,offer_id,created_at')]);
    const listings = lr.map(r => mapEntity(r, 'listing')), transactions = tr.map(r => mapEntity(r, 'transaction'));
    const visible = (r: Row) => listings.some(l => l.id === r.listing_id) && transactions.some(t => t.id === r.transaction_id);
    const associations: Association[] = [...ar.filter(visible).map(r => ({ id: r.id, listingId: r.listing_id, transactionId: r.transaction_id, kind: r.relation_kind, source: 'documentary' as const, version: r.version, createdAt: r.created_at, createdBy: r.created_by_broker, detachedAt: r.detached_at, detachedBy: r.detached_by_broker })), ...old.filter(visible).map(r => ({ id: r.offer_id, listingId: r.listing_id, transactionId: r.transaction_id, kind: transactions.find(t => t.id === r.transaction_id)?.status === 'cancelled' ? 'historical' as const : 'primary' as const, source: 'accepted_offer' as const, version: 1, createdAt: r.created_at, createdBy: '', detachedAt: null, detachedBy: null }))];
    return { listings, transactions, associations };
}
export type AssociationData = Awaited<ReturnType<typeof associationData>>;
export function associationView(data: AssociationData, side: 'listing' | 'transaction', id: string, search = '') {
    const own = (side === 'listing' ? data.listings : data.transactions).find(e => e.id === id);
    if (!own)
        throw Error('ASSOCIATION_NOT_FOUND');
    const linked = data.associations.filter(l => side === 'listing' ? l.listingId === id : l.transactionId === id).map(l => ({ ...l, entity: (side === 'listing' ? data.transactions : data.listings).find(e => e.id === (side === 'listing' ? l.transactionId : l.listingId))! }));
    const query = normalizeAddress(search);
    const candidates = (side === 'listing' ? data.transactions : data.listings).filter(e => !linked.some(l => !l.detachedAt && l.entity.id === e.id)).map(entity => {
        const listing = side === 'listing' ? own : entity, transaction = side === 'transaction' ? own : entity;
        return { entity, match: withLinkConflicts(matchRecords(listing, transaction), listing.id, transaction.id, data.associations, data.transactions) };
    }).filter(c => query ? normalizeAddress(`${c.entity.address} ${c.entity.centris}`).includes(query) : c.match.kind !== 'NO_MATCH').sort(rankMatches);
    return { own, linked, candidates: candidates.slice(0, 20), truncated: candidates.length > 20 };
}
export type AssociationView = ReturnType<typeof associationView>;
export function associationSummary(data: AssociationData) {
    const listings: string[] = [], transactions: string[] = [];
    for (const l of data.listings) {
        const v = associationView(data, 'listing', l.id);
        if (!v.linked.some(a => !a.detachedAt && a.kind === 'primary' && a.entity.status !== 'cancelled') && v.candidates.some(c => strongMatch(c.match)))
            listings.push(l.id);
    }
    for (const t of data.transactions) {
        const v = associationView(data, 'transaction', t.id);
        if (!v.linked.some(a => !a.detachedAt) && v.candidates.some(c => strongMatch(c.match)))
            transactions.push(t.id);
    }
    return { listings, transactions };
}
