import type {
  ContactBroker,
  ContactUpdate,
  DraftMergeSelection,
  ContactAddressInput,
} from "../../data/contact-types";
import {
  deleteCalendarEventForContact,
  deleteBirthdayEventsForContact,
  deleteMortgageRenewalEventsForContact,
  queueContactBirthdays,
  queueContactMortgageRenewals,
  mapServerContact,
  syncContactFollowUp,
  syncContactMortgageRenewals,
  type ServerContactRow,
} from "../google-calendar/service";
import { getSupabaseAdmin } from "../supabase/server";
import { isAddressHistoryUnavailableError } from "../contact-addresses";

type ExistingMergeInput = {
  targetId: string;
  sourceId: string;
  values: ContactUpdate;
  followUpSource: "target" | "source" | null;
  mergedByUserId: string | null;
  addresses?: ReadonlyArray<ContactAddressInput>;
};

function addressRpcPayload(addresses: ReadonlyArray<ContactAddressInput> | undefined) {
  return (addresses ?? []).map((address) => ({
    civic_number: address.civicNumber.trim().normalize("NFC"),
    address: address.address.trim().normalize("NFC"),
    apartment: address.apartment.trim().normalize("NFC"),
    city: address.city.trim().normalize("NFC"),
    province: address.province.trim().normalize("NFC"),
    postal_code: address.postalCode.trim().normalize("NFC"),
    country: address.country.trim().normalize("NFC"),
    is_primary: address.isPrimary,
    label: address.label,
  }));
}

async function getServerContact(id: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as ServerContactRow;
}

async function withAddressHistory(contact: ReturnType<typeof mapServerContact>) {
  const { data, error } = await getSupabaseAdmin().from("contact_addresses").select("*").eq("contact_id", contact.id).order("is_primary", { ascending: false });
  if (error) {
    if (isAddressHistoryUnavailableError(error)) return contact;
    throw error;
  }
  return {
    ...contact,
    addresses: (data ?? []).map((row) => ({
      id: row.id as string,
      contactId: row.contact_id as string,
      civicNumber: String(row.civic_number ?? ""), address: String(row.address ?? ""), apartment: String(row.apartment ?? ""),
      city: String(row.city ?? ""), province: String(row.province ?? ""), postalCode: String(row.postal_code ?? ""), country: String(row.country ?? ""),
      isPrimary: Boolean(row.is_primary), label: row.label as ContactAddressInput["label"],
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    })),
  };
}

export async function mergeExistingContacts(input: ExistingMergeInput) {
  const [target, source] = await Promise.all([
    getServerContact(input.targetId),
    getServerContact(input.sourceId),
  ]);
  const selected = input.followUpSource === "source" ? source : target;
  const nextFollowUpDate = input.followUpSource
    ? selected.next_follow_up_date
    : null;
  const canKeepSelectedEvent = Boolean(
    nextFollowUpDate &&
      selected.google_calendar_event_id &&
      selected.google_calendar_event_broker === input.values.broker,
  );
  const retainedEventId = canKeepSelectedEvent
    ? selected.google_calendar_event_id
    : null;
  const retainedEventBroker = canKeepSelectedEvent
    ? selected.google_calendar_event_broker
    : null;
  const events = [target, source].filter(
    (contact) =>
      contact.google_calendar_event_id &&
      contact.google_calendar_event_id !== retainedEventId,
  );

  try {
    await deleteBirthdayEventsForContact(input.sourceId);
    await deleteMortgageRenewalEventsForContact(input.sourceId);
    for (const contact of events) {
      await deleteCalendarEventForContact(mapServerContact(contact));
    }

    const addressRpc = await getSupabaseAdmin().rpc("merge_contacts_with_contact_dates", {
      p_target_id: input.targetId,
      p_source_id: input.sourceId,
      p_addresses: addressRpcPayload(input.addresses),
      p_first_name: input.values.firstName,
      p_last_name: input.values.lastName,
      p_phone: input.values.phone,
      p_email: input.values.email,
      p_birth_date: input.values.birthDate || null,
      p_mortgage_renewal_date: input.values.mortgageRenewalDate || null,
      p_civic_number: input.values.civicNumber,
      p_address: input.values.address,
      p_apartment: input.values.apartment,
      p_city: input.values.city,
      p_province: input.values.province,
      p_postal_code: input.values.postalCode,
      p_country: input.values.country,
      p_broker: input.values.broker,
      p_client_type: input.values.clientType,
      p_priority: input.values.priority,
      p_status: input.values.status,
      p_next_follow_up_date: nextFollowUpDate,
      p_google_event_id: retainedEventId,
      p_google_event_broker: retainedEventBroker,
      p_merged_by_user_id: input.mergedByUserId,
    });
    if (addressRpc.error) throw addressRpc.error;
    const data = addressRpc.data;
    const provenanceResult = await getSupabaseAdmin()
      .from("contacts")
      .update({ client_provenance: input.values.clientProvenance })
      .eq("id", input.targetId)
      .select("*")
      .single();
    if (provenanceResult.error) throw provenanceResult.error;

    const merged = mapServerContact((provenanceResult.data ?? (Array.isArray(data) ? data[0] : data)) as ServerContactRow);
    await syncContactMortgageRenewals({ contactIds: [merged.id], limit: 3 });
    if (merged.nextFollowUpDate) {
      const sync = await syncContactFollowUp(merged.id);
      return withAddressHistory(sync.contact ?? merged);
    }
    return withAddressHistory(merged);
  } catch (error) {
    // Si Google a été nettoyé mais que Supabase refuse la fusion, les deux
    // contacts restent la source de vérité et leurs événements sont recréés.
    await Promise.allSettled([
      syncContactFollowUp(input.targetId),
      syncContactFollowUp(input.sourceId),
      queueContactBirthdays(input.targetId),
      queueContactBirthdays(input.sourceId),
      queueContactMortgageRenewals(input.targetId),
      queueContactMortgageRenewals(input.sourceId),
    ]);
    throw error;
  }
}

