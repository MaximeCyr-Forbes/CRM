"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useBroker } from "../broker-context";
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
  TRANSACTION_TYPE_LABELS,
  getNextTransactionDeadline,
  isTransactionCompleted,
  statusesForTransaction,
  type TransactionBroker,
  type TransactionDraft,
  type TransactionType,
} from "../data/transaction-types";
import { useTransactions } from "../transactions-context";
import { toLocalISODate } from "../lib/follow-up";
import { hasMinimumContactIdentity } from "../lib/contact-normalization";
import {
  EMPTY_TRANSACTION_CONTACT_DRAFT,
  createAndLinkTransactionContact,
  filterTransactionContacts,
  findStrongTransactionContactDuplicate,
  linkTransactionContact,
} from "../lib/transactions/contact-picker";
import { transactionMatchesSearch } from "../lib/transactions/search";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

type BrokerFilter = "all" | TransactionBroker;
type StateFilter = "active" | "completed";

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

function CreateTransactionModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { selectedBroker } = useBroker();
  const { contacts, addManualContact } = useContacts();
  const { createTransaction, isSaving } = useTransactions();
  const defaultBroker = (selectedBroker?.toLowerCase() ?? "maxime") as TransactionBroker;
  const [type, setType] = useState<TransactionType>("purchase");
  const [address, setAddress] = useState("");
  const [centrisNumber, setCentrisNumber] = useState("");
  const [broker, setBroker] = useState<TransactionBroker>(defaultBroker);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState<ContactDraft>({ ...EMPTY_TRANSACTION_CONTACT_DRAFT });
  const [contactError, setContactError] = useState<string | null>(null);
  const [duplicateContact, setDuplicateContact] = useState<Contact | null>(null);
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const [price, setPrice] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [status, setStatus] = useState<string>("new");
  const [generalNotes, setGeneralNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  useDialogLifecycle(true, onClose);

  const matchingContacts = useMemo(
    () => filterTransactionContacts(contacts, contactSearch),
    [contactSearch, contacts],
  );
  const visibleContacts = matchingContacts.slice(0, 100);

  function toggleContact(contactId: string) {
    setContactIds((current) => current.includes(contactId)
      ? current.filter((id) => id !== contactId)
      : [...current, contactId]);
  }

  function closeContactForm() {
    setIsAddingContact(false);
    setContactDraft({ ...EMPTY_TRANSACTION_CONTACT_DRAFT });
    setContactError(null);
    setDuplicateContact(null);
  }

  function useExistingContact(contact: Contact) {
    setContactIds((current) => linkTransactionContact(current, contact.id));
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
      const result = await createAndLinkTransactionContact(contactDraft, broker, contactIds, addManualContact);
      setContactIds(result.contactIds);
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
    const draft: TransactionDraft = {
      address: address.trim(),
      centrisNumber: centrisNumber.trim(),
      type,
      broker,
      contactIds,
      price: price ? Number(price) : null,
      promiseDate: promiseDate || null,
      status: status as TransactionDraft["status"],
      generalNotes,
    };
    try {
      await createTransaction(draft);
      onCreated();
    } catch {
      setError("La transaction n’a pas pu être créée.");
    }
  }

  return (
    <div className="transaction-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="create-transaction-title" aria-modal="true" className="transaction-modal transaction-create-modal" role="dialog">
        <div className="transaction-modal-heading">
          <div><p className="section-kicker">Nouvelle fiche</p><h2 id="create-transaction-title">CRÉER UNE TRANSACTION</h2></div>
          <button aria-label="Fermer" onClick={onClose} type="button">×</button>
        </div>
        <form className="transaction-form" onSubmit={submit}>
          <label className="transaction-field transaction-field-wide"><span>Adresse *</span><input autoFocus onChange={(event) => setAddress(event.target.value)} required value={address} /></label>
          <label className="transaction-field transaction-field-wide"><span>Numéro Centris</span><input onChange={(event) => setCentrisNumber(event.target.value)} value={centrisNumber} /></label>
          <label className="transaction-field"><span>Type *</span><select onChange={(event) => { const nextType = event.target.value as TransactionType; setType(nextType); setStatus("new"); }} value={type}><option value="purchase">Achat</option><option value="sale">Vente</option></select></label>
          <label className="transaction-field"><span>Courtier *</span><select onChange={(event) => setBroker(event.target.value as TransactionBroker)} value={broker}>{CONTACT_BROKERS.map((item) => <option key={item} value={item}>{BROKER_LABELS[item]}</option>)}</select></label>
          <label className="transaction-field"><span>Prix</span><input min="0" onChange={(event) => setPrice(event.target.value)} step="0.01" type="number" value={price} /></label>
          <label className="transaction-field"><span>Date de la PA</span><input onChange={(event) => setPromiseDate(event.target.value)} type="date" value={promiseDate} /></label>
          <label className="transaction-field transaction-field-wide"><span>Statut actuel</span><select onChange={(event) => setStatus(event.target.value)} value={status}>{statusesForTransaction(type).map((item) => <option key={item} value={item}>{TRANSACTION_STATUS_LABELS[item]}</option>)}</select></label>
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
            <div className="transaction-contact-list">{visibleContacts.map((contact) => <label key={contact.id}><input checked={contactIds.includes(contact.id)} onChange={() => toggleContact(contact.id)} type="checkbox" /><span><strong>{getContactName(contact)}</strong><small>{contact.phone || contact.email || "Coordonnées non renseignées"}</small></span><small>{BROKER_LABELS[contact.broker]}</small></label>)}</div>
            {matchingContacts.length > visibleContacts.length && <p className="transaction-contact-count">100 résultats affichés sur {matchingContacts.length}. Précisez la recherche pour trouver un contact.</p>}
            {contacts.length === 0 && <p>Aucun contact disponible.</p>}
            {contacts.length > 0 && matchingContacts.length === 0 && <p>Aucun contact ne correspond à cette recherche.</p>}
          </fieldset>
          <label className="transaction-field transaction-field-wide"><span>Notes générales</span><textarea onChange={(event) => setGeneralNotes(event.target.value)} rows={4} value={generalNotes} /></label>
          {error && <p className="transaction-form-error" role="alert">{error}</p>}
          <div className="transaction-form-actions transaction-field-wide"><button onClick={onClose} type="button">Annuler</button><button className="transaction-submit" disabled={isSaving} type="submit">{isSaving ? "Enregistrement…" : "Créer la transaction"}</button></div>
        </form>
      </section>
    </div>
  );
}

