"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useContacts } from "../contacts-context";
import {
  BROKER_LABELS,
  CONTACT_BROKERS,
  getContactName,
  type Contact,
  type ContactDraft,
} from "../data/contact-types";
import {
  TRANSACTION_STATUS_LABELS,
  statusesForTransaction,
  validStatusForTransaction,
  type TransactionBroker,
  type TransactionDraft,
  type TransactionType,
} from "../data/transaction-types";
import { hasMinimumContactIdentity } from "../lib/contact-normalization";
import {
  EMPTY_TRANSACTION_CONTACT_DRAFT,
  createAndLinkTransactionContact,
  filterTransactionContacts,
  findStrongTransactionContactDuplicate,
  linkTransactionContact,
} from "../lib/transactions/contact-picker";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

const contactDraftLabels: Record<keyof ContactDraft, string> = {
  firstName: "Prénom",
  lastName: "Nom",
  phone: "Téléphone",
  email: "Courriel",
  civicNumber: "Numéro civique",
  address: "Rue",
  apartment: "Appartement",
  city: "Ville",
  province: "Province",
  postalCode: "Code postal",
  country: "Pays",
};

export function TransactionEditorModal({
  initial,
  isSaving,
  mode,
  onClose,
  onSave,
}: {
  initial: TransactionDraft;
  isSaving: boolean;
  mode: "create" | "edit";
  onClose: () => void;
  onSave: (draft: TransactionDraft) => Promise<void>;
}) {
  const { contacts, addManualContact } = useContacts();
  const [values, setValues] = useState<TransactionDraft>(initial);
  const [price, setPrice] = useState(initial.price === null ? "" : String(initial.price));
  const [contactSearch, setContactSearch] = useState("");
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState<ContactDraft>({ ...EMPTY_TRANSACTION_CONTACT_DRAFT });
  const [contactError, setContactError] = useState<string | null>(null);
  const [duplicateContact, setDuplicateContact] = useState<Contact | null>(null);
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDialogLifecycle(true, onClose);

  const matchingContacts = useMemo(
    () => filterTransactionContacts(contacts, contactSearch),
    [contactSearch, contacts],
  );
  const visibleContacts = matchingContacts.slice(0, 100);

  function update<K extends keyof TransactionDraft>(field: K, value: TransactionDraft[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function changeType(type: TransactionType) {
    setValues((current) => ({
      ...current,
      type,
      status: validStatusForTransaction(type, current.status),
    }));
  }

  function toggleContact(contactId: string) {
    setValues((current) => ({
      ...current,
      contactIds: current.contactIds.includes(contactId)
        ? current.contactIds.filter((id) => id !== contactId)
        : [...current.contactIds, contactId],
    }));
  }

  function closeContactForm() {
    setIsAddingContact(false);
    setContactDraft({ ...EMPTY_TRANSACTION_CONTACT_DRAFT });
    setContactError(null);
    setDuplicateContact(null);
  }

  function useExistingContact(contact: Contact) {
    setValues((current) => ({
      ...current,
      contactIds: linkTransactionContact(current.contactIds, contact.id),
    }));
    closeContactForm();
  }

  async function saveAndLinkContact(createDespiteDuplicate = false) {
    setContactError(null);
    if (!hasMinimumContactIdentity(contactDraft)) {
      setContactError("Ajoutez au moins un nom, un téléphone ou un courriel.");
      return;
    }
    const duplicate = findStrongTransactionContactDuplicate(contactDraft, contacts);
    if (duplicate && !createDespiteDuplicate) {
      setDuplicateContact(duplicate.contact);
      return;
    }
    setIsCreatingContact(true);
    try {
      const result = await createAndLinkTransactionContact(
        contactDraft,
        values.broker,
        values.contactIds,
        addManualContact,
      );
      setValues((current) => ({ ...current, contactIds: linkTransactionContact(current.contactIds, result.contact.id) }));
      closeContactForm();
    } catch {
      setContactError("Le contact n'a pas pu être enregistré.");
    } finally {
      setIsCreatingContact(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await onSave({
        ...values,
        address: values.address.trim(),
        centrisNumber: values.centrisNumber.trim(),
        price: price ? Number(price) : null,
        generalNotes: values.generalNotes.trim(),
      });
    } catch {
      setError(mode === "create" ? "La transaction n’a pas pu être créée." : "La transaction n’a pas pu être modifiée.");
    }
  }

  return (
    <div className="transaction-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="transaction-editor-title" aria-modal="true" className="transaction-modal transaction-create-modal" role="dialog">
        <div className="transaction-modal-heading">
          <div><p className="section-kicker">{mode === "create" ? "Nouvelle fiche" : "Informations générales"}</p><h2 id="transaction-editor-title">{mode === "create" ? "CRÉER UNE TRANSACTION" : "MODIFIER LA TRANSACTION"}</h2></div>
          <button aria-label="Fermer" onClick={onClose} type="button">×</button>
        </div>
        <form className="transaction-form" onSubmit={submit}>
          <label className="transaction-field transaction-field-wide"><span>Adresse *</span><input autoFocus onChange={(event) => update("address", event.target.value)} required value={values.address} /></label>
          <label className="transaction-field transaction-field-wide"><span>Numéro Centris</span><input onChange={(event) => update("centrisNumber", event.target.value)} value={values.centrisNumber} /></label>
          <label className="transaction-field"><span>Type *</span><select onChange={(event) => changeType(event.target.value as TransactionType)} value={values.type}><option value="purchase">Achat</option><option value="sale">Vente</option></select></label>
          <label className="transaction-field"><span>Courtier *</span><select onChange={(event) => update("broker", event.target.value as TransactionBroker)} value={values.broker}>{CONTACT_BROKERS.map((broker) => <option key={broker} value={broker}>{BROKER_LABELS[broker]}</option>)}</select></label>
          <label className="transaction-field"><span>Prix</span><input min="0" onChange={(event) => setPrice(event.target.value)} step="0.01" type="number" value={price} /></label>
          <label className="transaction-field"><span>Date de la PA</span><input onChange={(event) => update("promiseDate", event.target.value || null)} type="date" value={values.promiseDate ?? ""} /></label>
          <label className="transaction-field transaction-field-wide"><span>Statut actuel</span><select onChange={(event) => update("status", event.target.value as TransactionDraft["status"])} value={values.status}>{statusesForTransaction(values.type).map((status) => <option key={status} value={status}>{TRANSACTION_STATUS_LABELS[status]}</option>)}</select></label>
          <fieldset className="transaction-contact-picker transaction-field-wide">
            <legend>Contacts liés</legend>
            <div className="transaction-contact-tools">
              <label className="transaction-contact-search"><span className="sr-only">Rechercher un contact</span><input onChange={(event) => setContactSearch(event.target.value)} placeholder="Nom, téléphone ou courriel…" type="search" value={contactSearch} /></label>
              <button onClick={() => { setIsAddingContact(true); setContactError(null); setDuplicateContact(null); }} type="button">+ Ajouter un nouveau contact</button>
            </div>
            {isAddingContact && <div className="transaction-new-contact">
              <div className="transaction-new-contact-heading"><div><p className="section-kicker">Contact CRM</p><h3>NOUVEAU CONTACT</h3></div><button aria-label="Annuler l’ajout du contact" onClick={closeContactForm} type="button">×</button></div>
              <div className="transaction-new-contact-fields">{(Object.keys(contactDraftLabels) as Array<keyof ContactDraft>).map((field) => <label className={field === "address" ? "transaction-contact-field-wide" : ""} key={field}><span>{contactDraftLabels[field]}</span><input onChange={(event) => { setContactDraft((current) => ({ ...current, [field]: event.target.value })); setDuplicateContact(null); }} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} value={contactDraft[field]} /></label>)}</div>
              {duplicateContact && <div className="transaction-contact-duplicate" role="alert"><strong>CONTACT POSSIBLE DÉJÀ EXISTANT</strong><p>{getContactName(duplicateContact)}</p><small>{[duplicateContact.phone, duplicateContact.email].filter(Boolean).join(" · ")}</small><div><button onClick={() => useExistingContact(duplicateContact)} type="button">Utiliser ce contact</button><button disabled={isCreatingContact} onClick={() => void saveAndLinkContact(true)} type="button">Créer quand même</button></div></div>}
              {contactError && <p className="transaction-form-error" role="alert">{contactError}</p>}
              <div className="transaction-new-contact-actions"><button onClick={closeContactForm} type="button">Annuler</button><button className="transaction-submit" disabled={isCreatingContact} onClick={() => void saveAndLinkContact()} type="button">{isCreatingContact ? "Enregistrement…" : "Enregistrer et lier"}</button></div>
            </div>}
            <div className="transaction-contact-list">{visibleContacts.map((contact) => <label key={contact.id}><input checked={values.contactIds.includes(contact.id)} onChange={() => toggleContact(contact.id)} type="checkbox" /><span><strong>{getContactName(contact)}</strong><small>{contact.phone || contact.email || "Coordonnées non renseignées"}</small></span><small>{BROKER_LABELS[contact.broker]}</small></label>)}</div>
            {matchingContacts.length > visibleContacts.length && <p className="transaction-contact-count">100 résultats affichés sur {matchingContacts.length}. Précisez la recherche pour trouver un contact.</p>}
            {contacts.length === 0 && <p>Aucun contact disponible.</p>}
            {contacts.length > 0 && matchingContacts.length === 0 && <p>Aucun contact ne correspond à cette recherche.</p>}
          </fieldset>
          <label className="transaction-field transaction-field-wide"><span>Notes générales</span><textarea onChange={(event) => update("generalNotes", event.target.value)} rows={4} value={values.generalNotes} /></label>
          {error && <p className="transaction-form-error" role="alert">{error}</p>}
          <div className="transaction-form-actions transaction-field-wide"><button onClick={onClose} type="button">Annuler</button><button className="transaction-submit" disabled={isSaving} type="submit">{isSaving ? "Enregistrement…" : mode === "create" ? "Créer la transaction" : "Enregistrer les modifications"}</button></div>
        </form>
      </section>
    </div>
  );
}
