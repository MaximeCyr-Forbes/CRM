import { createHash, timingSafeEqual } from 'node:crypto';
import { CentrisError } from '../../../../lib/centris/client';
import { syncCentris } from '../../../../lib/centris/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(request: Request) {
  const secret = process.env.CENTRIS_CRON_SECRET;
  if (!secret?.trim()) return Response.json({ error: 'Configuration indisponible.' }, { status: 503, headers });
  const token = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!token || !timingSafeEqual(digest(token), digest(secret)))
    return Response.json({ error: 'Accès refusé.' }, { status: 401, headers });
  // No request body/query parameter can select a broker, scope or dry run.
  try {
    const result = await syncCentris({ memberId: null, broker: null, source: 'cron' }, false);
    const { fetched, eligible, created, updated, unchanged, skipped, conflicts, errors } = result;
    return Response.json({ status: errors || result.warnings.length ? 'partial' : 'success', fetched, eligible, created, updated, unchanged, skipped, conflicts, errors }, { headers });
  } catch (error) {
    if (error instanceof CentrisError && error.code === 'busy')
      return Response.json({ status: 'already_running' }, { status: 202, headers });
    return Response.json({ error: 'Synchronisation temporairement indisponible.' }, { status: 503, headers });
  }
}
