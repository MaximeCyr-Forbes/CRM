"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-context";
import { useBroker } from "./broker-context";
import type { ClientNote } from "./data/client-note-types";
import type { CalendarSyncResult } from "./data/calendar-types";
import type {
  Contact,
  ContactBroker,
  ContactDraft,
  ContactAddress,
  ContactAddressInput,
  ContactImportInput,
  ContactSource,
  ContactUpdate,
  DraftMergeSelection,
} from "./data/contact-types";
import { BROKER_LABELS } from "./data/contact-types";
import { addressInputFromDraft, fallbackAddresses, mergeAddressCollections, normalizeAddressKey, setPrimaryAddress } from "./lib/contact-addresses";

type ContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  birth_date: string | null;
  mortgage_renewal_date: string | null;
  civic_number: string;
  address: string;
  apartment: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  broker: ContactBroker;
  client_type: Contact["clientType"];
  client_provenance: Contact["clientProvenance"];
  priority: Contact["priority"];
  status: Contact["status"];
  source: ContactSource;
  last_contact_date: string | null;
  next_follow_up_date: string | null;
  google_calendar_event_id: string | null;
  google_calendar_event_broker: Contact["googleCalendarEventBroker"];
  google_calendar_sync_status: Contact["googleCalendarSyncStatus"];
  google_calendar_last_error: string | null;
  created_at: string;
  updated_at: string;
  contact_addresses?: ContactAddressRow[];
};

type ContactAddressRow = {
  id: string;
  contact_id: string;
  civic_number: string;
  address: string;
  apartment: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  is_primary: boolean;
  label: ContactAddress["label"];
  created_at: string;
  updated_at: string;
};

type ClientNoteRow = {
  id: string;
  contact_id: string;
  content: string;
  created_at: string;
  created_by: Exclude<ContactBroker, "unassigned">;
  created_by_user_id: string | null;
};

type DeleteNoteResult = {
  noteId: string;
  contactId: string;
  lastContactDate: string | null;
};

type CRMDataContextValue = {
  contacts: ReadonlyArray<Contact>;
  notes: ReadonlyArray<ClientNote>;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  clearError: () => void;
  retry: () => Promise<void>;
  loadNotesForContact: (contactId: string) => Promise<void>;
  addManualContact: (
    draft: ContactDraft,
    broker: Exclude<ContactBroker, "unassigned">,
    defaults?: {
      clientType?: Exclude<Contact["clientType"], null>;
      clientProvenance?: Contact["clientProvenance"];
    },
  ) => Promise<Contact>;
  importContacts: (
    entries: ReadonlyArray<ContactImportInput>,
    source: Exclude<ContactSource, "manual">,
  ) => Promise<Contact[]>;
  enrichContactBirthDates: (updates: ReadonlyArray<{ contactId: string; birthDate: string }>) => Promise<Contact[]>;
  assignContact: (contactId: string, broker: ContactBroker) => Promise<void>;
  assignContacts: (
    contactIds: ReadonlyArray<string>,
    broker: ContactBroker,
  ) => Promise<void>;
  updateFollowUp: (
    contactId: string,
    nextDate: string | null,
  ) => Promise<CalendarSyncResult>;
  retryCalendarSync: (contactId: string) => Promise<CalendarSyncResult>;
  updateContact: (contactId: string, values: ContactUpdate) => Promise<Contact>;
  saveContactAddresses: (contactId: string, addresses: ReadonlyArray<ContactAddressInput>) => Promise<Contact>;
  deleteContact: (contactId: string) => Promise<void>;
  mergeDraftIntoContact: (
    targetId: string,
    incomingDraft: ContactDraft,
    values: DraftMergeSelection,
  ) => Promise<Contact>;
  mergeContacts: (
    targetId: string,
    sourceId: string,
    values: ContactUpdate,
    followUpSource: "target" | "source" | null,
    addresses?: ReadonlyArray<ContactAddressInput>,
  ) => Promise<Contact>;
  addNote: (contactId: string, content: string) => Promise<ClientNote>;
  updateNote: (noteId: string, content: string) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
};

