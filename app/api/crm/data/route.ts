import { requireApiAccess } from "../../../lib/crm-access";
import { normalizeClientProvenance, type ContactBroker } from "../../../data/contact-types";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { getSupabaseAdmin } from "../../../lib/supabase/server";
import { isAddressHistoryUnavailableError } from "../../../lib/contact-addresses";
import {
  attachAddressesInBatches,
  attachAddressesWithFallback,
} from "../../../lib/contacts/attach-addresses";
import { normalizeBirthDate } from "../../../lib/birth-date";
import { normalizeMortgageRenewalDate } from "../../../lib/mortgage-renewal-date";
import { mapListing, type ListingRow } from "../../../lib/listings/server-service";
import { listingAddressLines } from "../../../lib/listings/presentation";
import {
  listAllSupabaseRows,
  type SupabaseOrderedRangeQuery,
} from "../../../lib/supabase/pagination";

export const dynamic = "force-dynamic";

type CRMActionBody = Record<string, unknown> & {
  action?: unknown;
  broker?: unknown;
  source?: unknown;
  contactId?: unknown;
  contactIds?: unknown;
  noteId?: unknown;
  actorBroker?: unknown;
  creationKey?: unknown;
  content?: unknown;
  nextDate?: unknown;
  clientType?: unknown;
  clientProvenance?: unknown;
  draft?: Record<string, unknown>;
  entries?: Array<{ draft?: Record<string, unknown>; addresses?: Array<Record<string, unknown>> }>;
  updates?: Array<{ contactId?: unknown; birthDate?: unknown }>;
  addresses?: Array<Record<string, unknown>>;
  values?: Record<string, unknown>;
};

function isBroker(value: unknown): value is ContactBroker {
  return value === "france" || value === "maxime" || value === "sandrine" || value === "unassigned";
}

function isActorBroker(value: unknown): value is Exclude<ContactBroker, "unassigned"> {
  return value === "france" || value === "maxime" || value === "sandrine";
}

function textValue(value: unknown) {
  return String(value ?? "").trim().normalize("NFC");
}

const NOTE_CONTENT_MAX_LENGTH = 10_000;

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function rpcRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function contactValuesPayload(values: Record<string, unknown>, broker?: Exclude<ContactBroker, "unassigned">) {
  return {
    first_name: textValue(values.firstName),
    last_name: textValue(values.lastName),
    phone: textValue(values.phone),
    email: textValue(values.email),
    birth_date: birthDateValue(values.birthDate),
    mortgage_renewal_date: mortgageRenewalDateValue(values.mortgageRenewalDate),
    broker: broker ?? values.broker,
    client_type: values.clientType ?? null,
    client_provenance: normalizeClientProvenance(values.clientProvenance),
    priority: values.priority ?? null,
    status: values.status ?? "active",
  };
}

function crmErrorResponse(error: unknown) {
  const details = error && typeof error === "object"
    ? error as { code?: string; message?: string }
    : {};
  const message = details.message ?? "";
  if (details.code === "P0002" || /(?:Contact|Note) introuvable/i.test(message)) {
    return Response.json({ error: /Note/i.test(message) ? "Note introuvable." : "Contact introuvable." }, { status: 404 });
  }
  if (details.code === "22023" || details.code === "22P02" || /invalide|requis|attribué|dépasser|minimum/i.test(message)) {
    const safeMessage = (!details.code || details.code === "22023") && message ? message : "Données invalides.";
    return Response.json({ error: safeMessage }, { status: 400 });
  }
  return Response.json({ error: "Opération CRM impossible." }, { status: 502 });
}

function birthDateValue(value: unknown) {
  const raw = textValue(value);
  if (!raw) return null;
  const normalized = normalizeBirthDate(raw);
  if (!normalized) throw new Error("Date de naissance invalide");
  return normalized;
}

function mortgageRenewalDateValue(value: unknown) {
  const raw = textValue(value);
  if (!raw) return null;
  const normalized = normalizeMortgageRenewalDate(raw);
  if (!normalized) throw new Error("Date de renouvellement hypothécaire invalide");
  return normalized;
}

