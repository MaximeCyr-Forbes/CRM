"use client";

import { useState, type FormEvent } from "react";
import {
  BROKER_LABELS,
  CONTACT_ASSIGNMENTS,
  type Contact,
  type ContactUpdate,
} from "../data/contact-types";
import { hasMinimumContactIdentity } from "../lib/contact-normalization";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

export function ContactEditorModal({
  contact,
  isSaving,
  onCancel,
  onSave,
}: {
  contact: Contact;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (values: ContactUpdate) => Promise<void>;
}) {
  const [values, setValues] = useState<ContactUpdate>({
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
    email: contact.email,
    address: contact.address,
    apartment: contact.apartment,
    city: contact.city,
    province: contact.province,
    postalCode: contact.postalCode,
    country: contact.country,
    broker: contact.broker,
    clientType: contact.clientType,
    priority: contact.priority,
    status: contact.status,
  });
  const [error, setError] = useState<string | null>(null);
  useDialogLifecycle(true, onCancel);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasMinimumContactIdentity(values)) {
      setError("Le contact doit conserver au minimum un nom, un téléphone ou un email.");
      return;
    }
    setError(null);
    await onSave(values);
  }

  return (
    <div className="contact-modal-backdrop contact-modal-top" onMouseDown={(event) => event.target === event.currentTarget && onCancel()} role="presentation">
      <section aria-modal="true" className="contact-modal contact-editor-modal" role="dialog">
        <header className="contact-modal-header">
          <div><p className="section-kicker">FICHE CLIENT</p><h2>MODIFIER LE CONTACT</h2></div>
          <button aria-label="Fermer" onClick={onCancel} type="button">×</button>
        </header>
        <form className="contact-editor-form" onSubmit={submit}>
          <label><span>Prénom</span><input onChange={(event) => setValues((current) => ({ ...current, firstName: event.target.value }))} value={values.firstName} /></label>
          <label><span>Nom</span><input onChange={(event) => setValues((current) => ({ ...current, lastName: event.target.value }))} value={values.lastName} /></label>
          <label><span>Téléphone</span><input onChange={(event) => setValues((current) => ({ ...current, phone: event.target.value }))} type="tel" value={values.phone} /></label>
          <label><span>Email</span><input onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} type="email" value={values.email} /></label>
          <label className="contact-editor-field-wide"><span>Adresse</span><input onChange={(event) => setValues((current) => ({ ...current, address: event.target.value }))} value={values.address} /></label>
          <label><span>Appartement / unité</span><input onChange={(event) => setValues((current) => ({ ...current, apartment: event.target.value }))} value={values.apartment} /></label>
          <label><span>Ville</span><input onChange={(event) => setValues((current) => ({ ...current, city: event.target.value }))} value={values.city} /></label>
          <label><span>Province</span><input onChange={(event) => setValues((current) => ({ ...current, province: event.target.value }))} value={values.province} /></label>
          <label><span>Code postal</span><input onChange={(event) => setValues((current) => ({ ...current, postalCode: event.target.value }))} value={values.postalCode} /></label>
          <label><span>Pays</span><input onChange={(event) => setValues((current) => ({ ...current, country: event.target.value }))} value={values.country} /></label>
          <label><span>Type de client</span><select onChange={(event) => setValues((current) => ({ ...current, clientType: event.target.value === "" ? null : event.target.value as ContactUpdate["clientType"] }))} value={values.clientType ?? ""}><option value="">Non renseigné</option><option value="buyer">Acheteur</option><option value="seller">Vendeur</option><option value="buyer_seller">Acheteur + vendeur</option></select></label>
          <label><span>Priorité</span><select onChange={(event) => setValues((current) => ({ ...current, priority: event.target.value === "" ? null : event.target.value as ContactUpdate["priority"] }))} value={values.priority ?? ""}><option value="">Non renseignée</option><option value="hot">Chaud</option><option value="warm">Tiède</option><option value="cold">Froid</option></select></label>
          <label><span>Statut</span><select onChange={(event) => setValues((current) => ({ ...current, status: event.target.value as ContactUpdate["status"] }))} value={values.status}><option value="active">Actif</option><option value="inactive">Inactif</option></select></label>
          <label><span>Courtier responsable</span><select onChange={(event) => setValues((current) => ({ ...current, broker: event.target.value as ContactUpdate["broker"] }))} value={values.broker}>{CONTACT_ASSIGNMENTS.map((broker) => <option key={broker} value={broker}>{BROKER_LABELS[broker]}</option>)}</select></label>
          {error && <p className="import-error">{error}</p>}
          <div className="contact-editor-actions"><button onClick={onCancel} type="button">ANNULER</button><button disabled={isSaving} type="submit">{isSaving ? "ENREGISTREMENT…" : "ENREGISTRER"}</button></div>
        </form>
      </section>
    </div>
  );
}