const CRMDataContext = createContext<CRMDataContextValue | null>(null);

function logDevelopmentWarning(error: unknown) {
  if (process.env.NODE_ENV !== "production") console.warn(error);
}

function mapContact(row: ContactRow): Contact {
  const mappedAddresses = (row.contact_addresses ?? []).map((address) => ({
    id: address.id,
    contactId: address.contact_id,
    civicNumber: address.civic_number ?? "",
    address: address.address ?? "",
    apartment: address.apartment ?? "",
    city: address.city ?? "",
    province: address.province ?? "",
    postalCode: address.postal_code ?? "",
    country: address.country ?? "",
    isPrimary: address.is_primary,
    label: address.label,
    createdAt: address.created_at,
    updatedAt: address.updated_at,
  }));
  const fallbackDate = row.updated_at ?? row.created_at;
  const hasPrimaryAddress = [row.civic_number, row.address, row.apartment, row.city, row.province, row.postal_code, row.country].some(Boolean);
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    birthDate: row.birth_date ?? "",
    mortgageRenewalDate: row.mortgage_renewal_date ?? "",
    civicNumber: row.civic_number ?? "",
    address: row.address ?? "",
    apartment: row.apartment ?? "",
    city: row.city ?? "",
    province: row.province ?? "",
    postalCode: row.postal_code ?? "",
    country: row.country ?? "",
    broker: row.broker,
    clientType: row.client_type,
    clientProvenance: row.client_provenance ?? null,
    priority: row.priority,
    status: row.status,
    source: row.source,
    lastContactDate: row.last_contact_date,
    nextFollowUpDate: row.next_follow_up_date,
    googleCalendarEventId: row.google_calendar_event_id,
    googleCalendarEventBroker: row.google_calendar_event_broker,
    googleCalendarSyncStatus: row.google_calendar_sync_status,
    googleCalendarLastError: row.google_calendar_last_error,
    addresses: mappedAddresses.length > 0 ? mappedAddresses : hasPrimaryAddress ? [{
      id: `primary:${row.id}`,
      contactId: row.id,
      civicNumber: row.civic_number ?? "",
      address: row.address ?? "",
      apartment: row.apartment ?? "",
      city: row.city ?? "",
      province: row.province ?? "",
      postalCode: row.postal_code ?? "",
      country: row.country ?? "",
      isPrimary: true,
      label: "Principale",
      createdAt: fallbackDate,
      updatedAt: fallbackDate,
    }] : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNote(row: ClientNoteRow): ClientNote {
  return {
    id: row.id,
    contactId: row.contact_id,
    content: row.content,
    createdAt: row.created_at,
    createdBy: BROKER_LABELS[row.created_by],
    createdByUserId: row.created_by_user_id,
  };
}

function preserveAddressHistory(previous: Contact, replacement: Contact) {
  return { ...replacement, addresses: previous.addresses };
}

async function crmDataRequest<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/crm/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Opération CRM refusée.");
  return ((await response.json()) as { data: T }).data;
}

