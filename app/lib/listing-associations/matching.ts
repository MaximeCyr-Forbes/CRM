export type Entity = {
    id: string;
    address: string;
    centris: string;
    broker: string;
    status: string;
    type: string;
    price: number | null;
    updatedAt: string;
    createdAt: string;
    city?: string;
    unit?: string;
    postal?: string;
};
export type Association = {
    id: string;
    listingId: string;
    transactionId: string;
    kind: 'primary' | 'historical';
    source: 'documentary' | 'accepted_offer';
    version: number;
    createdAt: string;
    createdBy: string;
    detachedAt: string | null;
    detachedBy: string | null;
};
export type MatchKind = 'EXACT_CENTRIS' | 'EXACT_ADDRESS' | 'HIGH_CONFIDENCE_ADDRESS' | 'POSSIBLE_MATCH' | 'CONFLICT' | 'NO_MATCH';
export type Match = {
    kind: MatchKind;
    reasons: string[];
    historical: boolean;
    blocked: boolean;
};
export const normalizeAddress = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(?:avenue|av)\b/g, 'avenue').replace(/\b(?:boulevard|boul)\b/g, 'boulevard').replace(/\b(?:rue|r)\b/g, 'rue')
    .replace(/\b(?:sainte|ste)\b/g, 'sainte').replace(/\b(?:saint|st)\b/g, 'saint')
    .replace(/\b(?:est|e)\b/g, 'est').replace(/\b(?:ouest|o)\b/g, 'ouest').replace(/\b(?:nord|n)\b/g, 'nord').replace(/\b(?:sud|s)\b/g, 'sud')
    .replace(/\b(?:quebec|pq|qc)\b/g, 'qc').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function parts(e: Entity, cityHint: string) {
    const raw = normalizeAddress(e.address), city = normalizeAddress(e.city ?? cityHint).split(/\s*\(/)[0];
    const town = normalizeAddress((e.city ?? cityHint).split('(')[0]);
    const cityKnown = !!town && (!!e.city || raw.includes(town));
    const unit = normalizeAddress(e.unit || e.address.match(/(?:app(?:artement)?\.?|unit[ée]?|suite|#)\s*([a-z0-9-]+)/i)?.[1] || '');
    const postal = normalizeAddress(e.postal || e.address.match(/[a-z]\d[a-z][ -]?\d[a-z]\d/i)?.[0] || '').replace(/ /g, '');
    const civic = raw.match(/^\d+[a-z]?\b/)?.[0] ?? '';
    let street = raw.slice(civic.length).trim();
    if (cityKnown)
        street = street.split(town)[0];
    else
        street = normalizeAddress(e.address.split(',')[0]).slice(civic.length).trim();
    street = street.replace(/\b(?:appartement|app|unite|unit|suite)\b.*$/, '').replace(/\b[a-z]\d[a-z]\s*\d[a-z]\d\b.*$/, '').replace(/\bqc\b.*$/, '').trim();
    return { civic, street, city, cityKnown, unit, postal, direction: street.match(/\b(est|ouest|nord|sud)\b/)?.[0] ?? '' };
}
export function matchRecords(listing: Entity, transaction: Entity): Match {
    const a = parts(listing, listing.city ?? ''), b = parts(transaction, listing.city ?? ''), reasons: string[] = [];
    const sameCentris = !!listing.centris.trim() && listing.centris.trim() === transaction.centris.trim();
    const sameCivic = !!a.civic && a.civic === b.civic, sameStreet = !!a.street && a.street === b.street;
    const sameCity = a.cityKnown && b.cityKnown && a.city === b.city, samePostal = !!a.postal && a.postal === b.postal;
    const conflicts: string[] = [];
    if (a.cityKnown && b.cityKnown && a.city !== b.city)
        conflicts.push('Villes différentes');
    if (a.civic && b.civic && a.civic !== b.civic)
        conflicts.push('Numéros civiques différents');
    if (a.unit && b.unit && a.unit !== b.unit)
        conflicts.push('Appartements différents');
    if (a.direction && b.direction && a.direction !== b.direction)
        conflicts.push('Directions différentes');
    if (a.postal && b.postal && a.postal !== b.postal)
        conflicts.push('Codes postaux différents');
    if (listing.type !== 'sale' || transaction.type !== 'sale')
        conflicts.push('Type de dossier à vérifier');
    if (sameCentris && !sameStreet && a.street && b.street)
        conflicts.push('Adresse différente malgré le numéro Centris');
    let kind: MatchKind = 'NO_MATCH';
    if (sameCentris) {
        reasons.push('Même numéro Centris');
        kind = 'EXACT_CENTRIS';
    }
    else if (sameCivic && sameStreet && sameCity) {
        kind = samePostal && a.unit === b.unit ? 'EXACT_ADDRESS' : 'HIGH_CONFIDENCE_ADDRESS';
        reasons.push('Adresse concordante');
    }
    else if (sameCivic && sameStreet && samePostal) {
        kind = 'HIGH_CONFIDENCE_ADDRESS';
        reasons.push('Rue et code postal concordants');
    }
    else if (sameCivic && sameStreet) {
        kind = 'POSSIBLE_MATCH';
        reasons.push('Adresse similaire, vérification requise');
    }
    if (kind !== 'NO_MATCH' && conflicts.length) {
        kind = 'CONFLICT';
        reasons.push(...conflicts);
    }
    if (kind !== 'NO_MATCH' && a.unit !== b.unit && (!a.unit || !b.unit)) {
        kind = 'CONFLICT';
        reasons.push('Appartement non confirmé sur une des fiches');
    }
    if (listing.broker === transaction.broker)
        reasons.push('Même courtier');
    else if (kind !== 'NO_MATCH')
        reasons.push('Courtiers différents, à vérifier');
    const historical = transaction.status === 'cancelled';
    if (historical)
        reasons.push('Transaction historique annulée');
    return { kind, reasons, historical, blocked: false };
}
export const strongMatch = (m: Match) => ['EXACT_CENTRIS', 'EXACT_ADDRESS', 'HIGH_CONFIDENCE_ADDRESS'].includes(m.kind) && !m.blocked && !m.historical;
export function rankMatches(a: {
    match: Match;
    entity: Entity;
}, b: {
    match: Match;
    entity: Entity;
}) {
    const rank: Record<MatchKind, number> = { EXACT_CENTRIS: 0, EXACT_ADDRESS: 1, HIGH_CONFIDENCE_ADDRESS: 2, POSSIBLE_MATCH: 3, CONFLICT: 4, NO_MATCH: 5 };
    return Number(a.match.blocked) - Number(b.match.blocked) || Number(a.match.historical) - Number(b.match.historical) || rank[a.match.kind] - rank[b.match.kind] || Number(!a.match.reasons.includes('Même courtier')) - Number(!b.match.reasons.includes('Même courtier')) || b.entity.createdAt.localeCompare(a.entity.createdAt) || a.entity.id.localeCompare(b.entity.id);
}
export function withLinkConflicts(match: Match, listingId: string, transactionId: string, links: Association[], transactions: Entity[]): Match {
    const active = links.filter(l => !l.detachedAt);
    const elsewhere = active.some(l => l.transactionId === transactionId && l.listingId !== listingId);
    const current = active.some(l => l.listingId === listingId && l.transactionId !== transactionId && l.kind === 'primary' && transactions.find(t => t.id === l.transactionId)?.status !== 'cancelled');
    return { ...match, blocked: elsewhere || (!match.historical && current), reasons: [...match.reasons, ...(elsewhere ? ['Transaction déjà liée à un autre Listing'] : []), ...(!match.historical && current ? ['Le Listing possède déjà une Transaction principale'] : [])] };
}
