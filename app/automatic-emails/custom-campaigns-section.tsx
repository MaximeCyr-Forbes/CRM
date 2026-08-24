"use client";

import { useEffect, useMemo, useState } from "react";
import { BROKER_LABELS, CONTACT_BROKERS, type ContactBroker } from "../data/contact-types";
import {
  CUSTOM_EMAIL_CAMPAIGN_STATUS_LABELS,
  CUSTOM_EMAIL_SENDER_LABELS,
  CUSTOM_EMAIL_VARIABLES,
  customCampaignConfigurationIssues,
  type CustomEmailCampaign,
  type CustomEmailCampaignContact,
  type CustomEmailCampaignDraft,
  type CustomEmailCampaignPreview,
  type CustomEmailCampaignStatus,
  type CustomEmailCampaignStep,
} from "../data/custom-email-campaign-types";

type EditorStep = Pick<CustomEmailCampaignStep, "delayDaysAfterPrevious" | "subjectTemplate" | "bodyTemplate"> & { id: string | null };
type EditorState = { id: string | null; campaign: CustomEmailCampaignDraft; contacts: CustomEmailCampaignContact[]; steps: EditorStep[]; originalStepIds: string[] };
type Filter = "all" | ContactBroker;

const EMPTY_STEP: EditorStep = { id: null, delayDaysAfterPrevious: 0, subjectTemplate: "", bodyTemplate: "Bonjour {{firstName}},\n\n", };

function today() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function emptyCampaign(): CustomEmailCampaignDraft {
  return { name: "", status: "draft", executionMode: "approval", senderStrategy: "assigned_broker", fixedBroker: null, fallbackBroker: null, startDate: today(), sendHour: 9, sendMinute: 0, timezone: "America/Toronto" };
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "Non définie";
}

function fullName(contact: CustomEmailCampaignContact) {
  return `${contact.firstName} ${contact.lastName}`.trim() || "Contact sans nom";
}

async function json<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json() as { data?: T; error?: string };
  if (!response.ok || body.data === undefined) throw new Error(body.error ?? fallback);
  return body.data;
}