function addressPayload(value: Record<string, unknown>) {
  return {
    id: typeof value.id === "string" && !value.id.startsWith("primary:") ? value.id : null,
    civic_number: textValue(value.civicNumber),
    address: textValue(value.address),
    apartment: textValue(value.apartment),
    city: textValue(value.city),
    province: textValue(value.province),
    postal_code: textValue(value.postalCode),
    country: textValue(value.country),
    is_primary: value.isPrimary === true,
    label: typeof value.label === "string" ? value.label : value.isPrimary === true ? "Principale" : "Ancienne adresse",
  };
}

async function loadAddressBatch(contactIds: ReadonlyArray<string>) {
  const client = getSupabaseAdmin();
  type AddressRow = Record<string, unknown> & { contact_id: unknown };
  return listAllSupabaseRows<AddressRow>({
    buildQuery: () => client
      .from("contact_addresses")
      .select("*")
      .in("contact_id", [...contactIds]) as unknown as SupabaseOrderedRangeQuery<AddressRow>,
    orders: [
      { column: "created_at", ascending: false },
      { column: "id", ascending: false },
    ],
  });
}

async function attachAddresses<T extends Record<string, unknown> & { id: unknown }>(
  rows: ReadonlyArray<T>,
  allowUnavailableTableFallback = false,
) {
  try {
    return await attachAddressesInBatches(rows, loadAddressBatch);
  } catch (error) {
    if (allowUnavailableTableFallback && isAddressHistoryUnavailableError(error)) return [...rows];
    throw error;
  }
}

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const url = new URL(request.url);
  const resource = url.searchParams.get("resource");
  const client = getSupabaseAdmin();

  if (resource === "contacts") {
    type ContactRow = Record<string, unknown> & { id: unknown };
    let contactRows: ContactRow[];
    try {
      contactRows = await listAllSupabaseRows<ContactRow>({
        buildQuery: () => client
          .from("contacts")
          .select("*") as unknown as SupabaseOrderedRangeQuery<ContactRow>,
        orders: [
          { column: "created_at", ascending: false },
          { column: "id", ascending: false },
        ],
      });
    } catch {
      return Response.json({ error: "Chargement impossible." }, { status: 502 });
    }
    const contactsWithAddresses = await attachAddressesWithFallback(
      contactRows,
      loadAddressBatch,
      (addressError) => console.error(
        "Chargement de l'historique des adresses impossible:",
        addressError instanceof Error ? addressError.message : "erreur inconnue",
      ),
    );
    return Response.json({ data: contactsWithAddresses }, { headers: { "Cache-Control": "private, no-store" } });
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
      .select("id, first_name, last_name, phone, email, civic_number, address, apartment, city, province, postal_code, country, broker")
      .limit(8);
    for (const term of terms) {
      contactsQuery = contactsQuery.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,civic_number.ilike.%${term}%,address.ilike.%${term}%,apartment.ilike.%${term}%,city.ilike.%${term}%,province.ilike.%${term}%,postal_code.ilike.%${term}%,country.ilike.%${term}%`,
      );
    }
    let transactionsQuery = client
      .from("transactions")
      .select("id, address, broker, status")
      .limit(8);
    for (const term of terms) transactionsQuery = transactionsQuery.ilike("address", `%${term}%`);
    let listingsQuery = client.from("listings").select("*").limit(8);
    for (const term of terms) {
      listingsQuery = listingsQuery.or(
        `civic_number.ilike.%${term}%,address.ilike.%${term}%,city.ilike.%${term}%,centris_number.ilike.%${term}%`,
      );
    }

    const addressSearch = client.from("contact_addresses")
      .select("contact_id,civic_number,address,apartment,city,province,postal_code,country")
      .or(terms.flatMap((term) => ["civic_number", "address", "apartment", "city", "province", "postal_code", "country"].map((field) => `${field}.ilike.%${term}%`)).join(","))
      .limit(24);
    const [contactsResult, transactionsResult, listingsResult, addressResult] = await Promise.all([
      contactsQuery,
      transactionsQuery,
      listingsQuery,
      addressSearch,
    ]);
    if (contactsResult.error) return Response.json({ error: "Recherche impossible." }, { status: 502 });
    let historicalContacts: typeof contactsResult.data = [];
    if (!addressResult.error && (addressResult.data?.length ?? 0) > 0) {
      const ids = [...new Set((addressResult.data ?? []).map((address) => address.contact_id as string))];
      const result = await client.from("contacts").select("id, first_name, last_name, phone, email, civic_number, address, apartment, city, province, postal_code, country, broker").in("id", ids);
      if (!result.error) historicalContacts = result.data ?? [];
    } else if (addressResult.error && !isAddressHistoryUnavailableError(addressResult.error)) {
      console.error("Recherche dans les anciennes adresses impossible:", addressResult.error.message);
    }
    const uniqueContacts = [...new Map([...(contactsResult.data ?? []), ...(historicalContacts ?? [])].map((contact) => [contact.id, contact])).values()];
    const contactResults = uniqueContacts.map((contact) => ({
      id: contact.id as string,
      kind: "contact" as const,
      title: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Contact sans nom",
      detail: [contact.phone, contact.email, [[contact.civic_number, contact.address].filter(Boolean).join(" "), contact.city, contact.postal_code].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || `Courtier · ${contact.broker}`,
      href: `/contacts/${contact.id}`,
    }));
    const transactionResults = transactionsResult.error ? [] : (transactionsResult.data ?? []).map((transaction) => ({
      id: transaction.id as string,
      kind: "transaction" as const,
      title: transaction.address as string,
      detail: `Courtier · ${transaction.broker} · ${transaction.status}`,
      href: `/transactions/${transaction.id}`,
    }));
    const listingResults = listingsResult.error ? [] : ((listingsResult.data ?? []) as ListingRow[]).map((row) => {
      const listing = mapListing(row, []);
      const address = listingAddressLines(listing).join(", ");
      return {
        id: listing.id,
        kind: "listing" as const,
        title: listingAddressLines(listing)[0] || "Listing sans adresse",
        detail: [listing.city, listing.centrisNumber ? `Centris ${listing.centrisNumber}` : null, `Courtier · ${listing.broker}`].filter(Boolean).join(" · ") || address,
        href: `/listings/${listing.id}`,
      };
    });
    return Response.json(
      { data: [...contactResults, ...listingResults, ...transactionResults].slice(0, 18) },
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
      if (!isUuid(body.creationKey)) throw new Error("Clé de création invalide");
      const draft = body.draft ?? {};
      const address = addressPayload(draft);
      const hasAddress = [
        address.civic_number,
        address.address,
        address.apartment,
        address.city,
        address.province,
        address.postal_code,
        address.country,
      ].some(Boolean);
      const { data, error } = await client.rpc("create_manual_contact_with_addresses", {
        p_values: contactValuesPayload({
          ...draft,
          clientType: body.clientType,
          clientProvenance: body.clientProvenance,
        }, body.broker),
        p_addresses: hasAddress ? [{ ...address, is_primary: true, label: "Principale" }] : [],
        p_creation_key: body.creationKey,
      });
      if (error) throw error;
      const row = rpcRow(data as Record<string, unknown> | Array<Record<string, unknown>> | null);
      return Response.json({ data: (await attachAddresses(row && "id" in row ? [row as Record<string, unknown> & { id: unknown }] : [], true))[0] });
    }

    if (body.action === "importContacts") {
      const source = body.source;
      if (!Array.isArray(body.entries) || typeof source !== "string" || !["csv", "vcard"].includes(source)) throw new Error("Import invalide");
      const imported: Record<string, unknown>[] = [];
      for (let index = 0; index < body.entries.length; index += 250) {
        const chunk = body.entries.slice(index, index + 250);
        const rpcPayload = chunk.map((entry) => ({
          contact: {
            ...entry.draft,
            birthDate: birthDateValue(entry.draft?.birthDate) ?? "",
            mortgageRenewalDate: "",
            clientProvenance: null,
          },
          addresses: (entry.addresses ?? []).map(addressPayload),
        }));
        const rpcResult = await client.rpc("import_contacts_with_addresses", { p_entries: rpcPayload, p_source: source });
        if (!rpcResult.error) {
          imported.push(...((rpcResult.data ?? []) as Record<string, unknown>[]));
          continue;
        }
        if (!isAddressHistoryUnavailableError(rpcResult.error)) throw rpcResult.error;
        const { data, error } = await client.from("contacts").insert(chunk.map((entry) => {
          const draft = entry.draft ?? {};
          return {
          first_name: textValue(draft.firstName),
          last_name: textValue(draft.lastName),
          phone: textValue(draft.phone),
          email: textValue(draft.email),
          birth_date: birthDateValue(draft.birthDate),
          mortgage_renewal_date: null,
          civic_number: textValue(draft.civicNumber),
          address: textValue(draft.address),
          apartment: textValue(draft.apartment),
          city: textValue(draft.city),
          province: textValue(draft.province),
          postal_code: textValue(draft.postalCode),
          country: textValue(draft.country),
          broker: "unassigned",
          source,
          client_provenance: null,
        };})).select("*");
        if (error) throw error;
        imported.push(...(data ?? []));
      }
      return Response.json({ data: await attachAddresses(imported as Array<Record<string, unknown> & { id: unknown }>, true) });
    }

    if (body.action === "enrichBirthDates") {
      if (!Array.isArray(body.updates)) throw new Error("Enrichissement invalide");
      const updates = body.updates.map((item) => ({ contactId: textValue(item.contactId), birthDate: birthDateValue(item.birthDate) }))
        .filter((item): item is { contactId: string; birthDate: string } => Boolean(item.contactId && item.birthDate));
      const { data, error } = await client.rpc("enrich_contact_birth_dates", { p_updates: updates });
      if (error) throw error;
      return Response.json({ data: data ?? [] });
    }

    if (body.action === "saveContactAddresses") {
      if (typeof body.contactId !== "string" || !Array.isArray(body.addresses)) throw new Error("Adresses invalides");
      const payload = body.addresses.map(addressPayload);
      const { data, error } = await client.rpc("save_contact_addresses", { p_contact_id: body.contactId, p_addresses: payload });
      if (error) {
        if (!isAddressHistoryUnavailableError(error)) throw error;
        const primary = payload.find((address) => address.is_primary) ?? payload[0];
        const fallback = primary ?? { civic_number: "", address: "", apartment: "", city: "", province: "", postal_code: "", country: "" };
        const result = await client.from("contacts").update(fallback).eq("id", body.contactId).select("*").single();
        if (result.error) throw result.error;
        return Response.json({ data: result.data });
      }
      const row = Array.isArray(data) ? data[0] : data;
      return Response.json({ data: (await attachAddresses(row ? [row as Record<string, unknown> & { id: unknown }] : [], true))[0] });
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
      if (!isUuid(body.contactId)) throw new Error("Contact invalide");
      const { data, error } = await client.rpc("update_contact_with_addresses", {
        p_contact_id: body.contactId,
        p_values: contactValuesPayload(values),
        p_addresses: Array.isArray(body.addresses) ? body.addresses.map(addressPayload) : null,
      });
      if (error) throw error;
      const row = rpcRow(data as Record<string, unknown> | Array<Record<string, unknown>> | null);
      return Response.json({ data: (await attachAddresses(row && "id" in row ? [row as Record<string, unknown> & { id: unknown }] : [], true))[0] });
    }

    if (body.action === "addNote") {
      if (!isUuid(body.contactId)) throw new Error("Contact invalide");
      const content = textValue(body.content);
      if (!content || content.length > NOTE_CONTENT_MAX_LENGTH) throw new Error("Contenu de note invalide");
      const { data, error } = await client.rpc("add_contact_note", {
        p_contact_id: body.contactId,
        p_content: content,
        p_created_by: isActorBroker(body.actorBroker) ? body.actorBroker : null,
      });
      if (error) throw error;
      return Response.json({ data: rpcRow(data) });
    }

    if (body.action === "updateNote") {
      const noteId = typeof body.noteId === "string" ? body.noteId.trim() : "";
      const content = textValue(body.content);
      if (!isUuid(noteId) || !content || content.length > NOTE_CONTENT_MAX_LENGTH) {
        return Response.json({ error: "Note invalide." }, { status: 400 });
      }
      const { data, error } = await client.from("client_notes").update({ content }).eq("id", noteId).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return Response.json({ error: "Note introuvable." }, { status: 404 });
      return Response.json({ data: true });
    }

    if (body.action === "deleteNote") {
      const noteId = typeof body.noteId === "string" ? body.noteId.trim() : "";
      if (!isUuid(noteId)) return Response.json({ error: "Note invalide." }, { status: 400 });
      const { data, error } = await client.rpc("delete_contact_note", { p_note_id: noteId });
      if (error) throw error;
      return Response.json({ data });
    }

    return Response.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    console.error("Action CRM refusée:", error instanceof Error ? error.message : "erreur inconnue");
    return crmErrorResponse(error);
  }
}
