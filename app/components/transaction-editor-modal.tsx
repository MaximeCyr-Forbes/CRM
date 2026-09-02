"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useContacts } from "../contacts-context";
import {
  BROKER_LABELS,
  CLIENT_PROVENANCES,
  CLIENT_PROVENANCE_LABELS,
  CONTACT_BROKERS,
  getContactName,
  type Contact,
  type ContactDraft,
  type ClientProvenance,
} from "../data/contact-types";
import {
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  statusesForTransaction,
  validStatusForTransaction,
  type Transaction,
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
import { findTransactionsWithCentris, runSingleTransactionSave } from "../lib/transactions/editor";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";
import type { CentrisParseResult } from "../lib/centris-pdf/types";
import { CentrisTransactionImport } from "./centris-transaction-import";
import { OaciqTransactionImport } from "./oaciq-transaction-import";
import { confirmedAgenda, type DeadlineProposal, type OaciqTransactionPreview } from "../lib/transactions/oaciq-agenda";
import { matchOaciqParty, OACIQ_PREFILL_LABELS, prefillOaciqTransaction, preserveOaciqPrice, validOaciqPrice, type OaciqPrefillField, type OaciqPrefillConflict } from "../lib/transactions/oaciq-prefill";
import type { OaciqParty } from "../lib/oaciq-reader/transaction-details";

const contactDraftLabels: Record<keyof ContactDraft, string> = {
  firstName: "Prénom",
  lastName: "Nom",
  phone: "Téléphone",
  email: "Courriel",
  birthDate: "Date de naissance",
  mortgageRenewalDate: "Date de renouvellement hypothécaire",
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
  onOpenExisting,
  onSave,
  transactions = [],
}: {
  initial: TransactionDraft;
  isSaving: boolean;
  mode: "create" | "edit";
  onClose: () => void;
  onOpenExisting?: (transactionId: string) => void;
  onSave: (draft: TransactionDraft) => Promise<void>;
  transactions?: ReadonlyArray<Transaction>;
}) {
  const { contacts, addManualContact } = useContacts();
  const [values, setValues] = useState<TransactionDraft>(initial);
  const [price, setPrice] = useState(initial.price === null ? "" : String(initial.price));
  const [contactSearch, setContactSearch] = useState("");
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState<ContactDraft>({ ...EMPTY_TRANSACTION_CONTACT_DRAFT });
  const [contactClientProvenance, setContactClientProvenance] = useState<ClientProvenance>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [duplicateContact, setDuplicateContact] = useState<Contact | null>(null);
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const [appliedCentrisPricing, setAppliedCentrisPricing] = useState<CentrisParseResult["pricing"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<ReadonlyArray<Transaction>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const saveLock = useRef(false);
  const [creationKey] = useState(() => crypto.randomUUID());
  const [proposals, setProposals] = useState<DeadlineProposal[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [oaciqAnalysis, setOaciqAnalysis] = useState<OaciqTransactionPreview | null>(null);
  const [hasOaciqPrice, setHasOaciqPrice] = useState(false);
  const latestForm = useRef({ values, price, contacts });
  useEffect(() => { latestForm.current = { values, price, contacts }; }, [values, price, contacts]);
  const [prefillConflicts, setPrefillConflicts] = useState<OaciqPrefillConflict[]>([]);
  const dirtyFields = useRef(new Set<OaciqPrefillField>((["address", "centrisNumber", "price", "promiseDate"] as const).filter((field) => initial[field] !== null && initial[field] !== "")));
  const previousPrefill = useRef<Partial<Record<OaciqPrefillField, string>>>({});
  useDialogLifecycle(true, onClose);
  const isBusy = isSaving || isSubmitting || isAnalyzing;

  const matchingContacts = useMemo(
    () => filterTransactionContacts(contacts, contactSearch),
    [contactSearch, contacts],
  );
  const visibleContacts = matchingContacts.slice(0, 100);

  function update<K extends keyof TransactionDraft>(field: K, value: TransactionDraft[K]) {
    if (field === "address" || field === "centrisNumber" || field === "promiseDate") dirtyFields.current.add(field);
    setValues((current) => ({ ...current, [field]: value }));
  }

  function applyOaciqAnalysis(analysis: OaciqTransactionPreview) {
    const current = latestForm.current;
    const next = prefillOaciqTransaction(current.values, current.price, analysis, current.contacts, dirtyFields.current, previousPrefill.current);
    previousPrefill.current = next.applied;
    setValues(next.values); setPrice(next.price); setPrefillConflicts(next.conflicts); setOaciqAnalysis(analysis);
    if (validOaciqPrice(analysis)) { setAppliedCentrisPricing(null); setHasOaciqPrice(true); }
  }

  function applyDetectedField(conflict: OaciqPrefillConflict) {
    if (conflict.field === "price") setPrice(conflict.value);
    else setValues((current) => ({ ...current, [conflict.field]: conflict.value }));
    dirtyFields.current.delete(conflict.field);
    previousPrefill.current[conflict.field] = conflict.value;
    setPrefillConflicts((current) => current.filter((c) => c.field !== conflict.field));
  }

  function preparePartyContact(party: OaciqParty, create: boolean) {
    setContactSearch(party.fullName);
    if (create) {
      setContactDraft({ ...EMPTY_TRANSACTION_CONTACT_DRAFT, firstName: party.firstName, lastName: party.lastName, email: party.email, phone: party.phone });
      setContactError(null); setDuplicateContact(null); setIsAddingContact(true);
    }
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
    setContactClientProvenance(null);
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
        contactClientProvenance,
      );
      setValues((current) => ({ ...current, contactIds: linkTransactionContact(current.contactIds, result.contact.id) }));
      closeContactForm();
    } catch {
      setContactError("Le contact n'a pas pu être enregistré.");
    } finally {
      setIsCreatingContact(false);
    }
  }

  function preparedDraft(): TransactionDraft {
    return {
      ...values,
      address: values.address.trim(),
      centrisNumber: values.centrisNumber.trim(),
      price: price ? Number(price) : null,
      generalNotes: values.generalNotes.trim(),
      ...(mode === "create" ? { creationKey, deadlines: confirmedAgenda(proposals) ?? [] } : {}),
    };
  }

  async function saveDraft(draft: TransactionDraft) {
    if (isBusy) return;
    if (mode === "create" && !confirmedAgenda(proposals)) {
      setError("Vérifiez le titre, la date et l’heure des échéances sélectionnées, ou décochez-les.");
      return;
    }
    setError(null);
    await runSingleTransactionSave(saveLock, async () => {
      setIsSubmitting(true);
      try {
        await onSave(draft);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : mode === "create"
              ? "La transaction n’a pas pu être créée."
              : "La transaction n’a pas pu être modifiée.",
        );
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isBusy || saveLock.current) return;
    const draft = preparedDraft();
    if (mode === "create") {
      const matches = findTransactionsWithCentris(transactions, draft.centrisNumber);
      if (matches.length > 0) {
        setDuplicateMatches(matches);
        return;
      }
    }
    await saveDraft(draft);
  }

  async function createDespiteDuplicate() {
    if (isBusy || saveLock.current) return;
    setDuplicateMatches([]);
    await saveDraft(preparedDraft());
  }

  function openExisting(transactionId: string) {
    setDuplicateMatches([]);
    onOpenExisting?.(transactionId);
  }

  function formatCreatedAt(value: string) {
    return new Intl.DateTimeFormat("fr-CA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(value));
  }

  return (
    <div className="transaction-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="transaction-editor-title" aria-modal="true" className="transaction-modal transaction-create-modal" role="dialog">
        <div className="transaction-modal-heading">
          <div><p className="section-kicker">{mode === "create" ? "Nouvelle fiche" : "Informations générales"}</p><h2 id="transaction-editor-title">{mode === "create" ? "CRÉER UNE TRANSACTION" : "MODIFIER LA TRANSACTION"}</h2></div>
          <button aria-label="Fermer" onClick={onClose} type="button">×</button>
        </div>
        <form aria-busy={isBusy} className="transaction-form" onSubmit={submit}>
          {mode === "create" && <OaciqTransactionImport proposals={proposals} onChange={setProposals} disabled={isSaving || isSubmitting} onBusyChange={setIsAnalyzing} onAnalyzed={applyOaciqAnalysis} onApplyBasic={applyOaciqAnalysis} />}
          {prefillConflicts.length > 0 && <div className="transaction-centris-warning transaction-field-wide" role="status"><strong>SAISIES CONSERVÉES · VALEURS OACIQ À CONFIRMER</strong>{prefillConflicts.map((conflict) => <p key={conflict.field}>{OACIQ_PREFILL_LABELS[conflict.field]} détecté(e) : {conflict.value} <button type="button" disabled={isBusy} onClick={() => applyDetectedField(conflict)}>Appliquer {OACIQ_PREFILL_LABELS[conflict.field].toLowerCase()}</button></p>)}</div>}
          {mode === "create" && <CentrisTransactionImport
            currentValues={{ ...values, price: price ? Number(price) : null }}
            disabled={isBusy}
            protectedPrice={hasOaciqPrice}
            onApply={(nextValues, result) => {
              const next = preserveOaciqPrice(nextValues, price, hasOaciqPrice);
              setValues(next);
              setPrice(next.price === null ? "" : String(next.price));
              if (!hasOaciqPrice) setAppliedCentrisPricing(result.pricing);
            }}
          />}
          <label className="transaction-field transaction-field-wide"><span>Adresse *</span><input autoFocus={mode === "edit"} onChange={(event) => update("address", event.target.value)} required value={values.address} /></label>
          <label className="transaction-field transaction-field-wide"><span>Numéro Centris</span><input onChange={(event) => update("centrisNumber", event.target.value)} value={values.centrisNumber} /></label>
          <label className="transaction-field"><span>Type *</span><select onChange={(event) => changeType(event.target.value as TransactionType)} value={values.type}><option value="purchase">Achat</option><option value="sale">Vente</option></select></label>
          <label className="transaction-field"><span>Courtier *</span><select onChange={(event) => update("broker", event.target.value as TransactionBroker)} value={values.broker}>{CONTACT_BROKERS.map((broker) => <option key={broker} value={broker}>{BROKER_LABELS[broker]}</option>)}</select></label>
          <label className="transaction-field"><span>Prix</span><input min="0" onChange={(event) => { dirtyFields.current.add("price"); setPrice(event.target.value); }} step="0.01" type="number" value={price} />
            {appliedCentrisPricing?.mode === "monthly_rent" && <small className="transaction-centris-price-context">Valeur provenant d’une fiche de LOCATION : {new Intl.NumberFormat("fr-CA").format(appliedCentrisPricing.monthlyAmount ?? 0)} $ / mois.</small>}
            {appliedCentrisPricing?.mode === "annual_per_square_foot" && <small className="transaction-centris-price-context is-warning">Tarif détecté : {new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(appliedCentrisPricing.annualPerSquareFootAmount ?? 0)} $ / année / pi². Entrez manuellement le montant approprié.</small>}
          </label>
          <label className="transaction-field"><span>Date de la PA</span><input onChange={(event) => update("promiseDate", event.target.value || null)} type="date" value={values.promiseDate ?? ""} /></label>
          <label className="transaction-field transaction-field-wide"><span>Statut actuel</span><select onChange={(event) => update("status", event.target.value as TransactionDraft["status"])} value={values.status}>{statusesForTransaction(values.type).map((status) => <option key={status} value={status}>{TRANSACTION_STATUS_LABELS[status]}</option>)}</select></label>
          <fieldset className="transaction-contact-picker transaction-field-wide">
            <legend>Contacts liés</legend>
            {oaciqAnalysis && <div className="oaciq-party-matches">{[...oaciqAnalysis.buyers, ...oaciqAnalysis.sellers].map((party, index) => {
              const match = matchOaciqParty(party, contacts);
              const linked = match.contactId && values.contactIds.includes(match.contactId);
              return <div key={`${party.role}-${index}`}><strong>{party.role === "buyer" ? "ACHETEUR" : "VENDEUR"} {linked ? "LIÉ" : match.ambiguous ? "· LIAISON À CONFIRMER" : "NON LIÉ"}</strong><span>{party.fullName}</span>{!linked && <div><button type="button" disabled={isBusy} onClick={() => preparePartyContact(party, false)}>Rechercher / lier un contact</button><button type="button" disabled={isBusy || isCreatingContact} onClick={() => preparePartyContact(party, true)}>+ Ajouter ce contact</button></div>}</div>;
            })}</div>}
            <div className="transaction-contact-tools">
              <label className="transaction-contact-search"><span className="sr-only">Rechercher un contact</span><input onChange={(event) => setContactSearch(event.target.value)} placeholder="Nom, téléphone ou courriel…" type="search" value={contactSearch} /></label>
              <button onClick={() => { setIsAddingContact(true); setContactError(null); setDuplicateContact(null); }} type="button">+ Ajouter un nouveau contact</button>
            </div>
            {isAddingContact && <div className="transaction-new-contact">
              <div className="transaction-new-contact-heading"><div><p className="section-kicker">Contact CRM</p><h3>NOUVEAU CONTACT</h3></div><button aria-label="Annuler l’ajout du contact" onClick={closeContactForm} type="button">×</button></div>
              <div className="transaction-new-contact-fields">{(Object.keys(contactDraftLabels) as Array<keyof ContactDraft>).map((field) => <label className={field === "address" ? "transaction-contact-field-wide" : ""} key={field}><span>{contactDraftLabels[field]}</span><input onChange={(event) => { setContactDraft((current) => ({ ...current, [field]: event.target.value })); setDuplicateContact(null); }} type={field === "email" ? "email" : field === "phone" ? "tel" : field === "birthDate" || field === "mortgageRenewalDate" ? "date" : "text"} value={contactDraft[field]} /></label>)}</div>
              <label className="transaction-field transaction-field-wide"><span>Provenance du client</span><select onChange={(event) => setContactClientProvenance(event.target.value === "" ? null : event.target.value as ClientProvenance)} value={contactClientProvenance ?? ""}><option value="">Non renseignée</option>{CLIENT_PROVENANCES.map((provenance) => <option key={provenance} value={provenance}>{CLIENT_PROVENANCE_LABELS[provenance]}</option>)}</select></label>
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
          <div className="transaction-form-actions transaction-field-wide"><button onClick={onClose} type="button">Annuler</button><button className="transaction-submit" disabled={isBusy} type="submit">{isAnalyzing ? "ANALYSE EN COURS…" : isBusy ? mode === "create" ? "CRÉATION…" : "ENREGISTREMENT…" : mode === "create" ? "Créer la transaction" : "Enregistrer les modifications"}</button></div>
        </form>
        {duplicateMatches.length > 0 && <div className="transaction-existing-backdrop" role="presentation">
          <section aria-labelledby="transaction-existing-title" aria-modal="true" className="transaction-existing-dialog" role="alertdialog">
            <p className="section-kicker">Vérification du numéro Centris</p>
            <h3 id="transaction-existing-title">TRANSACTION POSSIBLE DÉJÀ EXISTANTE</h3>
            {duplicateMatches.length > 1 && <p><strong>{duplicateMatches.length} transactions utilisent déjà ce numéro Centris.</strong> La plus récente est présentée ci-dessous.</p>}
            <article>
              <strong>No Centris {duplicateMatches[0].centrisNumber}</strong>
              <h4>{duplicateMatches[0].address}</h4>
              <dl>
                <div><dt>Type</dt><dd>{TRANSACTION_TYPE_LABELS[duplicateMatches[0].type]}</dd></div>
                <div><dt>Courtier</dt><dd>{BROKER_LABELS[duplicateMatches[0].broker]}</dd></div>
                <div><dt>Statut</dt><dd>{TRANSACTION_STATUS_LABELS[duplicateMatches[0].status]}</dd></div>
                <div><dt>Créée le</dt><dd>{formatCreatedAt(duplicateMatches[0].createdAt)}</dd></div>
              </dl>
            </article>
            <div className="transaction-existing-actions">
              <button disabled={isBusy} onClick={() => setDuplicateMatches([])} type="button">ANNULER</button>
              <button disabled={isBusy} onClick={() => openExisting(duplicateMatches[0].id)} type="button">OUVRIR LA TRANSACTION EXISTANTE</button>
              <button className="transaction-submit" disabled={isBusy} onClick={() => void createDespiteDuplicate()} type="button">{isBusy ? "CRÉATION…" : "CRÉER QUAND MÊME"}</button>
            </div>
          </section>
        </div>}
      </section>
    </div>
  );
}
