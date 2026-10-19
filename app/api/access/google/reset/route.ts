import { clearGoogleSession } from '../../../../lib/auth/google-session';
import { isSameOriginRequest } from '../../../../lib/google-calendar/config';
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: 'Origine refusée.' }, { status: 403 });
  await clearGoogleSession();
  return Response.json({ cleared: true }, { headers: { 'Cache-Control': 'no-store' } });
}
