"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  ContactSource,
  ContactUpdate,
  DraftMergeSelection,
  PipelineStage,
  PipelineType,
} from "./data/contact-types";
import { BROKER_LABELS } from "./data/contact-types";

type ContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  apartment: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  broker: ContactBroker;
  client_type: Contact["clientType"];
  priority: Contact["priority"];
  status: Contact["status"];
  source: ContactSource;
  last_contact_date: string | null;
  next_follow_up_date: string | null;
  google_calendar_event_id: string | null;
  google_calendar_event_broker: Contact["googleCalendarEventBroker"];
  google_calendar_sync_status: Contact["googleCalendarSyncStatus"];
  google_calendar_last_error: string | null;
  buyer_pipeline_stage: Contact["buyerPipelineStage"];
  seller_pipeline_stage: Contact["sellerPipelineStage"];
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
    defaults?: { clientType?: Exclude<Contact["clientType"], null> },
  ) => Promise<Contact>;
  importContacts: (
    drafts: ReadonlyArray<ContactDraft>,
    source: Exclude<ContactSource, "manual">,
  ) => Promise<Contact[]>;
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
  updatePipelineStage: (
    contactId: string,
    pipeline: PipelineType,
    stage: PipelineStage,
  ) => Promise<Contact>;
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
  ) => Promise<Contact>;
  addNote: (contactId: string, content: string) => Promise<ClientNote>;
  updateNote: (noteId: string, content: string) => Promise<void>;
};

const CRMDataContext = createContext<CRMDataContextValue | null>(null);

function logDevelopmentWarning(error: unknown) {
  if (process.env.NODE_ENV !== "production") console.warn(error);
}

