import { withCRMIdentity } from '../../../../lib/auth/route';
import { requireApiAccess } from '../../../../lib/crm-access';
import { crmMemberContext } from '../../../../lib/auth/context';
import { isSameOriginRequest } from '../../../../lib/google-calendar/config';
import { CentrisError } from '../../../../lib/centris/client';
import { syncCentris } from '../../../../lib/centris/sync';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const POST = withCRMIdentity(async (request: Request) => {
  const access = await requireApiAccess(); if (access.response) return access.response;
  const actor = crmMemberContext.getStore();
  if (!actor) return Response.json({ error: 'Connexion individuelle requise.' }, { status: 403 });
  if (!isSameOriginRequest(request)) return Response.json({ error: 'Origine refusée.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.dryRun !== 'boolean' || Object.keys(body).some(k => k !== 'dryRun'))
    return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  try { return Response.json({ data: await syncCentris(actor, body.dryRun) }, { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) {
    const safe = error instanceof CentrisError ? error : new CentrisError('unavailable');
    return Response.json({ error: safe.message }, { status: safe.code === 'busy' ? 409 : 503 });
  }
});
