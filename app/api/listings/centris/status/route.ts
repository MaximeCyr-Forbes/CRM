import { withCRMIdentity } from '../../../../lib/auth/route';
import { requireApiAccess } from '../../../../lib/crm-access';
import { crmMemberContext } from '../../../../lib/auth/context';
import { centrisStatus } from '../../../../lib/centris/sync';
export const dynamic = 'force-dynamic';
export const GET = withCRMIdentity(async () => {
  const access = await requireApiAccess(); if (access.response) return access.response;
  if (!crmMemberContext.getStore()) return Response.json({ error: 'Connexion individuelle requise.' }, { status: 403 });
  try { return Response.json({ data: await centrisStatus() }, { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return Response.json({ error: 'État Centris temporairement indisponible.' }, { status: 503 }); }
});