export function CRMDataProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const { selectedBroker } = useBroker();
  const [contacts, setContacts] = useState<ReadonlyArray<Contact>>([]);
  const [notes, setNotes] = useState<ReadonlyArray<ClientNote>>([]);
  const [loadedNoteContacts, setLoadedNoteContacts] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [loadingNoteContacts, setLoadingNoteContacts] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const runWrite = useCallback(async <T,>(message: string, operation: () => Promise<T>) => {
    setPendingWrites((current) => current + 1);
    setError(null);
    try {
      return await operation();
    } catch (caughtError) {
      logDevelopmentWarning(caughtError);
      setError(message);
      throw caughtError;
    } finally {
      setPendingWrites((current) => Math.max(0, current - 1));
    }
  }, []);

  const loadContacts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/crm/data?resource=contacts", { cache: "no-store" });
      if (!response.ok) throw new Error("Chargement impossible.");
      const { data } = (await response.json()) as { data: ContactRow[] };
      setContacts((data ?? []).map(mapContact));
    } catch (caughtError) {
      logDevelopmentWarning(caughtError);
      setError("Impossible de charger les contacts.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated") {
      void loadContacts();
      void fetch("/api/google-calendar/birthdays/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 40, retryErrors: false }),
      }).catch(() => undefined);
      void fetch("/api/google-calendar/mortgage-renewals/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 40, retryErrors: false }),
      }).catch(() => undefined);
      return;
    }
    setContacts([]);
    setNotes([]);
    setLoadedNoteContacts(new Set());
    setIsLoading(authStatus === "loading");
  }, [authStatus, loadContacts]);

  const loadNotesForContact = useCallback(
    async (contactId: string) => {
      if (loadedNoteContacts.has(contactId) || loadingNoteContacts.has(contactId)) {
        return;
      }

      setLoadingNoteContacts((current) => new Set(current).add(contactId));
      try {
        const response = await fetch(`/api/crm/data?resource=notes&contactId=${encodeURIComponent(contactId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Chargement impossible.");
        const { data } = (await response.json()) as { data: ClientNoteRow[] };

        const loadedNotes = ((data ?? []) as ClientNoteRow[]).map(mapNote);
        setNotes((current) => [
          ...current.filter((note) => note.contactId !== contactId),
          ...loadedNotes,
        ]);
        setLoadedNoteContacts((current) => new Set(current).add(contactId));
      } catch (caughtError) {
        logDevelopmentWarning(caughtError);
        setError("Impossible de charger l’historique de ce contact.");
      } finally {
        setLoadingNoteContacts((current) => {
          const next = new Set(current);
          next.delete(contactId);
          return next;
        });
      }
    },
    [loadedNoteContacts, loadingNoteContacts],
  );

  const requestBirthdaySync = useCallback(async (contactIds: ReadonlyArray<string>) => {
    const uniqueIds = [...new Set(contactIds)];
    for (let index = 0; index < uniqueIds.length; index += 25) {
      await fetch("/api/google-calendar/birthdays/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: uniqueIds.slice(index, index + 25), limit: 100 }),
      }).catch(() => undefined);
    }
  }, []);

  const requestMortgageRenewalSync = useCallback(async (contactIds: ReadonlyArray<string>) => {
    const uniqueIds = [...new Set(contactIds)];
    for (let index = 0; index < uniqueIds.length; index += 25) {
      await fetch("/api/google-calendar/mortgage-renewals/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: uniqueIds.slice(index, index + 25), limit: 100 }),
      }).catch(() => undefined);
    }
  }, []);

  const addManualContact = useCallback(
    (
      draft: ContactDraft,
      broker: Exclude<ContactBroker, "unassigned">,
      defaults?: {
        clientType?: Exclude<Contact["clientType"], null>;
        clientProvenance?: Contact["clientProvenance"];
      },
    ) =>
      runWrite("Impossible d’enregistrer le contact.", async () => {
        const data = await crmDataRequest<ContactRow>({
          action: "addManualContact",
          draft,
          broker,
          clientType: defaults?.clientType ?? null,
          clientProvenance: defaults?.clientProvenance ?? null,
        });
        const contact = mapContact(data);
        setContacts((current) => [contact, ...current]);
        await Promise.all([
          requestBirthdaySync([contact.id]),
          requestMortgageRenewalSync([contact.id]),
        ]);
        return contact;
      }),
    [requestBirthdaySync, requestMortgageRenewalSync, runWrite],
  );

  const importContacts = useCallback(
    (entries: ReadonlyArray<ContactImportInput>, source: Exclude<ContactSource, "manual">) =>
      runWrite("L’import n’a pas pu enregistrer les adresses. Aucun contact n’a été perdu.", async () => {
        const data = await crmDataRequest<ContactRow[]>({ action: "importContacts", entries: [...entries], source });
        const imported = (data ?? []).map(mapContact);
        setContacts((current) => [...imported, ...current]);
        void requestBirthdaySync(imported.map((contact) => contact.id));
        return imported;
      }),
    [requestBirthdaySync, runWrite],
  );

  const enrichContactBirthDates = useCallback(
    (updates: ReadonlyArray<{ contactId: string; birthDate: string }>) =>
      runWrite("Les dates de naissance n’ont pas pu être enrichies.", async () => {
        if (updates.length === 0) return [];
        const data = await crmDataRequest<ContactRow[]>({ action: "enrichBirthDates", updates: [...updates] });
        const enriched = (data ?? []).map(mapContact);
        const byId = new Map(enriched.map((contact) => [contact.id, contact]));
        setContacts((current) => current.map((contact) => {
          const replacement = byId.get(contact.id);
          return replacement ? preserveAddressHistory(contact, replacement) : contact;
        }));
        void requestBirthdaySync(enriched.map((contact) => contact.id));
        return enriched;
      }),
    [requestBirthdaySync, runWrite],
  );

  const saveContactAddresses = useCallback(
    (contactId: string, addresses: ReadonlyArray<ContactAddressInput>) =>
      runWrite("Les adresses n’ont pas pu être enregistrées. Réessayez.", async () => {
        const data = await crmDataRequest<ContactRow>({ action: "saveContactAddresses", contactId, addresses: [...addresses] });
        const updated = mapContact(data);
        setContacts((current) => current.map((contact) => contact.id === contactId ? updated : contact));
        return updated;
      }),
    [runWrite],
  );

  const requestCalendarSync = useCallback(
    async (contactIds: ReadonlyArray<string>): Promise<CalendarSyncResult[]> => {
      try {
        const response = await fetch("/api/google-calendar/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactIds }),
        });
        if (!response.ok) {
          throw new Error("Service Google Agenda indisponible.");
        }

        const payload = (await response.json()) as { results: CalendarSyncResult[] };
        const syncedContacts = new Map(
          payload.results.flatMap((result) =>
            result.contact ? [[result.contact.id, result.contact] as const] : [],
          ),
        );
        setContacts((current) =>
          current.map((contact) => {
            const replacement = syncedContacts.get(contact.id);
            return replacement ? preserveAddressHistory(contact, replacement) : contact;
          }),
        );
        return payload.results;
      } catch {
        await crmDataRequest({ action: "calendarFailure", contactIds: [...contactIds] }).catch(() => undefined);
        setContacts((current) =>
          current.map((contact) =>
            contactIds.includes(contact.id)
              ? {
                  ...contact,
                  googleCalendarSyncStatus: "error",
                  googleCalendarLastError: "Service Google Agenda indisponible.",
                }
              : contact,
          ),
        );
        return contactIds.map((contactId) => ({
          status: "error",
          message: "Relance enregistrée · synchronisation Google Agenda impossible.",
          contact: contacts.find((contact) => contact.id === contactId),
        }));
      }
    },
    [contacts],
  );

  const assignContacts = useCallback(
    (contactIds: ReadonlyArray<string>, broker: ContactBroker) =>
      runWrite("Impossible de modifier le courtier.", async () => {
        const data = await crmDataRequest<ContactRow[]>({ action: "assignContacts", contactIds: [...contactIds], broker });

        const updatedContacts = new Map(
          ((data ?? []) as ContactRow[]).map((row) => {
            const contact = mapContact(row);
            return [contact.id, contact] as const;
          }),
        );
        setContacts((current) =>
          current.map((contact) => {
            const replacement = updatedContacts.get(contact.id);
            return replacement ? preserveAddressHistory(contact, replacement) : contact;
          }),
        );
        const contactsToSync = [...updatedContacts.values()]
          .filter(
            (contact) =>
              contact.nextFollowUpDate || contact.googleCalendarEventId,
          )
          .map((contact) => contact.id);
        if (contactsToSync.length > 0) {
          await requestCalendarSync(contactsToSync);
        }
      }),
    [requestCalendarSync, runWrite],
  );

  const assignContact = useCallback(
    (contactId: string, broker: ContactBroker) => assignContacts([contactId], broker),
    [assignContacts],
  );

  const updateFollowUp = useCallback(
    (contactId: string, nextDate: string | null) =>
      runWrite("Impossible de programmer la relance.", async () => {
        const data = await crmDataRequest<ContactRow>({ action: "updateFollowUp", contactId, nextDate });
        const updatedContact = mapContact(data);
        setContacts((current) =>
          current.map((contact) =>
            contact.id === contactId ? preserveAddressHistory(contact, updatedContact) : contact,
          ),
        );
        const [syncResult] = await requestCalendarSync([contactId]);
        return syncResult ?? {
          status: "error",
          message: "Relance enregistrée · synchronisation Google Agenda impossible.",
        };
      }),
    [requestCalendarSync, runWrite],
  );

  const retryCalendarSync = useCallback(
    async (contactId: string) => {
      const [result] = await requestCalendarSync([contactId]);
      return result ?? {
        status: "error",
        message: "Synchronisation Google Agenda impossible.",
      };
    },
    [requestCalendarSync],
  );

  const updateContact = useCallback(
    (contactId: string, values: ContactUpdate) =>
      runWrite("Impossible de modifier le contact.", async () => {
        const currentContact = contacts.find((contact) => contact.id === contactId);
        if (!currentContact) throw new Error("Contact introuvable.");
        const brokerChanged = currentContact.broker !== values.broker;
        const shouldResync = brokerChanged && Boolean(currentContact.nextFollowUpDate || currentContact.googleCalendarEventId);
        const previousAddresses = fallbackAddresses(currentContact).map((address) => ({ ...address, isPrimary: false, label: address.isPrimary ? "Ancienne adresse" as const : address.label }));
        const editedPrimary = addressInputFromDraft(values);
        const addresses = editedPrimary
          ? setPrimaryAddress(mergeAddressCollections([editedPrimary], previousAddresses), normalizeAddressKey(editedPrimary))
          : previousAddresses;
        const data = await crmDataRequest<ContactRow>({ action: "updateContact", contactId, values, addresses, brokerChanged: shouldResync });
        let updated = mapContact(data);
        setContacts((current) => current.map((contact) => contact.id === contactId ? updated : contact));
        if (brokerChanged && (updated.nextFollowUpDate || updated.googleCalendarEventId)) {
          const [sync] = await requestCalendarSync([contactId]);
          if (sync?.contact) updated = sync.contact;
        }
        if (currentContact.birthDate !== updated.birthDate) await requestBirthdaySync([contactId]);
        if (currentContact.mortgageRenewalDate !== updated.mortgageRenewalDate) {
          await requestMortgageRenewalSync([contactId]);
        }
        return updated;
      }),
    [contacts, requestBirthdaySync, requestCalendarSync, requestMortgageRenewalSync, runWrite],
  );

  const deleteContact = useCallback(
    (contactId: string) =>
      runWrite("Impossible de supprimer le contact.", async () => {
        const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Suppression refusée.");
        setContacts((current) => current.filter((contact) => contact.id !== contactId));
        setNotes((current) => current.filter((note) => note.contactId !== contactId));
      }),
    [runWrite],
  );

  const mergeDraftIntoContact = useCallback(
    (targetId: string, incomingDraft: ContactDraft, values: DraftMergeSelection) =>
      runWrite("Impossible de fusionner les contacts.", async () => {
        const response = await fetch("/api/contacts/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "draft",
            targetId,
            incomingDraft,
            values: {
              ...values,
              clientType: contacts.find((contact) => contact.id === targetId)?.clientType ?? null,
              clientProvenance: values.clientProvenance,
              priority: contacts.find((contact) => contact.id === targetId)?.priority ?? null,
              status: contacts.find((contact) => contact.id === targetId)?.status ?? "active",
            },
            nextFollowUpDate: values.nextFollowUpDate,
          }),
        });
        if (!response.ok) throw new Error("Fusion refusée.");
        const payload = (await response.json()) as { contact: Contact };
        setContacts((current) => current.map((contact) => contact.id === targetId ? payload.contact : contact));
        await requestBirthdaySync([targetId]);
        return payload.contact;
      }),
    [contacts, requestBirthdaySync, runWrite],
  );

  const mergeContacts = useCallback(
    (targetId: string, sourceId: string, values: ContactUpdate, followUpSource: "target" | "source" | null, addresses?: ReadonlyArray<ContactAddressInput>) =>
      runWrite("Impossible de fusionner les contacts.", async () => {
        const response = await fetch("/api/contacts/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "existing", targetId, sourceId, values, followUpSource, addresses }),
        });
        if (!response.ok) throw new Error("Fusion refusée.");
        const payload = (await response.json()) as { contact: Contact };
        setContacts((current) => [
          payload.contact,
          ...current.filter((contact) => contact.id !== targetId && contact.id !== sourceId),
        ]);
        setNotes((current) => current.map((note) => note.contactId === sourceId ? { ...note, contactId: targetId } : note));
        await requestBirthdaySync([targetId]);
        return payload.contact;
      }),
    [requestBirthdaySync, runWrite],
  );

  const addNote = useCallback(
    (contactId: string, content: string) =>
      runWrite("Impossible d’enregistrer la note.", async () => {
        const responsibleBroker = contacts.find((contact) => contact.id === contactId)?.broker;
        const actorBroker = selectedBroker?.toLowerCase() ?? (responsibleBroker === "unassigned" ? undefined : responsibleBroker);
        const rawNote = await crmDataRequest<ClientNoteRow>({ action: "addNote", contactId, content: content.trim(), actorBroker });
        const note = mapNote(rawNote);
        setNotes((current) => [note, ...current]);
        setLoadedNoteContacts((current) => new Set(current).add(contactId));
        setContacts((current) =>
          current.map((contact) =>
            contact.id === contactId
              ? { ...contact, lastContactDate: note.createdAt }
              : contact,
          ),
        );
        return note;
      }),
    [contacts, runWrite, selectedBroker],
  );

  const updateNote = useCallback(
    (noteId: string, content: string) =>
      runWrite("Impossible de modifier la note.", async () => {
        await crmDataRequest({ action: "updateNote", noteId, content: content.trim() });

        setNotes((current) =>
          current.map((note) =>
            note.id === noteId ? { ...note, content: content.trim() } : note,
          ),
        );
      }),
    [runWrite],
  );

  const deleteNote = useCallback(
    (noteId: string) =>
      runWrite("Impossible de supprimer la note.", async () => {
        const result = await crmDataRequest<DeleteNoteResult>({ action: "deleteNote", noteId });
        setNotes((current) => current.filter((note) => note.id !== result.noteId));
        setContacts((current) => current.map((contact) =>
          contact.id === result.contactId
            ? { ...contact, lastContactDate: result.lastContactDate }
            : contact,
        ));
      }),
    [runWrite],
  );

  const value = useMemo<CRMDataContextValue>(
    () => ({
      contacts,
      notes,
      isLoading,
      isSaving: pendingWrites > 0,
      error,
      clearError: () => setError(null),
      retry: loadContacts,
      loadNotesForContact,
      addManualContact,
      importContacts,
      enrichContactBirthDates,
      assignContact,
      assignContacts,
      updateFollowUp,
      retryCalendarSync,
      updateContact,
      saveContactAddresses,
      deleteContact,
      mergeDraftIntoContact,
      mergeContacts,
      addNote,
      updateNote,
      deleteNote,
    }),
    [
      contacts,
      notes,
      isLoading,
      pendingWrites,
      error,
      loadContacts,
      loadNotesForContact,
      addManualContact,
      importContacts,
      enrichContactBirthDates,
      assignContact,
      assignContacts,
      updateFollowUp,
      retryCalendarSync,
      updateContact,
      saveContactAddresses,
      deleteContact,
      mergeDraftIntoContact,
      mergeContacts,
      addNote,
      updateNote,
      deleteNote,
    ],
  );

  return <CRMDataContext.Provider value={value}>{children}</CRMDataContext.Provider>;
}

export function useCRMData() {
  const context = useContext(CRMDataContext);
  if (!context) {
    throw new Error("useCRMData doit être utilisé dans CRMDataProvider");
  }
  return context;
}
