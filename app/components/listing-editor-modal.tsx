"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { CentrisListingImport } from "./centris-listing-import";
import { useContacts } from "../contacts-context";
import {
  BROKER_LABELS,
  CLIENT_PROVENANCES,
  CLIENT_PROVENANCE_LABELS,
  getContactName,
  type Contact,
  type ContactDraft,
  type ClientProvenance,
} from "../data/contact-types";
import {
  LISTING_BROKERS,
  LISTING_PROPERTY_TYPE_LABELS,
  LISTING_PROPERTY_TYPES,
  LISTING_PURPOSE_LABELS,
  LISTING_PURPOSES,
  LISTING_STATUS_LABELS,
  type Listing,
  type ListingDraft,
  type ListingPurpose,
} from "../data/listing-types";
import { hasMinimumContactIdentity } from "../lib/contact-normalization";
import {
  acquireListingSubmissionLock,
  findListingWithCentrisNumber,
  prepareListingDraft,
  releaseListingSubmissionLock,
  statusesForListingEditor,
  toggleListingOwner,
  validStatusForListingPurpose,
} from "../lib/listings/editor";
import { listingAddressLines } from "../lib/listings/presentation";
import type { CentrisParseResult } from "../lib/centris-pdf/types";
import type { CentrisListingImportSelection } from "../lib/centris-pdf/listing-form-import";
import {
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

function emptyOwnerDraft(): ContactDraft {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    birthDate: "",
    mortgageRenewalDate: "",
    civicNumber: "",
    address: "",
    apartment: "",
    city: "",
    province: "QC",
    postalCode: "",
    country: "Canada",
  };
}

