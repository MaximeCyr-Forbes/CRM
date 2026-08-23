"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useClientNotes } from "../../client-notes-context";
import { PencilIcon } from "../../components/action-icons";
import { ClientHistory } from "../../components/client-history";
import { ContactEditorModal, type ContactEditorMode } from "../../components/contact-editor-modal";
import { ContactAddressManager } from "../../components/contact-address-manager";
import { ContactEmailModal } from "../../components/contact-email-modal";
import { DuplicateResolutionModal } from "../../components/duplicate-resolution-modal";
import { DataStatus } from "../../components/data-status";
import { FollowUpSchedulerModal } from "../../components/follow-up-scheduler-modal";
import { NoteEditorModal } from "../../components/note-editor-modal";
import { NoteDeleteConfirmationModal } from "../../components/note-delete-confirmation-modal";
import { useContacts } from "../../contacts-context";
import { useCRMData } from "../../crm-data-context";
import type { CalendarSyncResult } from "../../data/calendar-types";
import type { ClientNote } from "../../data/client-note-types";
import type { ContactUpdate } from "../../data/contact-types";
import type { DraftMergeSelection } from "../../data/contact-types";
import {
  BROKER_LABELS,
  CLIENT_PROVENANCE_LABELS,
  CLIENT_TYPE_LABELS,
  CONTACT_BROKERS,
  PRIORITY_LABELS,
  getContactAddressLines,
  getContactName,
} from "../../data/contact-types";
import { useFollowUps } from "../../follow-up-context";
import { formatLastContact } from "../../lib/client-notes";
import { formatFollowUpDate, toLocalISODate } from "../../lib/follow-up";
import { findDuplicateMatches, type DuplicateReason } from "../../lib/contact-normalization";
import { TRANSACTION_STATUS_LABELS, TRANSACTION_TYPE_LABELS } from "../../data/transaction-types";
import { useTransactions } from "../../transactions-context";
import { getFollowUpQueue } from "../../lib/follow-up-queue";
import { formatBirthDate } from "../../lib/birth-date";
import { formatMortgageRenewalDate } from "../../lib/mortgage-renewal-date";
import { useBroker } from "../../broker-context";

type NoteEditorState = {
  mode: "create" | "edit";
  noteId?: string;
  initialContent: string;
} | null;

type Confirmation = {
  title: string;
  detail?: string;
  nextContactId?: string;
  allDone?: boolean;
} | null;

type EditDuplicate = {
  existingId: string;
  reasons: DuplicateReason[];
  values: ContactUpdate;
} | null;

