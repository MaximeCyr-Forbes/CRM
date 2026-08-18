"use client";

import { useState, type FormEvent } from "react";
import {
  CONTACT_ADDRESS_LABELS,
  getContactAddressLines,
  type Contact,
  type ContactAddressInput,
} from "../data/contact-types";
import { dedupeAddresses, fallbackAddresses, normalizeAddressKey, setPrimaryAddress } from "../lib/contact-addresses";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

const blankAddress: ContactAddressInput = {
  civicNumber: "", address: "", apartment: "", city: "", province: "", postalCode: "", country: "",
  isPrimary: false, label: "Autre",
};

export function ContactAddressManager({ contact, isSaving, onCancel, onSave }: {
  contact: Contact;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (addresses: ContactAddressInput[]) => void | Promise<void>;
}) {
  const [addresses, setAddresses] = useState<ContactAddressInput[]>(() => fallbackAddresses(contact));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<ContactAddressInput>(blankAddress);
  useDialogLifecycle(true, onCancel);

  function edit(index: number) {
    setEditingIndex(index);
    setDraft(addresses[index]);
  }

  function saveDraft(event: FormEvent) {
    event.preventDefault();
    const next = editingIndex === null ? [...addresses, draft] : addresses.map((item, index) => index === editingIndex ? draft : item);
    const primaryKey = draft.isPrimary ? normalizeAddressKey(draft) : normalizeAddressKey(next.find((item) => item.isPrimary) ?? next[0]);
    setAddresses(setPrimaryAddress(next, primaryKey));
    setEditingIndex(null);
    setDraft(blankAddress);
  }

  return (
    <div className="contact-modal-backdrop contact-modal-top" role="presentation">
      <section aria-modal="true" className="contact-modal address-manager-modal" role="dialog">
        <header className="contact-modal-header"><div><p className="section-kicker">HISTORIQUE RÉSIDENTIEL</p><h2>Adresses de {contact.firstName || "ce contact"}</h2></div><button aria-label="Fermer" onClick={onCancel} type="button">×</button></header>
        <div className="address-manager-list">
          {addresses.map((address, index) => <article key={`${normalizeAddressKey(address)}:${index}`}>
            <div><strong>{address.isPrimary ? "PRINCIPALE" : address.label.toLocaleUpperCase("fr-CA")}</strong>{getContactAddressLines(address).map((line) => <span key={line}>{line}</span>)}</div>
            <div><button onClick={() => edit(index)} type="button">MODIFIER</button>{!address.isPrimary && <button onClick={() => setAddresses(setPrimaryAddress(addresses, normalizeAddressKey(address)))} type="button">DÉFINIR PRINCIPALE</button>}<button onClick={() => setAddresses(setPrimaryAddress(addresses.filter((_, itemIndex) => itemIndex !== index), normalizeAddressKey(addresses.find((item, itemIndex) => itemIndex !== index && item.isPrimary) ?? addresses.find((_, itemIndex) => itemIndex !== index) ?? blankAddress)))} type="button">SUPPRIMER</button></div>
          </article>)}
          {addresses.length === 0 && <p>Aucune adresse enregistrée.</p>}
        </div>
        <form className="address-manager-form" onSubmit={saveDraft}>
          <h3>{editingIndex === null ? "AJOUTER UNE ADRESSE" : "MODIFIER L’ADRESSE"}</h3>
          <div className="address-form-grid">
            <label><span>Numéro civique</span><input onChange={(e) => setDraft({ ...draft, civicNumber: e.target.value })} value={draft.civicNumber} /></label>
            <label className="address-street"><span>Rue</span><input onChange={(e) => setDraft({ ...draft, address: e.target.value })} required value={draft.address} /></label>
            <label><span>Appartement</span><input onChange={(e) => setDraft({ ...draft, apartment: e.target.value })} value={draft.apartment} /></label>
            <label><span>Ville</span><input onChange={(e) => setDraft({ ...draft, city: e.target.value })} value={draft.city} /></label>
            <label><span>Province</span><input onChange={(e) => setDraft({ ...draft, province: e.target.value })} value={draft.province} /></label>
            <label><span>Code postal</span><input onChange={(e) => setDraft({ ...draft, postalCode: e.target.value })} value={draft.postalCode} /></label>
            <label><span>Pays</span><input onChange={(e) => setDraft({ ...draft, country: e.target.value })} value={draft.country} /></label>
            <label><span>Libellé</span><select onChange={(e) => setDraft({ ...draft, label: e.target.value as ContactAddressInput["label"] })} value={draft.label}>{CONTACT_ADDRESS_LABELS.filter((label) => label !== "Principale").map((label) => <option key={label}>{label}</option>)}</select></label>
          </div>
          <label className="address-primary-check"><input checked={draft.isPrimary} onChange={(e) => setDraft({ ...draft, isPrimary: e.target.checked, label: e.target.checked ? "Principale" : draft.label === "Principale" ? "Ancienne adresse" : draft.label })} type="checkbox" /> Définir comme adresse principale</label>
          <div className="address-manager-form-actions"><button onClick={() => { setEditingIndex(null); setDraft(blankAddress); }} type="button">ANNULER LA SAISIE</button><button type="submit">{editingIndex === null ? "AJOUTER" : "APPLIQUER"}</button></div>
        </form>
        <footer className="address-manager-footer"><button onClick={onCancel} type="button">ANNULER</button><button disabled={isSaving} onClick={() => void onSave(dedupeAddresses(addresses))} type="button">{isSaving ? "ENREGISTREMENT…" : "ENREGISTRER LES ADRESSES"}</button></footer>
      </section>
    </div>
  );
}
