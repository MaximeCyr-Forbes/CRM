import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { syncContactMortgageRenewals } from "../../../../lib/google-calendar/service";
import { getSupabaseAdmin } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const contactId = new URL(request.url).searchParams.get("contactId");
  if (!contactId) return Response.json({ error: "Contact invalide." }, { status: 400 });
  const { data, error } = await getSupabaseAdmin()
    .from("contact_mortgage_renewal_calendar_events")
    .select("sync_status")
    .eq("contact_id", contactId);
  if (error) return Response.json({ error: "État indisponible." }, { status: 502 });
  const counts = ((data ?? []) as Array<{ sync_status: "synced" | "pending" | "error" }>).reduce(
    (result, row) => ({ ...result, [row.sync_status]: result[row.sync_status] + 1 }),
    { synced: 0, pending: 0, error: 0 },
  );
  return Response.json(counts);
}

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as {
    contactIds?: unknown;
    limit?: unknown;
    retryErrors?: unknown;
  };
  const contactIds = Array.isArray(body.contactIds)
    ? body.contactIds.filter((id): id is string => typeof id === "string").slice(0, 100)
    : undefined;
  const limit = typeof body.limit === "number" ? body.limit : undefined;
  try {
    return Response.json(await syncContactMortgageRenewals({
      contactIds,
      limit,
      retryErrors: body.retryErrors !== false,
    }));
  } catch (error) {
    console.error(
      "Synchronisation des renouvellements hypothécaires impossible:",
      error instanceof Error ? error.message : "erreur inconnue",
    );
    return Response.json({ error: "Synchronisation des renouvellements hypothécaires impossible." }, { status: 502 });
  }
}