export async function mergeDraftIntoContact(
  targetId: string,
  values: DraftMergeSelection,
  incomingDraft: Record<string, unknown>,
  mergedByUserId: string | null,
  addresses?: ReadonlyArray<ContactAddressInput>,
) {
  const target = await getServerContact(targetId);
  const brokerChanged = target.broker !== values.broker;
  const atomic = await getSupabaseAdmin().rpc("merge_draft_into_contact_with_addresses", {
    p_target_id: targetId,
    p_values: values,
    p_addresses: addressRpcPayload(addresses ?? values.addresses),
    p_incoming_draft: incomingDraft,
    p_merged_by_user_id: mergedByUserId,
  });
  if (!atomic.error) {
    const provenanceResult = await getSupabaseAdmin()
      .from("contacts")
      .update({ client_provenance: values.clientProvenance })
      .eq("id", targetId)
      .select("*")
      .single();
    if (provenanceResult.error) throw provenanceResult.error;
    const merged = mapServerContact((provenanceResult.data ?? (Array.isArray(atomic.data) ? atomic.data[0] : atomic.data)) as ServerContactRow);
    await syncContactMortgageRenewals({ contactIds: [targetId], limit: 3 });
    if (brokerChanged || merged.nextFollowUpDate || merged.googleCalendarEventId) {
      const sync = await syncContactFollowUp(targetId);
      return withAddressHistory(sync.contact ?? merged);
    }
    return withAddressHistory(merged);
  }
  if (!isAddressHistoryUnavailableError(atomic.error)) throw atomic.error;
  const { data, error } = await getSupabaseAdmin()
    .from("contacts")
    .update({
      first_name: values.firstName.trim(),
      last_name: values.lastName.trim(),
      phone: values.phone.trim(),
      email: values.email.trim(),
      birth_date: values.birthDate || null,
      mortgage_renewal_date: values.mortgageRenewalDate || null,
      civic_number: values.civicNumber.trim().normalize("NFC"),
      address: values.address.trim().normalize("NFC"),
      apartment: values.apartment.trim().normalize("NFC"),
      city: values.city.trim().normalize("NFC"),
      province: values.province.trim().normalize("NFC"),
      postal_code: values.postalCode.trim().normalize("NFC"),
      country: values.country.trim().normalize("NFC"),
      broker: values.broker,
      client_provenance: values.clientProvenance,
      next_follow_up_date: values.nextFollowUpDate,
      google_calendar_sync_status:
        brokerChanged || values.nextFollowUpDate ? "pending" : target.google_calendar_sync_status,
      google_calendar_last_error: null,
    })
    .eq("id", targetId)
    .select("*")
    .single();
  if (error) throw error;

  const { error: auditError } = await getSupabaseAdmin()
    .from("contact_merges")
    .insert({
      merged_into_contact_id: targetId,
      merged_from: incomingDraft,
      merged_by_user_id: mergedByUserId,
    });
  if (auditError) throw auditError;

  const merged = mapServerContact(data as ServerContactRow);
  await syncContactMortgageRenewals({ contactIds: [targetId], limit: 3 });
  if (brokerChanged || merged.nextFollowUpDate || merged.googleCalendarEventId) {
    const sync = await syncContactFollowUp(targetId);
    return withAddressHistory(sync.contact ?? merged);
  }
  return withAddressHistory(merged);
}

export async function deleteContactAndCalendar(contactId: string) {
  const contact = await getServerContact(contactId);
  const mapped = mapServerContact(contact);
  if (mapped.googleCalendarEventId) {
    await deleteCalendarEventForContact(mapped);
  }
  await deleteBirthdayEventsForContact(contactId);
  await deleteMortgageRenewalEventsForContact(contactId);

  const { error } = await getSupabaseAdmin().from("contacts").delete().eq("id", contactId);
  if (error) {
    await syncContactFollowUp(contactId).catch(() => undefined);
    throw error;
  }
}

export function isAssignedBroker(value: unknown): value is Exclude<ContactBroker, "unassigned"> {
  return value === "france" || value === "maxime" || value === "sandrine";
}
