import { birthdayWorkspaceActor, requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { DirectClientError } from "../../../../lib/transactions/direct-clients";
import { deleteDirectClient, listDirectClients, saveDirectClient } from "../../../../lib/transactions/direct-clients-server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ transactionId: string }> };
function failure(error: unknown) {
  if (error instanceof DirectClientError) return Response.json({ error: error.message, duplicates: error.duplicates }, { status: error.status });
  console.error("Direct client operation failed", { code: (error as { code?: string })?.code });
  return Response.json({ error: "Impossible d’enregistrer ou de charger les clients directs. Réessayez." }, { status: 502 });
}
export async function GET(_request: Request, context: Context) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  try { return Response.json({ data: await listDirectClients((await context.params).transactionId) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return failure(error); }
}
async function mutate(request: Request, context: Context, action: "create" | "edit" | "delete") {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const actor = await birthdayWorkspaceActor(request);
  if (!actor) return Response.json({ error: "Sélectionnez votre espace utilisateur." }, { status: 403 });
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new DirectClientError("Requête invalide.");
    const { transactionId } = await context.params;
    if (action === "delete") {
      if (body.confirm !== true) throw new DirectClientError("Confirmez la suppression.");
      await deleteDirectClient(transactionId, body.id);
      return Response.json({ success: true });
    }
    return Response.json({ data: await saveDirectClient(transactionId, body, actor, action === "edit") }, { status: action === "create" ? 201 : 200 });
  } catch (error) { return failure(error); }
}
export const POST = (request: Request, context: Context) => mutate(request, context, "create");
export const PATCH = (request: Request, context: Context) => mutate(request, context, "edit");
export const DELETE = (request: Request, context: Context) => mutate(request, context, "delete");