export default function CustomCampaignsSection() {
  const [campaigns, setCampaigns] = useState<CustomEmailCampaign[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [preview, setPreview] = useState<CustomEmailCampaignPreview | null>(null);
  const [previewContactId, setPreviewContactId] = useState("");
  const [showAllPreview, setShowAllPreview] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCampaigns() {
    setLoading(true);
    try {
      const data = await json<{ campaigns: CustomEmailCampaign[] }>(await fetch("/api/automatic-emails/custom-campaigns", { cache: "no-store" }), "Chargement impossible.");
      setCampaigns(data.campaigns);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Chargement impossible."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadCampaigns(); }, []);

  async function openNew() {
    setError(null);
    try {
      const contacts = await json<CustomEmailCampaignContact[]>(await fetch("/api/automatic-emails/custom-campaigns/contacts", { cache: "no-store" }), "Chargement des Contacts impossible.");
      setEditor({ id: null, campaign: emptyCampaign(), contacts, steps: [{ ...EMPTY_STEP }], originalStepIds: [] });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Chargement impossible."); }
  }

  async function openEditor(campaignId: string) {
    setError(null);
    try {
      const [bundle, contacts] = await Promise.all([
        json<{ campaign: CustomEmailCampaign; steps: CustomEmailCampaignStep[] }>(await fetch(`/api/automatic-emails/custom-campaigns/${campaignId}`, { cache: "no-store" }), "Campagne introuvable."),
        json<CustomEmailCampaignContact[]>(await fetch(`/api/automatic-emails/custom-campaigns/${campaignId}/contacts`, { cache: "no-store" }), "Chargement des Contacts impossible."),
      ]);
      const { contactCount: _contactCount, stepCount: _stepCount, durationDays: _durationDays, id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...campaign } = bundle.campaign;
      setEditor({ id: campaignId, campaign, contacts, steps: bundle.steps.map((step) => ({ id: step.id, delayDaysAfterPrevious: step.delayDaysAfterPrevious, subjectTemplate: step.subjectTemplate, bodyTemplate: step.bodyTemplate })), originalStepIds: bundle.steps.map((step) => step.id) });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Chargement impossible."); }
  }

  const selectedContacts = editor?.contacts.filter((contact) => contact.selected) ?? [];
  const readyContacts = selectedContacts.filter((contact) => contact.email.trim()).length;
  const filteredContacts = useMemo(() => {
    if (!editor) return [];
    const term = search.trim().toLocaleLowerCase("fr");
    return editor.contacts.filter((contact) => (filter === "all" || contact.broker === filter) && (!term || `${fullName(contact)} ${contact.email} ${contact.phone}`.toLocaleLowerCase("fr").includes(term)));
  }, [editor, filter, search]);

  function updateContactIds(ids: readonly string[], selected: boolean) {
    if (!editor) return;
    const wanted = new Set(ids);
    setEditor({ ...editor, contacts: editor.contacts.map((contact) => wanted.has(contact.id) ? { ...contact, selected } : contact) });
  }

  function moveStep(index: number, delta: number) {
    if (!editor) return;
    const target = index + delta;
    if (target < 0 || target >= editor.steps.length) return;
    const steps = [...editor.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setEditor({ ...editor, steps });
  }

  async function saveEditor() {
    if (!editor) return;
    const pseudoSteps = editor.steps.map((step, index) => ({ ...step, id: step.id ?? `local-${index}`, campaignId: editor.id ?? "local", stepOrder: index + 1, createdAt: "", updatedAt: "" }));
    const issues = customCampaignConfigurationIssues(editor.campaign, selectedContacts, pseudoSteps);
    if (editor.campaign.status === "ready" && issues.length > 0) { setError(issues[0]); return; }
    setSaving(true);
    setError(null);
    try {
      const desiredStatus = editor.campaign.status;
      const draftBody = { ...editor.campaign, status: "draft" as const };
      let campaignId = editor.id;
      if (campaignId) {
        await json(await fetch(`/api/automatic-emails/custom-campaigns/${campaignId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draftBody) }), "Enregistrement impossible.");
      } else {
        const created = await json<CustomEmailCampaign>(await fetch("/api/automatic-emails/custom-campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draftBody) }), "Création impossible.");
        campaignId = created.id;
      }
      await json(await fetch(`/api/automatic-emails/custom-campaigns/${campaignId}/contacts`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactIds: selectedContacts.map((contact) => contact.id) }) }), "Enregistrement des destinataires impossible.");
      const retained = new Set(editor.steps.flatMap((step) => step.id ? [step.id] : []));
      for (const stepId of editor.originalStepIds.filter((id) => !retained.has(id))) {
        await json(await fetch(`/api/automatic-emails/custom-campaigns/${campaignId}/steps/${stepId}`, { method: "DELETE" }), "Suppression du courriel impossible.");
      }
      const savedStepIds: string[] = [];
      for (const [stepIndex, step] of editor.steps.entries()) {
        const body = { delayDaysAfterPrevious: stepIndex === 0 ? 0 : step.delayDaysAfterPrevious, subjectTemplate: step.subjectTemplate, bodyTemplate: step.bodyTemplate };
        const saved = step.id
          ? await json<CustomEmailCampaignStep>(await fetch(`/api/automatic-emails/custom-campaigns/${campaignId}/steps/${step.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), "Modification du courriel impossible.")
          : await json<CustomEmailCampaignStep>(await fetch(`/api/automatic-emails/custom-campaigns/${campaignId}/steps`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), "Ajout du courriel impossible.");
        savedStepIds.push(saved.id);
      }
      await json(await fetch(`/api/automatic-emails/custom-campaigns/${campaignId}/steps`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stepIds: savedStepIds }) }), "Réorganisation impossible.");
      await json(await fetch(`/api/automatic-emails/custom-campaigns/${campaignId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editor.campaign, status: desiredStatus }) }), "Finalisation impossible.");
      setEditor(null);
      await loadCampaigns();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Enregistrement impossible."); }
    finally { setSaving(false); }
  }

  async function deleteCampaign(campaign: CustomEmailCampaign) {
    if (!window.confirm(`Supprimer la campagne « ${campaign.name} » et sa configuration?`)) return;
    try {
      await json(await fetch(`/api/automatic-emails/custom-campaigns/${campaign.id}`, { method: "DELETE" }), "Suppression impossible.");
      await loadCampaigns();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Suppression impossible."); }
  }

  async function openPreview(campaignId: string) {
    setError(null);
    try {
      const data = await json<CustomEmailCampaignPreview>(await fetch(`/api/automatic-emails/custom-campaigns/${campaignId}/preview`, { cache: "no-store" }), "Prévisualisation impossible.");
      setPreview(data);
      setPreviewContactId(data.contacts[0]?.id ?? "");
      setShowAllPreview(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Prévisualisation impossible."); }
  }

  const contactOccurrences = preview?.occurrences.filter((item) => item.contactId === previewContactId) ?? [];

  return <section className="custom-campaigns" aria-labelledby="custom-campaigns-title">
    <div className="custom-campaigns-heading"><div className="automatic-emails-section-title"><p className="section-kicker">Personnalisés</p><h2 id="custom-campaigns-title">CAMPAGNES PERSONNALISÉES</h2><p>Créez des séquences sur mesure et vérifiez chaque occurrence. Aucun envoi n’est possible.</p></div><button onClick={() => void openNew()} type="button">+ NOUVELLE CAMPAGNE</button></div>
    {error && <div className="automatic-emails-alert" role="alert">{error}<button onClick={() => setError(null)} type="button">Fermer</button></div>}
    {loading ? <p className="automatic-emails-loading">Chargement des campagnes…</p> : <div className="custom-campaign-grid">
      {campaigns.map((campaign) => <article className="custom-campaign-card" key={campaign.id}><div><span className={`automatic-email-rule-status ${campaign.status}`}>{CUSTOM_EMAIL_CAMPAIGN_STATUS_LABELS[campaign.status].toUpperCase()}</span><span aria-hidden="true">✦</span></div><h3>{campaign.name.toUpperCase()}</h3>{campaign.status === "ready" && <div className="custom-campaign-ready"><strong>PRÊTE POUR UNE FUTURE ACTIVATION</strong><span>SIMULATION SEULEMENT — AUCUN COURRIEL NE PEUT PARTIR</span></div>}<dl><div><dt>Contacts</dt><dd>{campaign.contactCount}</dd></div><div><dt>Courriels</dt><dd>{campaign.stepCount}</dd></div><div><dt>Début</dt><dd>{formatDate(campaign.startDate)}</dd></div><div><dt>Durée</dt><dd>{campaign.durationDays} jour{campaign.durationDays === 1 ? "" : "s"}</dd></div><div><dt>Expéditeur</dt><dd>{CUSTOM_EMAIL_SENDER_LABELS[campaign.senderStrategy]}{campaign.senderStrategy === "fixed_broker" && campaign.fixedBroker ? ` · ${BROKER_LABELS[campaign.fixedBroker]}` : ""}</dd></div><div><dt>Mode prévu</dt><dd>{campaign.executionMode === "automatic" ? "Automatique (futur)" : "À approuver"}</dd></div></dl><div className="automatic-email-rule-actions"><button onClick={() => void openEditor(campaign.id)} type="button">CONFIGURER</button><button onClick={() => void openPreview(campaign.id)} type="button">PRÉVISUALISER</button>{campaign.status !== "ready" && <button className="custom-campaign-delete" onClick={() => void deleteCampaign(campaign)} type="button">SUPPRIMER</button>}</div></article>)}
      {campaigns.length === 0 && <div className="custom-campaign-empty"><strong>AUCUNE CAMPAGNE PERSONNALISÉE</strong><span>Créez une première séquence en mode simulation.</span></div>}
    </div>}

    {editor && <div className="automatic-email-modal-backdrop" role="presentation"><section aria-labelledby="custom-editor-title" aria-modal="true" className="automatic-email-modal custom-campaign-editor" role="dialog"><header><div><p className="section-kicker">Simulation seulement</p><h2 id="custom-editor-title">{editor.id ? "CONFIGURER LA CAMPAGNE" : "NOUVELLE CAMPAGNE"}</h2></div><button aria-label="Fermer" onClick={() => setEditor(null)} type="button">×</button></header><div className="custom-campaign-editor-body">
      <div className="automatic-email-editor-grid custom-campaign-basics"><label className="automatic-email-editor-wide">Nom de la campagne<input maxLength={160} onChange={(event) => setEditor({ ...editor, campaign: { ...editor.campaign, name: event.target.value } })} value={editor.campaign.name} /></label><label>Date de début<input onChange={(event) => setEditor({ ...editor, campaign: { ...editor.campaign, startDate: event.target.value || null } })} type="date" value={editor.campaign.startDate ?? ""} /></label><label>Heure<input onChange={(event) => { const [hour, minute] = event.target.value.split(":").map(Number); setEditor({ ...editor, campaign: { ...editor.campaign, sendHour: hour, sendMinute: minute } }); }} type="time" value={`${String(editor.campaign.sendHour).padStart(2, "0")}:${String(editor.campaign.sendMinute).padStart(2, "0")}`} /></label><label>Statut<select onChange={(event) => setEditor({ ...editor, campaign: { ...editor.campaign, status: event.target.value as CustomEmailCampaignStatus } })} value={editor.campaign.status}><option value="draft">Brouillon</option><option value="ready">Prête</option><option value="paused">En pause</option></select><small>Prête signifie configuration terminée, jamais activée.</small></label><label>Mode prévu<select onChange={(event) => setEditor({ ...editor, campaign: { ...editor.campaign, executionMode: event.target.value as CustomEmailCampaignDraft["executionMode"] } })} value={editor.campaign.executionMode}><option value="approval">À approuver</option><option value="automatic">Automatique</option></select><small>Ce mode sera utilisé après une future activation du moteur d’envoi.</small></label><label>Stratégie d’expéditeur<select onChange={(event) => setEditor({ ...editor, campaign: { ...editor.campaign, senderStrategy: event.target.value as CustomEmailCampaignDraft["senderStrategy"] } })} value={editor.campaign.senderStrategy}><option value="assigned_broker">Courtier attribué au Contact</option><option value="fixed_broker">Courtier fixe</option></select></label>{editor.campaign.senderStrategy === "assigned_broker" ? <label>Courtier de secours<select onChange={(event) => setEditor({ ...editor, campaign: { ...editor.campaign, fallbackBroker: event.target.value ? event.target.value as CustomEmailCampaignDraft["fallbackBroker"] : null } })} value={editor.campaign.fallbackBroker ?? ""}><option value="">Choisir</option>{CONTACT_BROKERS.map((broker) => <option key={broker} value={broker}>{BROKER_LABELS[broker]}</option>)}</select><small>Obligatoire pour les Contacts non attribués.</small></label> : <label>Courtier fixe<select onChange={(event) => setEditor({ ...editor, campaign: { ...editor.campaign, fixedBroker: event.target.value ? event.target.value as CustomEmailCampaignDraft["fixedBroker"] : null } })} value={editor.campaign.fixedBroker ?? ""}><option value="">Choisir</option>{CONTACT_BROKERS.map((broker) => <option key={broker} value={broker}>{BROKER_LABELS[broker]}</option>)}</select></label>}</div>
      <section className="custom-campaign-recipients"><div><h3>DESTINATAIRES</h3><strong>{selectedContacts.length} CONTACT{selectedContacts.length === 1 ? "" : "S"} SÉLECTIONNÉ{selectedContacts.length === 1 ? "" : "S"}</strong><span>{readyContacts} prêts · {selectedContacts.length - readyContacts} sans courriel</span></div><div className="custom-campaign-contact-tools"><input aria-label="Rechercher un Contact" onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher nom, courriel ou téléphone" value={search} /><div>{(["all", "maxime", "france", "sandrine", "unassigned"] as Filter[]).map((value) => <button aria-pressed={filter === value} key={value} onClick={() => setFilter(value)} type="button">{value === "all" ? "TOUS" : value === "unassigned" ? "NON ATTRIBUÉS" : BROKER_LABELS[value]}</button>)}</div><div><button onClick={() => updateContactIds(filteredContacts.map((contact) => contact.id), true)} type="button">TOUT SÉLECTIONNER</button><button onClick={() => updateContactIds(filteredContacts.map((contact) => contact.id), false)} type="button">TOUT DÉSÉLECTIONNER</button></div></div><div className="custom-campaign-contact-list">{filteredContacts.map((contact) => <label key={contact.id}><input checked={contact.selected} onChange={(event) => updateContactIds([contact.id], event.target.checked)} type="checkbox" /><span><strong>{fullName(contact)}</strong><small>{contact.email || "COURRIEL MANQUANT"} · {contact.phone || "Téléphone non renseigné"}</small></span><em>{contact.email ? BROKER_LABELS[contact.broker] : "BLOQUÉ"}</em></label>)}{filteredContacts.length === 0 && <p>Aucun Contact ne correspond à ces critères.</p>}</div></section>
      <section className="custom-campaign-sequence"><div><h3>SÉQUENCE DE COURRIELS</h3><button onClick={() => setEditor({ ...editor, steps: [...editor.steps, { ...EMPTY_STEP, delayDaysAfterPrevious: editor.steps.length === 0 ? 0 : 3 }] })} type="button">+ AJOUTER UN COURRIEL</button></div>{editor.steps.map((step, index) => <article key={step.id ?? `new-${index}`}><header><div><strong>COURRIEL {index + 1}</strong><span>{index === 0 ? "Jour 0" : `${step.delayDaysAfterPrevious} jour${step.delayDaysAfterPrevious === 1 ? "" : "s"} après le courriel précédent`}</span></div><div><button disabled={index === 0} onClick={() => moveStep(index, -1)} type="button">MONTER</button><button disabled={index === editor.steps.length - 1} onClick={() => moveStep(index, 1)} type="button">DESCENDRE</button><button onClick={() => { if (window.confirm("Supprimer ce courriel de la séquence?")) setEditor({ ...editor, steps: editor.steps.filter((_, stepIndex) => stepIndex !== index) }); }} type="button">SUPPRIMER</button></div></header>{index > 0 && <label>Délai après le courriel précédent<input max="3650" min="0" onChange={(event) => setEditor({ ...editor, steps: editor.steps.map((item, stepIndex) => stepIndex === index ? { ...item, delayDaysAfterPrevious: Number(event.target.value) } : item) })} type="number" value={step.delayDaysAfterPrevious} /></label>}<label>Objet<input maxLength={250} onChange={(event) => setEditor({ ...editor, steps: editor.steps.map((item, stepIndex) => stepIndex === index ? { ...item, subjectTemplate: event.target.value } : item) })} value={step.subjectTemplate} /></label><label>Message<textarea maxLength={100000} onChange={(event) => setEditor({ ...editor, steps: editor.steps.map((item, stepIndex) => stepIndex === index ? { ...item, bodyTemplate: event.target.value } : item) })} rows={6} value={step.bodyTemplate} /></label></article>)}<div className="automatic-email-variables"><strong>Variables disponibles</strong>{CUSTOM_EMAIL_VARIABLES.map((variable) => <code key={variable}>{`{{${variable}}}`}</code>)}</div></section>
      <div className="automatic-email-simulation-warning"><strong>SIMULATION SEULEMENT — AUCUN COURRIEL NE PEUT PARTIR</strong><span>La vraie signature Gmail du courtier sera ajoutée seulement lors d’une future activation autorisée.</span></div>
    </div><footer><button onClick={() => setEditor(null)} type="button">ANNULER</button><button disabled={saving} onClick={() => void saveEditor()} type="button">{saving ? "ENREGISTREMENT…" : "ENREGISTRER"}</button></footer></section></div>}

    {preview && <div className="automatic-email-modal-backdrop" role="presentation"><section aria-labelledby="custom-preview-title" aria-modal="true" className="automatic-email-modal custom-campaign-preview" role="dialog"><header><div><p className="section-kicker">Simulation seulement</p><h2 id="custom-preview-title">{preview.campaign.name.toUpperCase()}</h2></div><button aria-label="Fermer" onClick={() => setPreview(null)} type="button">×</button></header><div className="automatic-email-simulation-warning"><strong>AUCUN ENVOI</strong><span>{preview.summary.total} occurrence{preview.summary.total === 1 ? "" : "s"} calculée{preview.summary.total === 1 ? "" : "s"} à la demande · {preview.summary.ready} prête{preview.summary.ready === 1 ? "" : "s"} · {preview.summary.blocked} bloquée{preview.summary.blocked === 1 ? "" : "s"}</span></div><div className="custom-preview-controls"><label>PRÉVISUALISATION POUR<select onChange={(event) => setPreviewContactId(event.target.value)} value={previewContactId}>{preview.contacts.map((contact) => <option key={contact.id} value={contact.id}>{fullName(contact)}</option>)}</select></label><button aria-pressed={showAllPreview} onClick={() => setShowAllPreview((value) => !value)} type="button">VOIR TOUS LES ENVOIS PRÉVUS</button></div>{!showAllPreview ? <div className="custom-preview-steps">{contactOccurrences.map((item) => <article key={item.occurrenceKey}><header><strong>COURRIEL {item.stepOrder}</strong><time>{formatDate(item.scheduledDate)} · {item.scheduledTime}</time></header><dl><div><dt>Expéditeur</dt><dd>{item.brokerLabel}</dd></div><div><dt>À</dt><dd>{item.recipientEmail || "Adresse courriel manquante"}</dd></div><div><dt>Objet</dt><dd>{item.subject}</dd></div><div><dt>Message</dt><dd>{item.message}</dd></div><div><dt>Signature Gmail</dt><dd>{item.gmailSignatureReady ? "Sera ajoutée ✓" : "SIGNATURE NON AUTORISÉE"}</dd></div><div><dt>État</dt><dd>{item.blockingReasons.length ? `BLOQUÉ · ${item.blockingReasons.join(" ")}` : "PRÊT"}</dd></div></dl></article>)}{contactOccurrences.length === 0 && <p>Aucune occurrence pour ce Contact.</p>}</div> : <div className="automatic-email-schedule-list custom-preview-all">{preview.occurrences.map((item) => <article key={item.occurrenceKey}><time>{formatDate(item.scheduledDate)} · {item.scheduledTime}</time><div><strong>{item.recipientName}</strong><span>Courriel {item.stepOrder} · {item.brokerLabel}</span>{item.blockingReasons.length > 0 && <small>{item.blockingReasons.join(" ")}</small>}</div><span className={item.blockingReasons.length ? "blocked" : "ready"}>{item.blockingReasons.length ? "BLOQUÉ" : "PRÊT"}</span></article>)}</div>}<footer><button onClick={() => setPreview(null)} type="button">FERMER</button></footer></section></div>}
  </section>;
}
