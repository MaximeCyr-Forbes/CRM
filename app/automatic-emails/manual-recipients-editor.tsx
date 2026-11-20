"use client";

import { useState } from "react";
import { BROKER_LABELS, CONTACT_BROKERS } from "../data/contact-types";
import type { CustomEmailCampaignContact, CustomEmailCampaignDraft, CustomEmailCampaignStepDraft } from "../data/custom-email-campaign-types";
import { effectiveCampaignRecipients, normalizedCampaignEmail, parseCampaignEmails, validCampaignEmail, type CampaignManualRecipient } from "../lib/automatic-emails/manual-recipients";
import { renderEmailRecipient } from "../lib/email/template";
import "./manual-recipients.css";

export default function ManualRecipientsEditor({ recipients, contacts, campaign, steps, disabled, onChange }: {
  recipients: CampaignManualRecipient[]; contacts: CustomEmailCampaignContact[]; campaign: CustomEmailCampaignDraft;
  steps: CustomEmailCampaignStepDraft[]; disabled: boolean; onChange: (value: CampaignManualRecipient[]) => void;
}) {
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const contactEmails = new Set(contacts.map(c => normalizedCampaignEmail(c.email)));
  const effective = effectiveCampaignRecipients(contacts, recipients);
  const blocked = effective.filter(r => {
    const broker = campaign.senderStrategy === "fixed_broker" ? campaign.fixedBroker : r.broker === "unassigned" ? campaign.fallbackBroker : r.broker;
    return !broker || !steps.length || steps.some(s => renderEmailRecipient(s.subjectTemplate, s.bodyTemplate, r).blockingReasons.length);
  }).length;
  function add() {
    const parsed = parseCampaignEmails(text, recipients.map(r => r.email));
    onChange([...recipients, ...parsed.accepted.map(email => ({ id: crypto.randomUUID(), email, firstName: "", lastName: "", broker: null }))]);
    setText(parsed.invalid.join("\n"));
    setNotice(`${parsed.accepted.length} adresse(s) ajoutée(s). ${parsed.duplicates} doublon(s) ignoré(s). ${parsed.invalid.length} adresse(s) invalide(s) à corriger.`);
  }
  function update(id: string, changes: Partial<CampaignManualRecipient>) {
    onChange(recipients.map(r => r.id === id ? { ...r, ...changes } : r));
  }
  return <section className="manual-campaign-recipients" aria-labelledby="manual-recipients-title">
    <h3 id="manual-recipients-title">ADRESSES COURRIEL MANUELLES</h3>
    <p>Ces adresses restent dans la campagne et ne créent aucun Contact CRM.</p>
    <label>Ajouter une ou plusieurs adresses courriel<textarea rows={3} value={text} disabled={disabled} onChange={e => setText(e.target.value)} placeholder="Virgules, points-virgules ou retours à la ligne" /></label>
    <button type="button" disabled={disabled || !text.trim()} onClick={add}>+ AJOUTER LES ADRESSES</button>
    {notice && <p role="status">{notice}</p>}
    {recipients.map(r => {
      const duplicate = recipients.some(other => other.id !== r.id && normalizedCampaignEmail(other.email) === normalizedCampaignEmail(r.email));
      return <fieldset key={r.id} disabled={disabled}>
        <legend>Adresse manuelle</legend>
        <label>Courriel<input aria-label={`Courriel ${r.email}`} maxLength={320} value={r.email} onChange={e => update(r.id, { email: e.target.value })} /></label>
        <label>Prénom (facultatif)<input maxLength={120} value={r.firstName} onChange={e => update(r.id, { firstName: e.target.value })} /></label>
        <label>Nom (facultatif)<input maxLength={120} value={r.lastName} onChange={e => update(r.id, { lastName: e.target.value })} /></label>
        {campaign.senderStrategy === "assigned_broker" && <label>Expéditeur<select value={r.broker ?? ""} onChange={e => update(r.id, { broker: e.target.value as CampaignManualRecipient["broker"] || null })}><option value="">Courtier de secours</option>{CONTACT_BROKERS.map(b => <option key={b} value={b}>{BROKER_LABELS[b]}</option>)}</select></label>}
        <button type="button" onClick={() => onChange(recipients.filter(other => other.id !== r.id))}>RETIRER</button>
        <small className="manual-recipient-validation">{!validCampaignEmail(r.email) ? "Adresse invalide à corriger." : duplicate ? "Doublon manuel à corriger avant d’enregistrer." : contactEmails.has(normalizedCampaignEmail(r.email)) ? "Cette adresse figure déjà parmi les Contacts sélectionnés. Un seul destinataire effectif : le Contact CRM." : "Adresse valide."}</small>
      </fieldset>;
    })}
    <p>Contacts sélectionnés : {contacts.length} · Adresses manuelles : {recipients.length} · Destinataires uniques : {effective.length}</p>
    <p>Prêts : {effective.length - blocked} · Bloqués : {blocked} — sous réserve de la connexion et de la signature Gmail vérifiées dans l’aperçu.</p>
    <small>L’ajout d’une adresse ne confirme pas son consentement. Vérifiez les autorisations et oppositions avant tout futur envoi.</small>
  </section>;
}