export default function ContactProfilePage() {
  const params = useParams<{ contactId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { contacts, assignContact, updateContact, saveContactAddresses, deleteContact, mergeContacts } = useContacts();
  const { isLoading, isSaving, error, retryCalendarSync } = useCRMData();
  const { getFollowUpDate } = useFollowUps();
  const { getNotesForContact, loadNotesForContact, addNote, updateNote, deleteNote } = useClientNotes();
  const { transactions } = useTransactions();
  const { selectedBroker } = useBroker();
  const [isDirectFollowUpOpen, setIsDirectFollowUpOpen] = useState(false);
  const [isPostNoteFollowUpOpen, setIsPostNoteFollowUpOpen] = useState(false);
  const [noteEditor, setNoteEditor] = useState<NoteEditorState>(null);
  const [assignmentPurpose, setAssignmentPurpose] = useState<
    "note" | "follow-up" | "change" | null
  >(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [contactEditorMode, setContactEditorMode] = useState<ContactEditorMode | null>(null);
  const [isManagingAddresses, setIsManagingAddresses] = useState(false);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<ClientNote | null>(null);
  const [editDuplicate, setEditDuplicate] = useState<EditDuplicate>(null);
  const [birthdaySync, setBirthdaySync] = useState({ synced: 0, pending: 0, error: 0 });
  const [mortgageRenewalSync, setMortgageRenewalSync] = useState({ synced: 0, pending: 0, error: 0 });
  const contact = contacts.find((item) => item.id === params.contactId);
  const contactName = contact ? getContactName(contact) : "";
  const followUpDate = contact ? getFollowUpDate(contact.id) : null;
  const notes = contact ? getNotesForContact(contact.id) : [];
  const linkedTransactions = contact
    ? transactions.filter((transaction) => transaction.contactIds.includes(contact.id))
    : [];

  async function refreshBirthdaySyncStatus(contactId: string, hasBirthDate: boolean) {
    if (!hasBirthDate) {
      const empty = { synced: 0, pending: 0, error: 0 };
      setBirthdaySync(empty);
      return empty;
    }
    try {
      const response = await fetch(`/api/google-calendar/birthdays/sync?contactId=${encodeURIComponent(contactId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("État indisponible");
      const counts = (await response.json()) as { synced: number; pending: number; error: number };
      setBirthdaySync(counts);
      return counts;
    } catch {
      const pending = { synced: 0, pending: 3, error: 0 };
      setBirthdaySync(pending);
      return pending;
    }
  }

  async function refreshMortgageRenewalSyncStatus(contactId: string, hasDate: boolean) {
    if (!hasDate) {
      const empty = { synced: 0, pending: 0, error: 0 };
      setMortgageRenewalSync(empty);
      return empty;
    }
    try {
      const response = await fetch(`/api/google-calendar/mortgage-renewals/sync?contactId=${encodeURIComponent(contactId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("État indisponible");
      const counts = (await response.json()) as { synced: number; pending: number; error: number };
      setMortgageRenewalSync(counts);
      return counts;
    } catch {
      const pending = { synced: 0, pending: 3, error: 0 };
      setMortgageRenewalSync(pending);
      return pending;
    }
  }

  useEffect(() => {
    if (!isLoading && !error && !contact) {
      router.replace("/contacts");
    }
  }, [contact, error, isLoading, router]);

  useEffect(() => {
    if (contact) {
      void loadNotesForContact(contact.id);
    }
  }, [contact, loadNotesForContact]);

  useEffect(() => {
    if (contact) void refreshBirthdaySyncStatus(contact.id, Boolean(contact.birthDate));
  }, [contact?.birthDate, contact?.id]);

  useEffect(() => {
    if (contact) void refreshMortgageRenewalSyncStatus(contact.id, Boolean(contact.mortgageRenewalDate));
  }, [contact?.id, contact?.mortgageRenewalDate]);

  useEffect(() => {
    if (!confirmation) {
      return;
    }

    if (confirmation.nextContactId || confirmation.allDone) return;
    const timeout = window.setTimeout(() => setConfirmation(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [confirmation]);

  if (!contact) {
    return (
      <main className="client-page">
        <div className="profile-shell"><DataStatus /></div>
      </main>
    );
  }

  function requestNewNote() {
    if (!contact) {
      return;
    }

    if (contact.broker === "unassigned") {
      setAssignmentPurpose("note");
      return;
    }

    setNoteEditor({ mode: "create", initialContent: "" });
  }

  function requestFollowUp() {
    if (!contact) {
      return;
    }
    if (contact.broker === "unassigned") {
      setAssignmentPurpose("follow-up");
      return;
    }
    setIsDirectFollowUpOpen(true);
  }

  async function chooseBroker(broker: (typeof CONTACT_BROKERS)[number]) {
    if (!contact) {
      return;
    }

    try {
      await assignContact(contact.id, broker);
      const actionToContinue = assignmentPurpose;
      setAssignmentPurpose(null);

      if (actionToContinue === "note") {
        setNoteEditor({ mode: "create", initialContent: "" });
      } else if (actionToContinue === "follow-up") {
        setIsDirectFollowUpOpen(true);
      } else {
        setConfirmation({
          title: `${contactName} a été attribué à ${BROKER_LABELS[broker]}`,
        });
      }
    } catch {
      // La fenêtre reste ouverte et le message global permet de réessayer.
    }
  }

  async function saveNote(content: string) {
    if (!noteEditor || !contact) {
      return;
    }

    if (noteEditor.mode === "edit" && noteEditor.noteId) {
      await updateNote(noteEditor.noteId, content);
      setNoteEditor(null);
      setConfirmation({ title: "Note modifiée" });
      return;
    }

    if (contact.broker === "unassigned") {
      setNoteEditor(null);
      setAssignmentPurpose("note");
      return;
    }

    await addNote(contact.id, content);
    setNoteEditor(null);
    setIsPostNoteFollowUpOpen(true);
  }

  function editNote(note: ClientNote) {
    setNoteEditor({
      mode: "edit",
      noteId: note.id,
      initialContent: note.content,
    });
  }

  async function confirmDeleteNote() {
    if (!noteToDelete) return;
    await deleteNote(noteToDelete.id);
    setNoteToDelete(null);
    setConfirmation({ title: "Note supprimée" });
  }

  function finishDirectFollowUp(
    nextDate: string | null,
    calendarSync: CalendarSyncResult,
  ) {
    setIsDirectFollowUpOpen(false);
    setConfirmation({
      title: nextDate
        ? `Relance programmée pour le ${formatFollowUpDate(nextDate)}`
        : "Aucune relance programmée",
      detail: calendarSync.message,
    });
  }

  function finishPostNoteFollowUp(
    nextDate: string | null,
    calendarSync: CalendarSyncResult,
  ) {
    setIsPostNoteFollowUpOpen(false);
    const isFollowUpMode = searchParams.get("mode") === "followups";
    const today = toLocalISODate(new Date());
    const nextContact = isFollowUpMode && contact!.broker !== "unassigned"
      ? getFollowUpQueue(contacts, contact!.broker, today, contact!.id)[0]
      : undefined;
    setConfirmation({
      title: "Note ajoutée",
      detail: [
        nextDate
          ? `Relance programmée pour le ${formatFollowUpDate(nextDate)}`
          : "Aucune relance programmée",
        calendarSync.message,
      ].join(" · "),
      nextContactId: nextContact?.id,
      allDone: isFollowUpMode && !nextContact,
    });
  }

  async function retryGoogleCalendarSync() {
    const result = await retryCalendarSync(params.contactId);
    setConfirmation({ title: result.message });
  }

  async function saveContact(values: ContactUpdate) {
    const match = findDuplicateMatches(
      values,
      contacts.filter((item) => item.id !== params.contactId),
    )[0];
    if (match) {
      setContactEditorMode(null);
      setEditDuplicate({ existingId: match.contact.id, reasons: match.reasons, values });
      await Promise.all([
        loadNotesForContact(match.contact.id),
        loadNotesForContact(params.contactId),
      ]);
      return;
    }
    await updateContact(params.contactId, values);
    const [birthday, mortgageRenewal] = await Promise.all([
      refreshBirthdaySyncStatus(params.contactId, Boolean(values.birthDate)),
      refreshMortgageRenewalSyncStatus(params.contactId, Boolean(values.mortgageRenewalDate)),
    ]);
    setContactEditorMode(null);
    setConfirmation({
      title: "Contact modifié",
      detail: [
        values.birthDate
          ? `Anniversaire : ${birthday.synced} synchronisé${birthday.synced > 1 ? "s" : ""} · ${birthday.pending} en attente${birthday.error ? ` · ${birthday.error} erreur` : ""}`
          : "Aucune date d’anniversaire",
        values.mortgageRenewalDate
          ? `Renouvellement : ${mortgageRenewal.synced} synchronisé${mortgageRenewal.synced > 1 ? "s" : ""} · ${mortgageRenewal.pending} en attente${mortgageRenewal.error ? ` · ${mortgageRenewal.error} erreur` : ""}`
          : "Aucun renouvellement hypothécaire",
      ].join(" · "),
    });
  }

  async function confirmDeleteContact() {
    await deleteContact(params.contactId);
    router.replace("/contacts");
  }

  async function keepEditedDuplicate() {
    if (!editDuplicate) return;
    await updateContact(params.contactId, editDuplicate.values);
    setEditDuplicate(null);
    setConfirmation({ title: "Les deux contacts ont été conservés" });
  }

  async function mergeEditedDuplicate(selection: DraftMergeSelection) {
    if (!editDuplicate || !contact) return;
    const existing = contacts.find((item) => item.id === editDuplicate.existingId);
    if (!existing) return;
    const followUpSource = existing.nextFollowUpDate && selection.nextFollowUpDate === existing.nextFollowUpDate
      ? "target"
      : contact.nextFollowUpDate && selection.nextFollowUpDate === contact.nextFollowUpDate
        ? "source"
        : null;
    const merged = await mergeContacts(
      existing.id,
      contact.id,
      {
        firstName: selection.firstName,
        lastName: selection.lastName,
        phone: selection.phone,
        email: selection.email,
        birthDate: selection.birthDate,
        mortgageRenewalDate: selection.mortgageRenewalDate,
        civicNumber: selection.civicNumber,
        address: selection.address,
        apartment: selection.apartment,
        city: selection.city,
        province: selection.province,
        postalCode: selection.postalCode,
        country: selection.country,
        broker: selection.broker,
        clientType: existing.clientType ?? contact.clientType,
        clientProvenance: selection.clientProvenance,
        priority: existing.priority ?? contact.priority,
        status: existing.status === "active" || contact.status === "active" ? "active" : "inactive",
      },
      followUpSource,
      selection.addresses,
    );
    setEditDuplicate(null);
    router.replace(`/contacts/${merged.id}`);
  }

  return (
    <main className="client-page">
      <div className="profile-shell">
        <DataStatus />
        <header className="profile-hero">
          <div className="profile-title">
            <div className="profile-avatar" aria-hidden="true">
              {[contact.firstName, contact.lastName]
                .filter(Boolean)
                .map((part) => part[0])
                .slice(0, 2)
                .join("") || "?"}
            </div>
            <div>
              <p className="section-kicker">Fiche contact</p>
              <h1>{contactName}</h1>
              <div className="profile-tags">
                <span className={`contact-broker-badge broker-${contact.broker}`}>
                  {BROKER_LABELS[contact.broker]}
                </span>
                {contact.clientType && <span>{CLIENT_TYPE_LABELS[contact.clientType]}</span>}
                {contact.priority && (
                  <span className={`priority priority-${PRIORITY_LABELS[contact.priority].toLowerCase()}`}>
                    Priorité · {PRIORITY_LABELS[contact.priority]}
                  </span>
                )}
                {contact.clientProvenance && <span>Provenance · {CLIENT_PROVENANCE_LABELS[contact.clientProvenance]}</span>}
              </div>
            </div>
          </div>

          <div className="profile-actions" aria-label="Actions du contact">
            <button
              className="profile-action profile-action-primary"
              onClick={requestFollowUp}
              type="button"
            >
              Relancer
            </button>
            <button
              className="profile-action profile-action-secondary"
              onClick={requestNewNote}
              type="button"
            >
              Ajouter une note
            </button>
            <button className="profile-action profile-action-email" onClick={() => setIsEmailOpen(true)} type="button">
              Envoyer un courriel
            </button>
            <button className="profile-action profile-action-tertiary" onClick={() => setContactEditorMode("full")} type="button">
              Action
            </button>
          </div>
        </header>

        <section className="profile-overview" aria-label="Informations principales du contact">
          <article className="profile-info-card">
            <div className="profile-card-heading">
              <p className="info-card-label">Coordonnées</p>
              <button aria-label="Modifier les coordonnées" className="card-edit-button" onClick={() => setContactEditorMode("coordinates")} title="Modifier les coordonnées" type="button"><PencilIcon /></button>
            </div>
            <div className="info-group">
              <span>Téléphone</span>
              {contact.phone ? <a className="contact-direct-link" href={`tel:${contact.phone}`}>{contact.phone}</a> : <strong>Non renseigné</strong>}
            </div>
            <div className="info-group">
              <span>Email</span>
              {contact.email ? <a className="contact-direct-link" href={`mailto:${contact.email}`}>{contact.email}</a> : <strong>Non renseigné</strong>}
            </div>
            <div className="info-group">
              <span>Anniversaire</span>
              <strong>{formatBirthDate(contact.birthDate)}</strong>
              <small>{!contact.birthDate ? "Aucune date d’anniversaire" : birthdaySync.synced === 3 ? "Anniversaire synchronisé dans 3 agendas" : `${birthdaySync.synced} agenda${birthdaySync.synced > 1 ? "s" : ""} synchronisé${birthdaySync.synced > 1 ? "s" : ""} · ${birthdaySync.pending} en attente${birthdaySync.error ? ` · ${birthdaySync.error} erreur` : ""}`}</small>
            </div>
            <div className="info-group">
              <span>Renouvellement hypothécaire</span>
              <strong>{formatMortgageRenewalDate(contact.mortgageRenewalDate)}</strong>
              {contact.mortgageRenewalDate && (
                <small>
                  {mortgageRenewalSync.synced === 3
                    ? "3 agendas synchronisés ✓"
                    : `${mortgageRenewalSync.synced} agenda${mortgageRenewalSync.synced > 1 ? "s" : ""} synchronisé${mortgageRenewalSync.synced > 1 ? "s" : ""} · ${mortgageRenewalSync.pending} en attente${mortgageRenewalSync.error ? ` · ${mortgageRenewalSync.error} erreur${mortgageRenewalSync.error > 1 ? "s" : ""}` : ""}`}
                </small>
              )}
            </div>
            <div className="info-group profile-address-group">
              <span>Adresse résidentielle</span>
              {getContactAddressLines(contact).length > 0
                ? <address>{getContactAddressLines(contact).map((line) => <strong key={line}>{line}</strong>)}</address>
                : <strong>Non renseignée</strong>}
            </div>
          </article>

          <article className="profile-info-card">
            <div className="profile-card-heading">
              <p className="info-card-label">Responsabilité</p>
              <button aria-label="Modifier la responsabilité" className="card-edit-button" onClick={() => setContactEditorMode("responsibility")} title="Modifier la responsabilité" type="button"><PencilIcon /></button>
            </div>
            <div className="info-group">
              <span>Courtier responsable</span>
              <strong>{BROKER_LABELS[contact.broker]}</strong>
            </div>
            <div className="info-group">
              <span>Type de client</span>
              <strong>
                {contact.clientType ? CLIENT_TYPE_LABELS[contact.clientType] : "Non renseigné"}
              </strong>
            </div>
            <div className="info-group">
              <span>Provenance</span>
              <strong>{contact.clientProvenance ? CLIENT_PROVENANCE_LABELS[contact.clientProvenance] : "Non renseignée"}</strong>
            </div>
            <div className="info-group">
              <span>Priorité</span>
              <strong>{contact.priority ? PRIORITY_LABELS[contact.priority] : "Non renseignée"}</strong>
            </div>
            <div className="info-group">
              <span>Statut</span>
              <strong>{contact.status === "active" ? "Actif" : "Inactif"}</strong>
            </div>
            <button
              className="contact-profile-reassign"
              onClick={() => setAssignmentPurpose("change")}
              type="button"
            >
              Changer le courtier
            </button>
          </article>

          <article className="profile-info-card profile-info-highlight">
            <div className="profile-card-heading">
              <p className="info-card-label">Suivi</p>
              <button aria-label="Modifier le suivi" className="card-edit-button card-edit-button-on-dark" onClick={requestFollowUp} title="Modifier la prochaine relance" type="button"><PencilIcon /></button>
            </div>
            <div className="info-group">
              <span>Dernier contact</span>
              <strong>
                {contact.lastContactDate
                  ? formatLastContact(contact.lastContactDate)
                  : "Aucun contact enregistré"}
              </strong>
            </div>
            <div className="info-group next-follow-up">
              <span>Prochaine relance</span>
              <strong>
                {followUpDate
                  ? formatFollowUpDate(followUpDate)
                  : "Aucune relance programmée"}
              </strong>
            </div>
            <div className={`calendar-sync-state calendar-sync-${contact.googleCalendarSyncStatus}`}>
              <span>Google Agenda</span>
              <strong>
                {contact.googleCalendarSyncStatus === "synced"
                  ? "Synchronisé ✓"
                  : contact.googleCalendarLastError ?? "Synchronisation en attente"}
              </strong>
              {contact.googleCalendarSyncStatus === "error" && (
                <button onClick={() => void retryGoogleCalendarSync()} type="button">
                  Réessayer
                </button>
              )}
            </div>
          </article>
        </section>

        <section className="profile-addresses-section" aria-labelledby="profile-addresses-title">
          <div className="profile-section-heading"><div><p className="section-kicker">Historique résidentiel</p><h2 id="profile-addresses-title">ADRESSES</h2></div><button onClick={() => setIsManagingAddresses(true)} type="button">GÉRER LES ADRESSES</button></div>
          <div className="profile-address-list">
            {contact.addresses.map((address) => <article key={address.id}><strong>{address.isPrimary ? "PRINCIPALE" : address.label.toLocaleUpperCase("fr-CA")}</strong><address>{getContactAddressLines(address).map((line) => <span key={line}>{line}</span>)}</address></article>)}
            {contact.addresses.length === 0 && <p>Aucune adresse enregistrée.</p>}
          </div>
        </section>

        <ClientHistory notes={notes} onAdd={requestNewNote} onDelete={setNoteToDelete} onEdit={editNote} />

        <section className="profile-transactions-section" aria-labelledby="profile-transactions-title">
          <div>
            <p className="section-kicker">Dossiers immobiliers</p>
            <h2 id="profile-transactions-title">TRANSACTIONS LIÉES</h2>
          </div>
          <div className="profile-transaction-list">
            {linkedTransactions.map((transaction) => (
              <button key={transaction.id} onClick={() => router.push(`/transactions/${transaction.id}`)} type="button">
                <span>{transaction.address}</span>
                <small>{TRANSACTION_TYPE_LABELS[transaction.type]} · {TRANSACTION_STATUS_LABELS[transaction.status]}</small>
                <strong>Ouvrir →</strong>
              </button>
            ))}
            {linkedTransactions.length === 0 && <p>Aucune transaction liée à ce contact.</p>}
          </div>
        </section>

        <div className="contact-danger-zone">
          <button className="destructive-button" onClick={() => setIsDeleteConfirmationOpen(true)} type="button">
            Supprimer le contact
          </button>
        </div>
      </div>

      {contactEditorMode && (
        <ContactEditorModal
          contact={contact}
          isSaving={isSaving}
          mode={contactEditorMode}
          onCancel={() => setContactEditorMode(null)}
          onSave={saveContact}
        />
      )}
      {isManagingAddresses && <ContactAddressManager contact={contact} isSaving={isSaving} onCancel={() => setIsManagingAddresses(false)} onSave={async (addresses) => { await saveContactAddresses(contact.id, addresses); setIsManagingAddresses(false); setConfirmation({ title: "Adresses mises à jour" }); }} />}

      {editDuplicate && (() => {
        const existing = contacts.find((item) => item.id === editDuplicate.existingId);
        if (!existing) return null;
        return (
          <DuplicateResolutionModal
            existing={existing}
            existingNotesCount={notes.filter((note) => note.contactId === existing.id).length}
            incoming={{
              firstName: editDuplicate.values.firstName,
              lastName: editDuplicate.values.lastName,
              phone: editDuplicate.values.phone,
              email: editDuplicate.values.email,
              birthDate: editDuplicate.values.birthDate,
              mortgageRenewalDate: editDuplicate.values.mortgageRenewalDate,
              civicNumber: editDuplicate.values.civicNumber,
              address: editDuplicate.values.address,
              apartment: editDuplicate.values.apartment,
              city: editDuplicate.values.city,
              province: editDuplicate.values.province,
              postalCode: editDuplicate.values.postalCode,
              country: editDuplicate.values.country,
              broker: editDuplicate.values.broker,
              clientProvenance: editDuplicate.values.clientProvenance,
              nextFollowUpDate: contact.nextFollowUpDate,
            }}
            incomingNotesCount={notes.filter((note) => note.contactId === contact.id).length}
            isSaving={isSaving}
            onCancel={() => setEditDuplicate(null)}
            onKeepBoth={keepEditedDuplicate}
            onMerge={mergeEditedDuplicate}
            reasons={editDuplicate.reasons}
          />
        );
      })()}

      {isDeleteConfirmationOpen && (
        <div className="contact-modal-backdrop contact-modal-top">
          <section aria-modal="true" className="contact-modal delete-contact-modal" role="alertdialog">
            <header className="contact-modal-header">
              <div>
                <p className="section-kicker">SUPPRESSION DÉFINITIVE</p>
                <h2>Supprimer définitivement {contactName} ?</h2>
              </div>
            </header>
            <p>Cette action supprimera également son historique et ses relances.</p>
            <div className="delete-contact-actions">
              <button onClick={() => setIsDeleteConfirmationOpen(false)} type="button">ANNULER</button>
              <button className="destructive-button" onClick={() => void confirmDeleteContact()} type="button">SUPPRIMER DÉFINITIVEMENT</button>
            </div>
          </section>
        </div>
      )}

      <NoteEditorModal
        contactName={contactName}
        initialContent={noteEditor?.initialContent}
        isOpen={noteEditor !== null}
        mode={noteEditor?.mode ?? "create"}
        onCancel={() => setNoteEditor(null)}
        onSave={saveNote}
      />

      <ContactEmailModal
        contactId={contact.id}
        contactName={contactName}
        initialTo={contact.email}
        isOpen={isEmailOpen}
        onChooseBroker={() => router.push("/")}
        onClose={() => setIsEmailOpen(false)}
        onSent={(broker) => {
          setIsEmailOpen(false);
          setConfirmation({ title: `Courriel envoyé par ${broker}` });
        }}
        selectedBroker={selectedBroker}
      />

      <NoteDeleteConfirmationModal
        isDeleting={isSaving}
        note={noteToDelete}
        onCancel={() => setNoteToDelete(null)}
        onConfirm={confirmDeleteNote}
      />

      <FollowUpSchedulerModal
        contactId={contact.id}
        contactName={contactName}
        isOpen={isDirectFollowUpOpen}
        onClose={() => setIsDirectFollowUpOpen(false)}
        onScheduled={finishDirectFollowUp}
      />

      <FollowUpSchedulerModal
        contactId={contact.id}
        contactName={contactName}
        isOpen={isPostNoteFollowUpOpen}
        mode="after-note"
        onClose={() => {
          setIsPostNoteFollowUpOpen(false);
          setConfirmation({ title: "Note ajoutée" });
        }}
        onScheduled={finishPostNoteFollowUp}
      />

      {assignmentPurpose && (
        <div className="contact-modal-backdrop contact-modal-top">
          <section
            aria-labelledby="note-assignment-title"
            aria-modal="true"
            className="contact-modal contact-modal-medium"
            role="dialog"
          >
            <header className="contact-modal-header">
              <div>
                <p className="section-kicker">Attribution obligatoire</p>
                <h2 id="note-assignment-title">
                  {assignmentPurpose === "note" || assignmentPurpose === "follow-up"
                    ? "CE CONTACT DOIT ÊTRE ATTRIBUÉ À UN COURTIER"
                    : "À QUI ATTRIBUER CE CONTACT ?"}
                </h2>
              </div>
              <button
                aria-label="Fermer"
                onClick={() => setAssignmentPurpose(null)}
                type="button"
              >
                ×
              </button>
            </header>
            <div className="broker-choice-grid">
              {CONTACT_BROKERS.map((broker) => (
                <button key={broker} onClick={() => void chooseBroker(broker)} type="button">
                  <span>{BROKER_LABELS[broker]}</span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {confirmation && (
        <div aria-live="polite" className="follow-up-confirmation" role="status">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>{confirmation.title}</strong>
            {confirmation.detail && <small>{confirmation.detail}</small>}
            {confirmation.allDone && <small>Toutes les relances sont terminées ✓</small>}
          </div>
          {confirmation.nextContactId && (
            <button
              className="next-follow-up-client"
              onClick={() => router.push(`/contacts/${confirmation.nextContactId}?mode=followups`)}
              type="button"
            >
              Client suivant →
            </button>
          )}
        </div>
      )}
    </main>
  );
}
