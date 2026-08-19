import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { listingApiError } from "../../../../lib/listings/api-response";
import { isListingBroker, isUuid } from "../../../../lib/listings/persistence";
import {
  addListingTask, addListingVisit, deleteListingTask, deleteListingVisit,
  getListingTracking, toggleListingTask, updateListingTask, updateListingVisit,
} from "../../../../lib/listings/tracking";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ listingId: string }> };

async function listingIdFrom(context: Context) {
  const { listingId } = await context.params;
  return isUuid(listingId) ? listingId : null;
}

function actorFrom(value: unknown) {
  if (value === null || value === undefined) return null;
  return isListingBroker(value) ? value : undefined;
}

export async function GET(_request: Request, context: Context) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const listingId = await listingIdFrom(context);
  if (!listingId) return Response.json({ error: "Listing invalide." }, { status: 400 });
  try {
    return Response.json({ data: await getListingTracking(listingId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return listingApiError(error, "Chargement du suivi impossible.");
  }
}

async function writable(request: Request, context: Context) {
  const access = await requireApiAccess();
  if (access.response) return { response: access.response } as const;
  if (!isSameOriginRequest(request)) return { response: Response.json({ error: "Origine refusée." }, { status: 403 }) } as const;
  const listingId = await listingIdFrom(context);
  if (!listingId) return { response: Response.json({ error: "Listing invalide." }, { status: 400 }) } as const;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const actor = actorFrom(body?.actorBroker);
  if (!body || actor === undefined) return { response: Response.json({ error: "Action de suivi invalide." }, { status: 400 }) } as const;
  return { response: null, listingId, body, actor } as const;
}

export async function POST(request: Request, context: Context) {
  const input = await writable(request, context);
  if (input.response) return input.response;
  try {
    if (input.body.action === "addTask" && typeof input.body.title === "string") {
      return Response.json({ data: await addListingTask(input.listingId, input.body.title, input.actor) }, { status: 201 });
    }
    if (input.body.action === "addVisit") {
      return Response.json({ data: await addListingVisit(input.listingId, input.body.visit, input.actor) }, { status: 201 });
    }
    return Response.json({ error: "Action de création invalide." }, { status: 400 });
  } catch (error) { return listingApiError(error, "Création du suivi impossible."); }
}

export async function PATCH(request: Request, context: Context) {
  const input = await writable(request, context);
  if (input.response) return input.response;
  try {
    if (input.body.action === "toggleTask" && isUuid(input.body.taskId) && typeof input.body.completed === "boolean") {
      return Response.json({ data: await toggleListingTask(input.listingId, input.body.taskId, input.body.completed, input.actor) });
    }
    if (input.body.action === "updateTask" && isUuid(input.body.taskId) && typeof input.body.title === "string") {
      return Response.json({ data: await updateListingTask(input.listingId, input.body.taskId, input.body.title, input.actor) });
    }
    if (input.body.action === "updateVisit" && isUuid(input.body.visitId)) {
      return Response.json({ data: await updateListingVisit(input.listingId, input.body.visitId, input.body.visit, input.actor) });
    }
    return Response.json({ error: "Action de modification invalide." }, { status: 400 });
  } catch (error) { return listingApiError(error, "Modification du suivi impossible."); }
}

export async function DELETE(request: Request, context: Context) {
  const input = await writable(request, context);
  if (input.response) return input.response;
  try {
    if (input.body.action === "deleteTask" && isUuid(input.body.taskId)) {
      await deleteListingTask(input.listingId, input.body.taskId, input.actor);
      return Response.json({ data: { taskId: input.body.taskId } });
    }
    if (input.body.action === "deleteVisit" && isUuid(input.body.visitId)) {
      await deleteListingVisit(input.listingId, input.body.visitId, input.actor);
      return Response.json({ data: { visitId: input.body.visitId } });
    }
    return Response.json({ error: "Action de suppression invalide." }, { status: 400 });
  } catch (error) { return listingApiError(error, "Suppression du suivi impossible."); }
}
