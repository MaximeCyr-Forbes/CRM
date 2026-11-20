"use client";

import { useMemo, useState } from "react";
import { BROKER_LABELS, CONTACT_BROKERS } from "../data/contact-types";
import type { CustomEmailCampaignContact, CustomEmailCampaignDraft, CustomEmailCampaignStepDraft } from "../data/custom-email-campaign-types";
import { effectiveCampaignRecipients, normalizedCampaignEmail, reconcileManualRecipientText, validCampaignEmail, type CampaignManualRecipient } from "../lib/automatic-emails/manual-recipients";
import { renderEmailRecipient } from "../lib/email/template";
import "./manual-recipients.css";

export default function ManualRecipientsEditor({ text, onTextChange, recipients, contacts, campaign, steps, disabled, onChange }: {
  text: string; onTextChange: (value: string) => void;
  recipients: CampaignManualRecipient[]; contacts: CustomEmailCampaignContact[]; campaign: CustomEmailCampaignDraft;
  steps: CustomEmailCampaignStepDraft[]; disabled: boolean; onChange: (value: CampaignManualRecipient[], text: string) => void;
}) {
  const [notice, setNotice] = useState("");
  const [selectedEmail, setSelectedEmail] = useState("");
  const pending = useMemo(() => reconcileManualRecipientText(text, recipients, () => crypto.randomUUID()), [text, recipients]);
  const selected = pending.recipients.find(r => r.email === selectedEmail) ?? pending.recipients[0];
  const contactEmails = new Set(contacts.map(c => normalizedCampaignEmail(c.email)));
  const contactDuplicates = pending.recipients.filter(r => contactEmails.has(normalizedCampaignEmail(r.email))).length;
  const effective = effectiveCampaignRecipients(contacts, pending.recipients);
  const blocked = effective.filter(r => {
    const broker = campaign.senderStrategy === "fixed_broker" ? campaign.fixedBroker : r.broker === "unassigned" ? campaign.fallbackBroker : r.broker;
    return !broker || !steps.length || steps.some(s => renderEmailRecipient(s.subjectTemplate, s.bodyTemplate, r).blockingReasons.length);
  }).length;
  function validate() {
    if (pending.invalid.length) return;
    onChange(pending.recipients, pending.recipients.map(r => r.email).join("\n"));
    setNotice("Liste validée. Cliquez sur Enregistrer pour conserver vos modifications.");
  }
  function update(changes: Partial<CampaignManualRecipient>) {
    if (!selected || pending.invalid.length) return;
    const updated = pending.recipients.map(r => r.id === selected.id ? { ...r, ...changes } : r);
    onChange(updated, updated.map(r => r.email).join("\n"));
    if (changes.email !== undefined) setSelectedEmail(changes.email);
  }
  function correctAddress() {
    if (!selected) return;
    const email = window.prompt("Corriger l’adresse en conservant ses informations et son historique :", selected.email)?.trim();
    if (email === undefined) return;
    if (!validCampaignEmail(email) || pending.recipients.some(r => r.id !== selected.id && normalizedCampaignEmail(r.email) === normalizedCampaignEmail(email))) {
      setNotice("Adresse invalide ou déjà présente. La liste est conservée ; corrigez cette adresse pour continuer."); return;
    }
    update({ email });
  }
  return <section className="manual-campaign-recipients" aria-labelledby="manual-recipients-title">
    <h3 id="manual-recipients-title">ADRESSES COURRIEL MANUELLES</h3>
    <p>La liste complète est enregistrée avec le bouton Enregistrer. Aucun Contact CRM n’est créé.</p>
    <label>Liste complète des adresses courriel<textarea rows={8} value={text} disabled={disabled} onChange={e => { onTextChange(e.target.value); setNotice(""); }} placeholder="Une adresse par ligne, ou séparées par des virgules ou points-virgules" /></label>
    <small>Ajoutez ou retirez des lignes pour modifier la liste. Les retraits prennent effet à l’enregistrement ; l’historique des envois est conservé. Pour corriger une adresse en conservant ses informations, utilisez « Informations facultatives ». Une nouvelle adresse ne reprend pas les informations d’une adresse retirée.</small>
    <p>Contacts sélectionnés : {contacts.length} · Adresses manuelles : {pending.recipients.length} · Destinataires uniques : {effective.length}</p>
    {pending.invalid.length > 0 && <p role="alert">Certaines adresses doivent être corrigées. {pending.invalid.join(", ")}</p>}
    {pending.duplicates > 0 && <p>{pending.duplicates} doublon(s) dans la liste : une seule adresse sera conservée.</p>}
    {contactDuplicates > 0 && <p>{contactDuplicates} adresse(s) figurent déjà parmi les Contacts sélectionnés. Un seul destinataire effectif : le Contact CRM.</p>}
    <button type="button" disabled={disabled || pending.invalid.length > 0} onClick={validate}>VALIDER LA LISTE (FACULTATIF)</button>
    {notice && <p role="status">{notice}</p>}
    {selected && <details><summary>Informations facultatives — prénom, nom et courtier</summary>
      <label>Adresse à modifier<select disabled={disabled || pending.invalid.length > 0} value={selected.email} onChange={e => setSelectedEmail(e.target.value)}>{pending.recipients.map(r => <option key={r.id} value={r.email}>{r.email}</option>)}</select></label>
      <fieldset disabled={disabled || pending.invalid.length > 0}>
        <legend>Informations du destinataire</legend>
        <button type="button" onClick={correctAddress}>CORRIGER CETTE ADRESSE</button>
        <label>Prénom (facultatif)<input maxLength={120} value={selected.firstName} onChange={e => update({ firstName: e.target.value })} /></label>
        <label>Nom (facultatif)<input maxLength={120} value={selected.lastName} onChange={e => update({ lastName: e.target.value })} /></label>
        <label>Courtier (facultatif)<select value={selected.broker ?? ""} onChange={e => update({ broker: e.target.value as CampaignManualRecipient["broker"] || null })}><option value="">Courtier de secours</option>{CONTACT_BROKERS.map(b => <option key={b} value={b}>{BROKER_LABELS[b]}</option>)}</select></label>
      </fieldset>
    </details>}
    <p>Prêts : {effective.length - blocked} · Bloqués : {blocked} — sous réserve de la connexion et de la signature Gmail vérifiées dans l’aperçu.</p>
    <small>L’ajout d’une adresse ne confirme pas son consentement. Vérifiez les autorisations et oppositions avant tout futur envoi.</small>
  </section>;
}
