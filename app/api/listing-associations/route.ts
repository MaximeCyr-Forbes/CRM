import { z } from 'zod';
import { getAuthenticatedMember } from '../../lib/auth/server';
import { isSameOriginRequest } from '../../lib/google-calendar/config';
import { associationData, associationSummary, associationView } from '../../lib/listing-associations/server';
import { matchRecords } from '../../lib/listing-associations/matching';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const input = z.strictObject({ listingId: z.uuid(), transactionId: z.uuid(), kind: z.enum(['primary', 'historical']), listingVersion: z.iso.datetime({ offset: true }), transactionVersion: z.iso.datetime({ offset: true }), confirmed: z.literal(true), conflictAcknowledged: z.boolean().default(false), detachId: z.uuid().optional(), version: z.number().int().positive().optional() });
function failure(e: unknown) { const message = e && typeof e === 'object' && 'message' in e ? String(e.message) : ''; if (/FORBIDDEN|permission denied/.test(message))
    return reply({ error: 'Accès refusé aux dossiers demandés.' }, 403); if (/NOT_FOUND/.test(message))
    return reply({ error: 'Dossier inaccessible ou introuvable.' }, 404); if (/LINKED|STALE|23505|duplicate key/.test(message))
    return reply({ error: 'Les dossiers ou leurs liens ont changé. Actualisez et vérifiez le rattachement.' }, 409); return reply({ error: 'Rattachement temporairement indisponible. Aucun succès ne peut être confirmé.' }, 503); }
export async function GET(request: Request) { try {
    const auth = await getAuthenticatedMember();
    if (!auth)
        return reply({ error: 'Connexion individuelle requise.' }, 401);
    const url = new URL(request.url), data = await associationData(auth.client);
    if (url.searchParams.get('summary') === '1')
        return reply({ data: associationSummary(data) });
    const side = z.enum(['listing', 'transaction']).parse(url.searchParams.get('side')), id = z.uuid().parse(url.searchParams.get('id'));
    return reply({ data: associationView(data, side, id, (url.searchParams.get('q') ?? '').slice(0, 160)) });
}
catch (e) {
    if (e instanceof z.ZodError)
        return reply({ error: 'Recherche invalide.' }, 400);
    return failure(e);
} }
export async function POST(request: Request) {
    if (!isSameOriginRequest(request))
        return reply({ error: 'Origine refusée.' }, 403);
    try {
        const auth = await getAuthenticatedMember();
        if (!auth)
            return reply({ error: 'Connexion individuelle requise.' }, 401);
        if (Number(request.headers.get('content-length') ?? 0) > 4096)
            return reply({ error: 'Requête trop longue.' }, 413);
        const raw = await request.text();
        if (raw.length > 4096)
            return reply({ error: 'Requête trop longue.' }, 413);
        const a = input.parse(JSON.parse(raw));
        const data = await associationData(auth.client), l = data.listings.find(l => l.id === a.listingId), t = data.transactions.find(t => t.id === a.transactionId);
        if (!l || !t)
            return reply({ error: 'Accès refusé aux dossiers demandés.' }, 403);
        if (!a.detachId && matchRecords(l, t).kind === 'CONFLICT' && !a.conflictAcknowledged)
            return reply({ error: 'Vérifiez explicitement les différences entre les dossiers.' }, 409);
        const { data: result, error } = await auth.client.rpc('change_listing_association', { p_listing_id: a.listingId, p_transaction_id: a.transactionId, p_kind: a.kind, p_listing_version: a.listingVersion, p_transaction_version: a.transactionVersion, p_detach_id: a.detachId ?? null, p_version: a.version ?? null });
        if (error)
            throw error;
        if (!result)
            throw Error('ASSOCIATION_EMPTY_RESULT');
        return reply({ data: result });
    }
    catch (e) {
        if (e instanceof z.ZodError || e instanceof SyntaxError)
            return reply({ error: 'Confirmation invalide.' }, 400);
        return failure(e);
    }
}