export function ListingEditorModal({
  initial,
  isSaving,
  listings = [],
  mode,
  onClose,
  onOpenExisting,
  onSave,
}: {
  initial: ListingDraft;
  isSaving: boolean;
  listings?: ReadonlyArray<Listing>;
  mode: "create" | "edit";
  onClose: () => void;
  onOpenExisting?: (listingId: string) => void;
  onSave: (draft: ListingDraft) => Promise<void>;
}) {
  const { contacts, addManualContact } = useContacts();
  const [values, setValues] = useState<ListingDraft>({ ...initial, ownerContactIds: [...initial.ownerContactIds] });
  const [askingPrice, setAskingPrice] = useState(initial.askingPrice === null ? "" : String(initial.askingPrice));
  const [monthlyRent, setMonthlyRent] = useState(initial.monthlyRent === null ? "" : String(initial.monthlyRent));
  const [contactSearch, setContactSearch] = useState("");
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState<ContactDraft>(emptyOwnerDraft);
  const [contactClientProvenance, setContactClientProvenance] = useState<ClientProvenance>(null);
  const [duplicateContact, setDuplicateContact] = useState<Contact | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateListing, setDuplicateListing] = useState<Listing | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [appliedCentrisPricing, setAppliedCentrisPricing] = useState<CentrisParseResult["pricing"] | null>(null);
  const submittingRef = useRef(false);
  useDialogLifecycle(true, onClose);

  const selectedOwners = useMemo(
    () => values.ownerContactIds
      .map((contactId) => contacts.find((contact) => contact.id === contactId))
      .filter((contact): contact is Contact => Boolean(contact)),
    [contacts, values.ownerContactIds],
  );
  const matchingContacts = useMemo(
    () => contactSearch.trim() ? filterTransactionContacts(contacts, contactSearch) : [],
    [contactSearch, contacts],
  );
  const visibleContacts = matchingContacts.slice(0, 50);

  function update<K extends keyof ListingDraft>(field: K, value: ListingDraft[K]) {
    if (field === "centrisNumber") setDuplicateListing(null);
    setValues((current) => ({ ...current, [field]: value }));
  }

  function changePurpose(purpose: ListingPurpose) {
    setValues((current) => ({
      ...current,
      purpose,
      status: validStatusForListingPurpose(purpose, current.status),
    }));
  }

  function toggleOwner(contactId: string) {
    setValues((current) => ({
      ...current,
      ownerContactIds: toggleListingOwner(current.ownerContactIds, contactId),
    }));
  }

  function closeContactForm() {
    setIsAddingContact(false);
    setContactDraft(emptyOwnerDraft());
    setContactClientProvenance(null);
    setDuplicateContact(null);
    setContactError(null);
  }

  function useExistingContact(contact: Contact) {
    setValues((current) => ({
      ...current,
      ownerContactIds: linkTransactionContact(current.ownerContactIds, contact.id),
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
        values.ownerContactIds,
        addManualContact,
        contactClientProvenance,
      );
      setValues((current) => ({
        ...current,
        ownerContactIds: linkTransactionContact(current.ownerContactIds, result.contact.id),
      }));
      closeContactForm();
    } catch {
      setContactError("Le contact n’a pas pu être enregistré.");
    } finally {
      setIsCreatingContact(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || isSaving) return;
    setError(null);
    const prepared = prepareListingDraft(values, askingPrice, monthlyRent);
    if (!prepared.draft) {
      setError(prepared.error);
      return;
    }
    if (mode === "create") {
      const duplicate = findListingWithCentrisNumber(listings, prepared.draft.centrisNumber);
      if (duplicate) {
        setDuplicateListing(duplicate);
        return;
      }
    }
    if (!acquireListingSubmissionLock(submittingRef)) return;
    setIsSubmitting(true);
    try {
      await onSave(prepared.draft);
    } catch (caughtError) {
      setError(caughtError instanceof Error
        ? caughtError.message
        : mode === "create" ? "Création du Listing impossible." : "Modification du Listing impossible.");
    } finally {
      releaseListingSubmissionLock(submittingRef);
      setIsSubmitting(false);
    }
  }

  function applyCentrisValues(
    nextValues: ListingDraft,
    result: CentrisParseResult,
    selection: CentrisListingImportSelection,
  ) {
    setValues(nextValues);
    setAskingPrice(nextValues.askingPrice === null ? "" : String(nextValues.askingPrice));
    setMonthlyRent(nextValues.monthlyRent === null ? "" : String(nextValues.monthlyRent));
    setAppliedCentrisPricing(selection.price || result.pricing.mode === "annual_per_square_foot" ? result.pricing : null);
    setDuplicateListing(null);
  }

  return (
    <div className="listing-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="listing-editor-title" aria-modal="true" className="listing-editor-modal" role="dialog">
        <header className="listing-editor-heading">
          <div><p className="section-kicker">{mode === "create" ? "Inventaire de l’équipe" : "Mise à jour rapide"}</p><h2 id="listing-editor-title">{mode === "create" ? "CRÉER UN LISTING" : "MODIFIER LE LISTING"}</h2></div>
          <button aria-label="Fermer" onClick={onClose} type="button">×</button>
        </header>

        <form className="listing-editor-form" noValidate onSubmit={submit}>
          {mode === "create" && <CentrisListingImport
            currentValues={values}
            disabled={isSaving || isSubmitting}
            onApply={applyCentrisValues}
          />}

          <fieldset className="listing-editor-section listing-editor-purpose">
            <legend><span>01</span> Type de mandat</legend>
            <div className="listing-purpose-options">
              {LISTING_PURPOSES.map((purpose) => (
                <button autoFocus={values.purpose === purpose} aria-pressed={values.purpose === purpose} key={purpose} onClick={() => changePurpose(purpose)} type="button">
                  {LISTING_PURPOSE_LABELS[purpose]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="listing-editor-section">
            <legend><span>02</span> Propriété</legend>
            <div className="listing-editor-fields">
              <label><span>Numéro civique</span><input onChange={(event) => update("civicNumber", event.target.value)} value={values.civicNumber} /></label>
              <label className="listing-field-wide"><span>Rue / Adresse *</span><input onChange={(event) => update("address", event.target.value)} required value={values.address} /></label>
              <label><span>Appartement</span><input onChange={(event) => update("apartment", event.target.value)} value={values.apartment} /></label>
              <label><span>Ville</span><input onChange={(event) => update("city", event.target.value)} value={values.city} /></label>
              <label><span>Province</span><input onChange={(event) => update("province", event.target.value)} value={values.province} /></label>
              <label><span>Code postal</span><input onChange={(event) => update("postalCode", event.target.value)} value={values.postalCode} /></label>
              <label><span>Pays</span><input onChange={(event) => update("country", event.target.value)} value={values.country} /></label>
              <label className="listing-field-wide"><span>Type de propriété</span><select onChange={(event) => update("propertyType", event.target.value as ListingDraft["propertyType"])} value={values.propertyType}>{LISTING_PROPERTY_TYPES.map((propertyType) => <option key={propertyType} value={propertyType}>{LISTING_PROPERTY_TYPE_LABELS[propertyType]}</option>)}</select></label>
            </div>
          </fieldset>

          <fieldset className="listing-editor-section">
            <legend><span>03</span> Mise en marché</legend>
            <div className="listing-editor-fields">
              <label><span>Numéro Centris</span><input onChange={(event) => update("centrisNumber", event.target.value)} value={values.centrisNumber} /></label>
              <label><span>Courtier responsable *</span><select onChange={(event) => update("broker", event.target.value as ListingDraft["broker"])} required value={values.broker}>{LISTING_BROKERS.map((broker) => <option key={broker} value={broker}>{BROKER_LABELS[broker]}</option>)}</select></label>
              <label><span>Statut</span><select onChange={(event) => update("status", event.target.value as ListingDraft["status"])} value={values.status}>{statusesForListingEditor(values.purpose, mode, initial.status).map((status) => <option key={status} value={status}>{LISTING_STATUS_LABELS[status]}</option>)}</select>{mode === "edit" && values.purpose === "sale" && initial.status !== "sold" && <small>Utilisez le bouton VENDU sur la fiche pour finaliser une vente.</small>}</label>
              {values.purpose === "sale" ? (
                <label><span>Prix demandé</span><span className="listing-money-field"><input min="0" onChange={(event) => setAskingPrice(event.target.value)} step="0.01" type="number" value={askingPrice} /><strong>$</strong></span>{appliedCentrisPricing?.mode === "sale_price" && <small className="transaction-centris-price-context">Prix provenant de la fiche Centris : {new Intl.NumberFormat("fr-CA").format(appliedCentrisPricing.amount ?? 0)} $.</small>}</label>
              ) : (
                <label><span>Loyer mensuel</span><span className="listing-money-field"><input min="0" onChange={(event) => setMonthlyRent(event.target.value)} step="0.01" type="number" value={monthlyRent} /><strong>$ / mois</strong></span>{appliedCentrisPricing?.mode === "monthly_rent" && <small className="transaction-centris-price-context">Loyer provenant de la fiche Centris : {new Intl.NumberFormat("fr-CA").format(appliedCentrisPricing.monthlyAmount ?? 0)} $ / mois.</small>}{appliedCentrisPricing?.mode === "annual_per_square_foot" && <small className="transaction-centris-price-context is-warning">Tarif détecté : {new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(appliedCentrisPricing.annualPerSquareFootAmount ?? 0)} $ / année / pi². Montant mensuel à confirmer manuellement.</small>}</label>
              )}
              <label><span>Date de mise en marché</span><input onChange={(event) => update("listingDate", event.target.value || null)} type="date" value={values.listingDate ?? ""} /></label>
              <label><span>Date d’expiration</span><input onChange={(event) => update("expirationDate", event.target.value || null)} type="date" value={values.expirationDate ?? ""} /></label>
            </div>
          </fieldset>

          <fieldset className="listing-editor-section listing-owner-picker">
            <legend><span>04</span> Propriétaires</legend>
            <div className="listing-selected-owners">
              <p>Propriétaires sélectionnés</p>
              {selectedOwners.length > 0 ? <div>{selectedOwners.map((contact) => <button aria-label={`Retirer ${getContactName(contact)}`} key={contact.id} onClick={() => toggleOwner(contact.id)} type="button"><span>{getContactName(contact)}</span><span aria-hidden="true">×</span></button>)}</div> : <span>Aucun propriétaire sélectionné.</span>}
            </div>
            <div className="listing-contact-tools">
              <label><span>Rechercher un contact</span><input onChange={(event) => setContactSearch(event.target.value)} placeholder="Nom, téléphone ou courriel" type="search" value={contactSearch} /></label>
              <button onClick={() => { setIsAddingContact(true); setContactError(null); setDuplicateContact(null); }} type="button">+ Ajouter un nouveau contact</button>
            </div>

            {isAddingContact && (
              <div className="listing-new-contact">
                <div className="listing-new-contact-heading"><div><p className="section-kicker">Contact CRM permanent</p><h3>NOUVEAU PROPRIÉTAIRE</h3></div><button aria-label="Annuler l’ajout du contact" onClick={closeContactForm} type="button">×</button></div>
                <div className="listing-new-contact-fields">
                  {(Object.keys(contactDraftLabels) as Array<keyof ContactDraft>).map((field) => (
                    <label className={field === "address" ? "listing-contact-field-wide" : ""} key={field}><span>{contactDraftLabels[field]}</span><input onChange={(event) => { setContactDraft((current) => ({ ...current, [field]: event.target.value })); setDuplicateContact(null); }} type={field === "email" ? "email" : field === "phone" ? "tel" : field === "birthDate" || field === "mortgageRenewalDate" ? "date" : "text"} value={contactDraft[field]} /></label>
                  ))}
                  <label><span>Provenance du client</span><select onChange={(event) => setContactClientProvenance(event.target.value === "" ? null : event.target.value as ClientProvenance)} value={contactClientProvenance ?? ""}><option value="">Non renseignée</option>{CLIENT_PROVENANCES.map((provenance) => <option key={provenance} value={provenance}>{CLIENT_PROVENANCE_LABELS[provenance]}</option>)}</select></label>
                </div>
                {duplicateContact && <div className="listing-contact-duplicate" role="alert"><strong>CONTACT POSSIBLE DÉJÀ EXISTANT</strong><p>{getContactName(duplicateContact)}</p><small>{[duplicateContact.phone, duplicateContact.email].filter(Boolean).join(" · ")}</small><div><button onClick={() => useExistingContact(duplicateContact)} type="button">Utiliser ce contact</button><button disabled={isCreatingContact} onClick={() => void saveAndLinkContact(true)} type="button">Créer quand même</button></div></div>}
                {contactError && <p className="listing-editor-error" role="alert">{contactError}</p>}
                <div className="listing-new-contact-actions"><button onClick={closeContactForm} type="button">Annuler</button><button className="listing-submit" disabled={isCreatingContact} onClick={() => void saveAndLinkContact()} type="button">{isCreatingContact ? "Enregistrement…" : "Enregistrer et lier"}</button></div>
              </div>
            )}

            {contactSearch.trim() ? (
              <div className="listing-contact-results">
                {visibleContacts.map((contact) => <label key={contact.id}><input checked={values.ownerContactIds.includes(contact.id)} onChange={() => toggleOwner(contact.id)} type="checkbox" /><span><strong>{getContactName(contact)}</strong><small>{contact.phone || contact.email || "Coordonnées non renseignées"}</small></span><small>{BROKER_LABELS[contact.broker]}</small></label>)}
                {matchingContacts.length === 0 && <p>Aucun contact ne correspond à cette recherche.</p>}
                {matchingContacts.length > visibleContacts.length && <p>50 résultats affichés sur {matchingContacts.length}. Précisez votre recherche.</p>}
              </div>
            ) : <p className="listing-contact-prompt">Saisissez un nom, un téléphone, un courriel ou une adresse pour rechercher parmi les Contacts.</p>}
          </fieldset>

          <fieldset className="listing-editor-section">
            <legend><span>05</span> Liens et notes</legend>
            <div className="listing-editor-fields">
              <label><span>Lien Centris</span><input onChange={(event) => update("centrisUrl", event.target.value)} placeholder="https://www.centris.ca/…" type="url" value={values.centrisUrl} /></label>
              <label><span>Lien public</span><input onChange={(event) => update("publicUrl", event.target.value)} type="url" value={values.publicUrl} /></label>
              <label className="listing-field-wide"><span>URL de l’image principale</span><input onChange={(event) => { update("primaryImageUrl", event.target.value); setImageFailed(false); }} type="url" value={values.primaryImageUrl} /></label>
              {values.primaryImageUrl && !imageFailed && <div className="listing-image-preview listing-field-wide"><img alt="Aperçu de l’image principale" onError={() => setImageFailed(true)} src={values.primaryImageUrl} /></div>}
              <label className="listing-field-wide"><span>Notes internes</span><textarea onChange={(event) => update("generalNotes", event.target.value)} rows={5} value={values.generalNotes} /></label>
            </div>
          </fieldset>

          {duplicateListing && (
            <div className="listing-duplicate-warning" role="alert">
              <strong>LISTING DÉJÀ EXISTANT</strong>
              <p>No Centris {duplicateListing.centrisNumber}</p>
              <dl>
                <div><dt>Adresse</dt><dd>{listingAddressLines(duplicateListing).filter(Boolean).join(" · ")}</dd></div>
                <div><dt>Courtier</dt><dd>{BROKER_LABELS[duplicateListing.broker]}</dd></div>
                <div><dt>Statut</dt><dd>{LISTING_STATUS_LABELS[duplicateListing.status]}</dd></div>
              </dl>
              <div>
                <button onClick={() => setDuplicateListing(null)} type="button">Annuler</button>
                <button className="listing-submit" onClick={() => onOpenExisting?.(duplicateListing.id)} type="button">Ouvrir le Listing existant</button>
              </div>
            </div>
          )}
          {error && <p className="listing-editor-error" role="alert">{error}</p>}
          <footer className="listing-editor-actions"><button onClick={onClose} type="button">Annuler</button><button aria-busy={isSaving || isSubmitting} className="listing-submit" disabled={isSaving || isSubmitting} type="submit">{isSaving || isSubmitting ? mode === "create" ? "Création…" : "Enregistrement…" : mode === "create" ? "Créer le Listing" : "Enregistrer les modifications"}</button></footer>
        </form>
      </section>
    </div>
  );
}
