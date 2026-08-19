"use client";

import { useState, type FormEvent } from "react";
import {
  LISTING_OFFER_STATUSES,
  LISTING_OFFER_STATUS_LABELS,
  type ListingOffer,
  type ListingOfferDraft,
  type ListingPurpose,
} from "../data/listing-types";
import { toLocalISODate } from "../lib/follow-up";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

export function ListingOfferModal({ purpose, offer, isSaving, onClose, onSave }: {
  purpose: ListingPurpose;
  offer: ListingOffer | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (draft: ListingOfferDraft) => Promise<void>;
}) {
  const [values, setValues] = useState<ListingOfferDraft>(() => offer ? {
    offerDate: offer.offerDate, amount: offer.amount, status: offer.status,
    buyerNames: offer.buyerNames, collaboratingBrokerName: offer.collaboratingBrokerName,
    collaboratingBrokerAgency: offer.collaboratingBrokerAgency, notes: offer.notes,
  } : {
    offerDate: toLocalISODate(new Date()), amount: 0, status: "received", buyerNames: "",
    collaboratingBrokerName: "", collaboratingBrokerAgency: "", notes: "",
  });
  const [amount, setAmount] = useState(offer ? String(offer.amount) : "");
  const [error, setError] = useState<string | null>(null);
  useDialogLifecycle(true, onClose);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsedAmount = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (!values.offerDate || !Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError("Ajoutez une date et un montant valides."); return;
    }
    try { await onSave({ ...values, amount: parsedAmount }); }
    catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "L’offre n’a pas pu être enregistrée."); }
  }

  const update = <K extends keyof ListingOfferDraft>(key: K, value: ListingOfferDraft[K]) => setValues((current) => ({ ...current, [key]: value }));
  return <div className="listing-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation"><section aria-labelledby="listing-offer-modal-title" aria-modal="true" className="listing-editor-modal listing-offer-modal" role="dialog"><header className="listing-editor-heading"><div><p className="section-kicker">{purpose === "sale" ? "Promesse d’achat" : "Offre de location"}</p><h2 id="listing-offer-modal-title">{offer ? "MODIFIER L’OFFRE" : "AJOUTER UNE OFFRE"}</h2></div><button aria-label="Fermer" onClick={onClose} type="button">×</button></header><form className="listing-offer-form" onSubmit={submit}>
    <label><span>Date de l’offre *</span><input onChange={(event) => update("offerDate", event.target.value)} type="date" value={values.offerDate} /></label>
    <label><span>{purpose === "sale" ? "Prix offert *" : "Loyer mensuel offert *"}</span><input inputMode="decimal" min="0" onChange={(event) => setAmount(event.target.value)} placeholder="0" type="number" value={amount} /></label>
    <label className="listing-offer-field-wide"><span>{purpose === "sale" ? "Acheteurs" : "Locataires"}</span><input onChange={(event) => update("buyerNames", event.target.value)} value={values.buyerNames} /></label>
    <label><span>Courtier collaborateur</span><input onChange={(event) => update("collaboratingBrokerName", event.target.value)} value={values.collaboratingBrokerName} /></label>
    <label><span>Agence</span><input onChange={(event) => update("collaboratingBrokerAgency", event.target.value)} value={values.collaboratingBrokerAgency} /></label>
    <label className="listing-offer-field-wide"><span>Statut</span><select onChange={(event) => update("status", event.target.value as ListingOfferDraft["status"])} value={values.status}>{LISTING_OFFER_STATUSES.map((status) => <option key={status} value={status}>{LISTING_OFFER_STATUS_LABELS[status]}</option>)}</select></label>
    <label className="listing-offer-field-wide"><span>Notes</span><textarea onChange={(event) => update("notes", event.target.value)} rows={4} value={values.notes} /></label>
    {error && <p className="listing-editor-error listing-offer-field-wide" role="alert">{error}</p>}
    <footer className="listing-editor-actions listing-offer-field-wide"><button onClick={onClose} type="button">Annuler</button><button className="listing-editor-submit" disabled={isSaving} type="submit">{isSaving ? "Enregistrement…" : "Enregistrer"}</button></footer>
  </form></section></div>;
}