function mapContact(row: ContactRow): Contact {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    address: row.address ?? "",
    apartment: row.apartment ?? "",
    city: row.city ?? "",
    province: row.province ?? "",
    postalCode: row.postal_code ?? "",
    country: row.country ?? "",
    broker: row.broker,
    clientType: row.client_type,
    priority: row.priority,
    status: row.status,
    source: row.source,
    lastContactDate: row.last_contact_date,
    nextFollowUpDate: row.next_follow_up_date,
    googleCalendarEventId: row.google_calendar_event_id,
    googleCalendarEventBroker: row.google_calendar_event_broker,
    googleCalendarSyncStatus: row.google_calendar_sync_status,
    googleCalendarLastError: row.google_calendar_last_error,
    buyerPipelineStage: row.buyer_pipeline_stage ?? "new",
    sellerPipelineStage: row.seller_pipeline_stage ?? "new",
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
  const pipelineQueues = useRef(new Map<string, Promise<Contact>>());

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

  const addManualContact = useCallback(
    (
      draft: ContactDraft,
      broker: Exclude<ContactBroker, "unassigned">,
      defaults?: { clientType?: Exclude<Contact["clientType"], null> },
    ) =>
      runWrite("Impossible d’enregistrer le contact.", async () => {
        const data = await crmDataRequest<ContactRow>({ action: "addManualContact", draft, broker, clientType: defaults?.clientType ?? null });
        const contact = mapContact(data);
        setContacts((current) => [contact, ...current]);
        return contact;
      }),
    [runWrite],
  );

  const importContacts = useCallback(
    (drafts: ReadonlyArray<ContactDraft>, source: Exclude<ContactSource, "manual">) =>
      runWrite("Impossible d’importer les contacts.", async () => {
        const data = await crmDataRequest<ContactRow[]>({ action: "importContacts", drafts: [...drafts], source });
        const imported = (data ?? []).map(mapContact);
        setContacts((current) => [...imported, ...current]);
        return imported;
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
          current.map((contact) => syncedContacts.get(contact.id) ?? contact),
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
          current.map((contact) => updatedContacts.get(contact.id) ?? contact),
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
            contact.id === contactId ? updatedContact : contact,
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
        const data = await crmDataRequest<ContactRow>({ action: "updateContact", contactId, values, brokerChanged: shouldResync });
        let updated = mapContact(data);
        setContacts((current) => current.map((contact) => contact.id === contactId ? updated : contact));
        if (brokerChanged && (updated.nextFollowUpDate || updated.googleCalendarEventId)) {
          const [sync] = await requestCalendarSync([contactId]);
          if (sync?.contact) updated = sync.contact;
        }
        return updated;
      }),
    [contacts, requestCalendarSync, runWrite],
  );

  const updatePipelineStage = useCallback(
    (contactId: string, pipeline: PipelineType, stage: PipelineStage) => {
      const key = `${contactId}:${pipeline}`;
      const field = pipeline === "buyer" ? "buyerPipelineStage" : "sellerPipelineStage";
      setContacts((current) =>
        current.map((contact) =>
          contact.id === contactId ? { ...contact, [field]: stage } : contact,
        ),
      );

      const previous = pipelineQueues.current.get(key);
      const operation = (previous ? previous.catch(() => undefined) : Promise.resolve())
        .then(() =>
          runWrite("Impossible de déplacer ce contact dans le pipeline.", async () => {
            const responsibleBroker = contacts.find((contact) => contact.id === contactId)?.broker;
            const actorBroker = selectedBroker?.toLowerCase() ?? (responsibleBroker === "unassigned" ? undefined : responsibleBroker);
            const data = await crmDataRequest<ContactRow>({ action: "updatePipelineStage", contactId, pipeline, stage, actorBroker });
            const updated = mapContact(data);
            setContacts((current) =>
              current.map((contact) => contact.id === contactId ? updated : contact),
            );
            return updated;
          }),
        );

      pipelineQueues.current.set(key, operation);
      const cleanup = () => {
        if (pipelineQueues.current.get(key) === operation) {
          pipelineQueues.current.delete(key);
        }
      };
      void operation.then(cleanup, cleanup);
      return operation.catch(async (caughtError) => {
        await loadContacts();
        throw caughtError;
      });
    },
    [contacts, loadContacts, runWrite, selectedBroker],
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
              priority: contacts.find((contact) => contact.id === targetId)?.priority ?? null,
              status: contacts.find((contact) => contact.id === targetId)?.status ?? "active",
            },
            nextFollowUpDate: values.nextFollowUpDate,
          }),
        });
        if (!response.ok) throw new Error("Fusion refusée.");
        const payload = (await response.json()) as { contact: Contact };
        setContacts((current) => current.map((contact) => contact.id === targetId ? payload.contact : contact));
        return payload.contact;
      }),
    [contacts, runWrite],
  );

  const mergeContacts = useCallback(
    (targetId: string, sourceId: string, values: ContactUpdate, followUpSource: "target" | "source" | null) =>
      runWrite("Impossible de fusionner les contacts.", async () => {
        const response = await fetch("/api/contacts/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "existing", targetId, sourceId, values, followUpSource }),
        });
        if (!response.ok) throw new Error("Fusion refusée.");
        const payload = (await response.json()) as { contact: Contact };
        setContacts((current) => [
          payload.contact,
          ...current.filter((contact) => contact.id !== targetId && contact.id !== sourceId),
        ]);
        setNotes((current) => current.map((note) => note.contactId === sourceId ? { ...note, contactId: targetId } : note));
        return payload.contact;
      }),
    [runWrite],
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
      assignContact,
      assignContacts,
      updateFollowUp,
      retryCalendarSync,
      updateContact,
      updatePipelineStage,
      deleteContact,
      mergeDraftIntoContact,
      mergeContacts,
      addNote,
      updateNote,
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
      assignContact,
      assignContacts,
      updateFollowUp,
      retryCalendarSync,
      updateContact,
      updatePipelineStage,
      deleteContact,
      mergeDraftIntoContact,
      mergeContacts,
      addNote,
      updateNote,
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
