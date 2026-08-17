import { requireApiAccess } from "../../../lib/crm-access";
import {
  BUYER_PIPELINE_STAGES,
  SELLER_PIPELINE_STAGES,
  type ContactBroker,
} from "../../../data/contact-types";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { getSupabaseAdmin } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type CRMActionBody = Record<string, unknown> & {
  action?: unknown;
  broker?: unknown;
  source?: unknown;
  contactId?: unknown;
  contactIds?: unknown;
  noteId?: unknown;
  actorBroker?: unknown;
  pipeline?: unknown;
  stage?: unknown;
  nextDate?: unknown;
  brokerChanged?: unknown;
  clientType?: unknown;
  draft?: Record<string, unknown>;
  drafts?: Array<Record<string, unknown>>;
  values?: Record<string, unknown>;
};

function isBroker(value: unknown): value is ContactBroker {
  return value === "france" || value === "maxime" || value === "sandrine" || value === "unassigned";
}

function isActorBroker(value: unknown): value is Exclude<ContactBroker, "unassigned"> {
  return value === "france" || value === "maxime" || value === "sandrine";
}

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const url = new URL(request.url);
  const resource = url.searchParams.get("resource");
  const client = getSupabaseAdmin();

  if (resource === "contacts") {
    const { data, error } = await client.from("contacts").select("*").order("created_at", { ascending: false });
    if (error) return Response.json({ error: "Chargement impossible." }, { status: 502 });
    return Response.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (resource === "globalSearch") {
    const rawQuery = (url.searchParams.get("q") ?? "").trim();
    const terms = rawQuery
      .split(/\s+/)
      .map((term) => term.replace(/[^\p{L}\p{N}@+\-.]/gu, "").trim())
      .filter((term) => term.length > 0)
      .slice(0, 4);
    if (terms.join("").length < 2) return Response.json({ data: [] });

    let contactsQuery = client
      .from("contacts")
      .select("id, first_name, last_name, phone, email, broker")
      .limit(8);
    for (const term of terms) {
      contactsQuery = contactsQuery.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`,
      );
    }
    let transactionsQuery = client
      .from("transactions")
      .select("id, address, broker, status")
      .limit(8);
    for (const term of terms) transactionsQuery = transactionsQuery.ilike("address", `%${term}%`);

    const [contactsResult, transactionsResult] = await Promise.all([
      contactsQuery,
      transactionsQuery,
    ]);
    if (contactsResult.error) return Response.json({ error: "Recherche impossible." }, { status: 502 });
    const contactResults = (contactsResult.data ?? []).map((contact) => ({
      id: contact.id as string,
      kind: "contact" as const,
      title: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Contact sans nom",
      detail: [contact.phone, contact.email].filter(Boolean).join(" · ") || `Courtier · ${contact.broker}`,
      href: `/contacts/${contact.id}`,
    }));
    const transactionResults = transactionsResult.error ? [] : (transactionsResult.data ?? []).map((transaction) => ({
      id: transaction.id as string,
      kind: "transaction" as const,
      title: transaction.address as string,
      detail: `Courtier · ${transaction.broker} · ${transaction.status}`,
      href: `/transactions/${transaction.id}`,
    }));
    return Response.json(
      { data: [...contactResults, ...transactionResults].slice(0, 12) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (resource === "notes") {
    const contactId = url.searchParams.get("contactId");
    if (!contactId) return Response.json({ error: "Contact invalide." }, { status: 400 });
    const { data, error } = await client.from("client_notes").select("*").eq("contact_id", contactId).order("created_at", { ascending: false });
    if (error) return Response.json({ error: "Chargement impossible." }, { status: 502 });
    return Response.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  }
  return Response.json({ error: "Ressource invalide." }, { status: 400 });
}

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as CRMActionBody | null;
  if (!body || typeof body.action !== "string") return Response.json({ error: "Action invalide." }, { status: 400 });
  const client = getSupabaseAdmin();

  try {
    if (body.action === "addManualContact") {
      if (!isActorBroker(body.broker)) throw new Error("Courtier invalide");
      const { data, error } = await client.from("contacts").insert({
        first_name: String(body.draft?.firstName ?? "").trim(),
        last_name: String(body.draft?.lastName ?? "").trim(),
        phone: String(body.draft?.phone ?? "").trim(),
        email: String(body.draft?.email ?? "").trim(),
        broker: body.broker,
        source: "manual",
        client_type: body.clientType ?? null,
      }).select("*").single();
      if (error) throw error;
      return Response.json({ data });
    }

    if (body.action === "importContacts") {
      const source = body.source;
      if (!Array.isArray(body.drafts) || typeof source !== "string" || !["csv", "vcard"].includes(source)) throw new Error("Import invalide");
      const imported: Record<string, unknown>[] = [];
      for (let index = 0; index < body.drafts.length; index += 250) {
        const chunk = body.drafts.slice(index, index + 250);
        const { data, error } = await client.from("contacts").insert(chunk.map((draft: Record<string, unknown>) => ({
          first_name: String(draft.firstName ?? "").trim(),
          last_name: String(draft.lastName ?? "").trim(),
          phone: String(draft.phone ?? "").trim(),
          email: String(draft.email ?? "").trim(),
          broker: "unassigned",
          source,
        }))).select("*");
        if (error) throw error;
        imported.push(...(data ?? []));
      }
      return Response.json({ data: imported });
    }

    if (body.action === "assignContacts") {
      if (!Array.isArray(body.contactIds) || !isBroker(body.broker)) throw new Error("Attribution invalide");
      const { data, error } = await client.from("contacts").update({
        broker: body.broker,
        google_calendar_sync_status: "pending",
        google_calendar_last_error: null,
      }).in("id", body.contactIds).select("*");
      if (error) throw error;
      return Response.json({ data });
    }

    if (body.action === "updateFollowUp") {
      const { data, error } = await client.from("contacts").update({
        next_follow_up_date: typeof body.nextDate === "string" ? body.nextDate : null,
        google_calendar_sync_status: "pending",
        google_calendar_last_error: null,
      }).eq("id", body.contactId).select("*").single();
      if (error) throw error;
      return Response.json({ data });
    }

    if (body.action === "calendarFailure") {
      const contactIds = Array.isArray(body.contactIds) ? body.contactIds : [];
      const { error } = await client.from("contacts").update({
        google_calendar_sync_status: "error",
        google_calendar_last_error: "Service Google Agenda indisponible.",
      }).in("id", contactIds);
      if (error) throw error;
      return Response.json({ data: true });
    }

    if (body.action === "updateContact") {
      const values = body.values ?? {};
      if (!isBroker(values.broker)) throw new Error("Courtier invalide");
      const { data, error } = await client.from("contacts").update({
        first_name: String(values.firstName ?? "").trim(),
        last_name: String(values.lastName ?? "").trim(),
        phone: String(values.phone ?? "").trim(),
        email: String(values.email ?? "").trim(),
        broker: values.broker,
        client_type: values.clientType ?? null,
        priority: values.priority ?? null,
        status: values.status,
        ...(body.brokerChanged ? { google_calendar_sync_status: "pending", google_calendar_last_error: null } : {}),
      }).eq("id", body.contactId).select("*").single();
      if (error) throw error;
      return Response.json({ data });
    }

    if (body.action === "updatePipelineStage") {
      const pipeline = body.pipeline;
      const stage = body.stage;
      const stages: ReadonlyArray<string> = pipeline === "buyer" ? BUYER_PIPELINE_STAGES : pipeline === "seller" ? SELLER_PIPELINE_STAGES : [];
      if (typeof stage !== "string" || !stages.includes(stage) || !isActorBroker(body.actorBroker)) throw new Error("Étape invalide");
      const { data, error } = await client.rpc("update_pipeline_stage", {
        p_contact_id: body.contactId,
        p_pipeline_type: pipeline,
        p_to_stage: stage,
        p_changed_by: body.actorBroker,
      });
      if (error) throw error;
      return Response.json({ data: Array.isArray(data) ? data[0] : data });
    }

    if (body.action === "addNote") {
      const { data: contact, error: contactError } = await client.from("contacts").select("broker").eq("id", body.contactId).single();
      if (contactError || !contact) throw contactError ?? new Error("Contact introuvable");
      const author = isActorBroker(body.actorBroker) ? body.actorBroker : contact.broker;
      if (!isActorBroker(author)) throw new Error("Courtier requis");
      const createdAt = new Date().toISOString();
      const { data, error } = await client.from("client_notes").insert({
        contact_id: body.contactId,
        content: String(body.content ?? "").trim(),
        created_by: author,
        created_by_user_id: null,
        created_at: createdAt,
      }).select("*").single();
      if (error) throw error;
      const { error: updateError } = await client.from("contacts").update({ last_contact_date: createdAt }).eq("id", body.contactId);
      if (updateError) throw updateError;
      return Response.json({ data });
    }

    if (body.action === "updateNote") {
      const { error } = await client.from("client_notes").update({ content: String(body.content ?? "").trim() }).eq("id", body.noteId);
      if (error) throw error;
      return Response.json({ data: true });
    }

    return Response.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    console.error("Action CRM refusée:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Opération CRM impossible." }, { status: 502 });
  }
}
