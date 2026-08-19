import type { ContactAddressInput, ContactBroker, ContactUpdate, DraftMergeSelection } from "../../../data/contact-types";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import {
  mergeDraftIntoContact,
  mergeExistingContacts,
} from "../../../lib/contacts/server-service";
import { requireApiAccess } from "../../../lib/crm-access";

export const dynamic = "force-dynamic";

function isBroker(value: unknown): value is ContactBroker {
  return value === "france" || value === "maxime" || value === "sandrine" || value === "unassigned";
}

function parseValues(value: unknown): ContactUpdate | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.firstName !== "string" ||
    typeof data.lastName !== "string" ||
    typeof data.phone !== "string" ||
    typeof data.email !== "string" ||
    typeof data.birthDate !== "string" ||
    typeof data.civicNumber !== "string" ||
    typeof data.address !== "string" ||
    typeof data.apartment !== "string" ||
    typeof data.city !== "string" ||
    typeof data.province !== "string" ||
    typeof data.postalCode !== "string" ||
    typeof data.country !== "string" ||
    !isBroker(data.broker) ||
    ![null, "buyer", "seller", "buyer_seller"].includes(data.clientType as null | string) ||
    ![null, "hot", "warm", "cold"].includes(data.priority as null | string) ||
    !["active", "inactive"].includes(data.status as string)
  ) return null;
  return data as ContactUpdate;
}

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const mode = body?.mode;
  const targetId = typeof body?.targetId === "string" ? body.targetId : "";
  const values = parseValues(body?.values);
  if (!targetId || !values) {
    return Response.json({ error: "Fusion invalide." }, { status: 400 });
  }

  try {
    if (mode === "existing") {
      const sourceId = typeof body?.sourceId === "string" ? body.sourceId : "";
      const followUpSource =
        body?.followUpSource === "target" || body?.followUpSource === "source"
          ? body.followUpSource
          : null;
      if (!sourceId) return Response.json({ error: "Doublon invalide." }, { status: 400 });
      const contact = await mergeExistingContacts({
        targetId,
        sourceId,
        values,
        followUpSource,
        mergedByUserId: null,
        addresses: Array.isArray(body?.addresses) ? body.addresses as ContactAddressInput[] : undefined,
      });
      return Response.json({ contact });
    }

    if (mode === "draft") {
      const incomingDraft =
        body?.incomingDraft && typeof body.incomingDraft === "object"
          ? (body.incomingDraft as Record<string, unknown>)
          : null;
      const nextFollowUpDate =
        typeof body?.nextFollowUpDate === "string" ? body.nextFollowUpDate : null;
      if (!incomingDraft) {
        return Response.json({ error: "Nouveau contact invalide." }, { status: 400 });
      }
      const contact = await mergeDraftIntoContact(
        targetId,
        { ...values, nextFollowUpDate } as DraftMergeSelection,
        incomingDraft,
        null,
        Array.isArray((body?.values as Record<string, unknown> | undefined)?.addresses)
          ? (body?.values as Record<string, unknown>).addresses as ContactAddressInput[]
          : undefined,
      );
      return Response.json({ contact });
    }

    return Response.json({ error: "Mode de fusion invalide." }, { status: 400 });
  } catch (error) {
    console.error("Fusion contact/adresses impossible:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json(
      { error: "La fusion n’a pas pu être terminée sans risque de perte." },
      { status: 502 },
    );
  }
}
