import { requireApiAccess } from "../../lib/crm-access";
import { isSameOriginRequest } from "../../lib/google-calendar/config";
import { GoogleCalendarNotConnectedError } from "../../lib/google-calendar/service";
import { createReferral, listReferrals, searchReferralTransactions } from "../../lib/mortgage-referrals/server";
import { ReferralError, referralBroker } from "../../lib/mortgage-referrals/validation";
export const dynamic = "force-dynamic";
export function referralResponseError(error: unknown) {
  if (error instanceof GoogleCalendarNotConnectedError) return Response.json({ error: "Google Agenda doit être connecté pour planifier ce suivi.", settings: true }, { status: 409 });
  if (error instanceof ReferralError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Mortgage referral operation failed", { code: (error as { code?: string })?.code });
  return Response.json({ error: "Opération impossible. Réessayez pour terminer la synchronisation." }, { status: 502 });
}
export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  try {
    const url = new URL(request.url);
    const broker = referralBroker(url.searchParams.get("broker"));
    const data = url.searchParams.get("transactions") === "true"
      ? await searchReferralTransactions(broker, url.searchParams.get("q") ?? "") : await listReferrals(broker);
    return Response.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return referralResponseError(error); }
}
export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ReferralError("Requête invalide.");
    return Response.json({ data: await createReferral(body) }, { status: 201 });
  } catch (error) { return referralResponseError(error); }
}