export default function TransactionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedBroker } = useBroker();
  const { contacts } = useContacts();
  const { transactions, isLoading, error, retry } = useTransactions();
  const queryBroker = searchParams.get("broker");
  const initialBroker = CONTACT_BROKERS.includes(queryBroker as TransactionBroker)
    ? queryBroker as TransactionBroker
    : selectedBroker?.toLowerCase() as TransactionBroker | undefined;
  const [brokerFilter, setBrokerFilter] = useState<BrokerFilter>(initialBroker ?? "all");
  const [stateFilter, setStateFilter] = useState<StateFilter>("active");
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const today = toLocalISODate(new Date());

  useEffect(() => {
    if (CONTACT_BROKERS.includes(queryBroker as TransactionBroker)) setBrokerFilter(queryBroker as TransactionBroker);
  }, [queryBroker]);

  useEffect(() => {
    if (!confirmation) return;
    const timeout = window.setTimeout(() => setConfirmation(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [confirmation]);

  const visibleTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      if (brokerFilter !== "all" && transaction.broker !== brokerFilter) return false;
      if (stateFilter === "active" ? isTransactionCompleted(transaction) : !isTransactionCompleted(transaction)) return false;
      const contactNames = transaction.contactIds.map((contactId) => {
        const contact = contacts.find((item) => item.id === contactId);
        return contact ? getContactName(contact) : "";
      }).join(" ");
      return transactionMatchesSearch(transaction, contactNames, search);
    });
  }, [brokerFilter, contacts, search, stateFilter, transactions]);

  return (
    <main className="transactions-page">
      <div className="transactions-shell">
        <header className="transactions-header">
          <div><p className="section-kicker">Dossiers immobiliers</p><h1>TRANSACTIONS</h1><p>Les dossiers, leurs clients et leurs prochaines dates importantes.</p></div>
          <button className="transaction-new" onClick={() => setIsCreating(true)} type="button">+ Nouvelle transaction</button>
        </header>

        <section className="transactions-controls" aria-label="Filtres des transactions">
          <div className="transaction-filter-group">{(["all", ...CONTACT_BROKERS] as BrokerFilter[]).map((broker) => <button aria-pressed={brokerFilter === broker} key={broker} onClick={() => setBrokerFilter(broker)} type="button">{broker === "all" ? "Tous" : BROKER_LABELS[broker]}</button>)}</div>
          <div className="transaction-filter-group transaction-state-filter"><button aria-pressed={stateFilter === "active"} onClick={() => setStateFilter("active")} type="button">Actives</button><button aria-pressed={stateFilter === "completed"} onClick={() => setStateFilter("completed")} type="button">Terminées</button></div>
          <label className="transactions-search"><span aria-hidden="true">⌕</span><input aria-label="Rechercher par adresse, numéro Centris ou client" onChange={(event) => setSearch(event.target.value)} placeholder="Adresse, Centris ou client" type="search" value={search} /></label>
        </section>

        {error && <div className="transaction-status transaction-status-error" role="alert"><span>{error}</span><button onClick={() => void retry()} type="button">Réessayer</button></div>}
        {isLoading && <div className="transaction-status">Chargement des transactions…</div>}

        <section className="transaction-grid" aria-live="polite">
          {visibleTransactions.map((transaction) => {
            const linkedContacts = transaction.contactIds.map((contactId) => contacts.find((contact) => contact.id === contactId)).filter(Boolean);
            const nextDeadline = getNextTransactionDeadline(transaction);
            const isOverdue = Boolean(nextDeadline && nextDeadline.dueDate < today);
            return <article className={`transaction-card ${isOverdue ? "transaction-card-overdue" : ""}`} key={transaction.id}>
              <div className="transaction-card-top"><span>{TRANSACTION_TYPE_LABELS[transaction.type]}</span><span className={`transaction-status-badge status-${transaction.status}`}>{TRANSACTION_STATUS_LABELS[transaction.status]}</span></div>
              <h2>{transaction.address}</h2>
              <dl><div><dt>Clients</dt><dd>{linkedContacts.length ? linkedContacts.map((contact) => getContactName(contact!)).join(" · ") : "Aucun contact lié"}</dd></div><div><dt>Courtier</dt><dd>{BROKER_LABELS[transaction.broker]}</dd></div><div><dt>Prochaine échéance</dt><dd className={isOverdue ? "transaction-deadline-overdue" : ""}>{isOverdue && <strong>EN RETARD · </strong>}{nextDeadline ? `${nextDeadline.title} · ${formatDate(nextDeadline.dueDate)}` : "Aucune échéance"}</dd></div></dl>
              <button onClick={() => router.push(`/transactions/${transaction.id}`)} type="button">Ouvrir <span aria-hidden="true">→</span></button>
            </article>;
          })}
          {!isLoading && visibleTransactions.length === 0 && <div className="transactions-empty"><span aria-hidden="true">◇</span><h2>Aucune transaction</h2><p>Créez une transaction ou modifiez les filtres.</p></div>}
        </section>
      </div>
      {confirmation && <div aria-live="polite" className="follow-up-confirmation" role="status"><span aria-hidden="true">✓</span><strong>{confirmation}</strong></div>}
      {isCreating && <CreateTransactionModal onClose={() => setIsCreating(false)} onCreated={() => { setIsCreating(false); setConfirmation("Transaction enregistrée ✓"); }} />}
    </main>
  );
}
