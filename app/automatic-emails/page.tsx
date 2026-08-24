"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarConnectionStatus } from "../data/calendar-types";
import { BROKER_LABELS, CONTACT_BROKERS } from "../data/contact-types";
import {
  AUTOMATIC_EMAIL_MODE_LABELS,
  AUTOMATIC_EMAIL_RULE_DESCRIPTIONS,
  AUTOMATIC_EMAIL_RULE_LABELS,
  AUTOMATIC_EMAIL_STATUS_LABELS,
  AUTOMATIC_EMAIL_VARIABLES,
  ruleConfigurationIssues,
  type AutomaticEmailDelivery,
  type AutomaticEmailOccurrence,
  type AutomaticEmailRule,
} from "../data/automatic-email-types";

type RulesPayload = {
  rules: AutomaticEmailRule[];
  deliveries: AutomaticEmailDelivery[];
  locked: true;
  configuredMasterLock: boolean;
  runnerAvailable: false;
};

function quebecToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function triggerLabel(rule: AutomaticEmailRule) {
  if (rule.ruleType === "mortgage_renewal") return `${rule.triggerConfig.leadMonths ?? 6} mois avant le renouvellement`;
  if (rule.ruleType === "google_review") return `${rule.triggerConfig.delayDays ?? 3} jours après la conclusion`;
  return AUTOMATIC_EMAIL_RULE_DESCRIPTIONS[rule.ruleType];
}

export default function AutomaticEmailsPage() {
  const [rules, setRules] = useState<AutomaticEmailRule[]>([]);
  const [deliveries, setDeliveries] = useState<AutomaticEmailDelivery[]>([]);
  const [occurrences, setOccurrences] = useState<AutomaticEmailOccurrence[]>([]);
  const [connections, setConnections] = useState<CalendarConnectionStatus[]>([]);
  const [editing, setEditing] = useState<AutomaticEmailRule | null>(null);
  const [previewRuleId, setPreviewRuleId] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const today = quebecToday();
  const through = addDays(today, 30);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [rulesResponse, occurrenceResponse, connectionResponse] = await Promise.all([
        fetch("/api/automatic-emails/rules", { cache: "no-store" }),
        fetch(`/api/automatic-emails/occurrences?from=${today}&to=${through}`, { cache: "no-store" }),
        fetch("/api/google-calendar/connections", { cache: "no-store" }),
      ]);
      const rulesBody = await rulesResponse.json() as { data?: RulesPayload; error?: string };
      const occurrenceBody = await occurrenceResponse.json() as { data?: { occurrences: AutomaticEmailOccurrence[] }; error?: string };
      const connectionBody = await connectionResponse.json() as { connections?: CalendarConnectionStatus[]; error?: string };
      if (!rulesResponse.ok || !rulesBody.data) throw new Error(rulesBody.error ?? "Chargement des règles impossible.");
      if (!occurrenceResponse.ok || !occurrenceBody.data) throw new Error(occurrenceBody.error ?? "Simulation impossible.");
      setRules(rulesBody.data.rules);
      setDeliveries(rulesBody.data.deliveries);
      setOccurrences(occurrenceBody.data.occurrences);
      setConnections(connectionBody.connections ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chargement impossible.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const previewRule = rules.find((rule) => rule.id === previewRuleId) ?? null;
  const previewOccurrence = occurrences.find((item) => item.ruleId === previewRuleId) ?? null;
  const todayCount = occurrences.filter((item) => item.scheduledDate === today).length;
  const tomorrowCount = occurrences.filter((item) => item.scheduledDate === addDays(today, 1)).length;
  const weekCount = occurrences.filter((item) => item.scheduledDate >= today && item.scheduledDate <= addDays(today, 7)).length;
  const cardData = useMemo(() => rules.map((rule) => {
    const ruleOccurrences = occurrences.filter((item) => item.ruleId === rule.id);
    const issues = ruleConfigurationIssues(rule);
    return { rule, issues, count: ruleOccurrences.length, next: ruleOccurrences[0] ?? null };
  }), [occurrences, rules]);

  async function saveRule() {
    if (!editing) return;
    const issues = ruleConfigurationIssues(editing);
    if (editing.status === "ready" && issues.length > 0) {
      setError("La règle ne peut pas être marquée Prête tant que sa configuration est incomplète.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/automatic-emails/rules/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleType: editing.ruleType, name: editing.name, status: editing.status, executionMode: editing.executionMode,
          defaultBroker: editing.defaultBroker, subjectTemplate: editing.subjectTemplate, bodyTemplate: editing.bodyTemplate,
          sendHour: editing.sendHour, sendMinute: editing.sendMinute, timezone: editing.timezone, triggerConfig: editing.triggerConfig,
        }),
      });
      const body = await response.json() as { data?: AutomaticEmailRule; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error ?? "Enregistrement impossible.");
      setRules((current) => current.map((rule) => rule.id === body.data!.id ? body.data! : rule));
      setEditing(null);
      setConfirmation("Configuration enregistrée en mode verrouillé.");
      window.setTimeout(() => setConfirmation(null), 4000);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
    } finally {
      setIsSaving(false);
    }
  }

  return <main className="automatic-emails-page"><div className="automatic-emails-shell">
    <header className="automatic-emails-heading"><div><p className="section-kicker">Préparation contrôlée</p><h1>COURRIELS AUTO</h1><p>Configurez et simulez les communications récurrentes de l’Équipe Forbes.</p></div><span className="automatic-emails-mode">MODE SIMULATION</span></header>

    <section className="automatic-emails-lock" aria-label="État de sécurité"><span className="automatic-emails-lock-icon" aria-hidden="true">⌑</span><div><p>VERROU MAÎTRE</p><h2>ENVOIS AUTOMATIQUES VERROUILLÉS</h2><span>Le module est actuellement en préparation. Aucun courriel automatique ne peut être envoyé.</span></div><strong>VERROUILLÉS</strong></section>

    {error && <div className="automatic-emails-alert" role="alert">{error}<button onClick={() => void load()} type="button">Réessayer</button></div>}
    {isLoading && <div className="automatic-emails-loading" role="status">Calcul des simulations…</div>}

    {!isLoading && <>
      <section className="automatic-emails-upcoming"><div className="automatic-emails-section-title"><p className="section-kicker">À venir</p><h2>SIMULATION DES 30 PROCHAINS JOURS</h2></div><div><article><span>Aujourd’hui</span><strong>{todayCount}</strong><small>occurrence{todayCount === 1 ? "" : "s"} potentielle{todayCount === 1 ? "" : "s"}</small></article><article><span>Demain</span><strong>{tomorrowCount}</strong><small>occurrence{tomorrowCount === 1 ? "" : "s"} potentielle{tomorrowCount === 1 ? "" : "s"}</small></article><article><span>Dans 7 jours</span><strong>{weekCount}</strong><small>occurrence{weekCount === 1 ? "" : "s"} potentielle{weekCount === 1 ? "" : "s"}</small></article><button onClick={() => setShowSchedule(true)} type="button">VOIR LES ENVOIS PRÉVUS <span aria-hidden="true">→</span></button></div></section>

      <section aria-labelledby="automatic-rules-title"><div className="automatic-emails-section-title"><p className="section-kicker">Automatisations V1</p><h2 id="automatic-rules-title">RÈGLES PRÉPARÉES</h2><p>Même en mode « Automatique », aucune règle ne peut déclencher un envoi dans cette version.</p></div><div className="automatic-email-rule-grid">
        {cardData.map(({ rule, issues, count, next }) => <article className="automatic-email-rule-card" key={rule.id}><div className="automatic-email-rule-top"><span className={`automatic-email-rule-status ${issues.length ? "incomplete" : rule.status}`}>{issues.length ? "CONFIGURATION INCOMPLÈTE" : AUTOMATIC_EMAIL_STATUS_LABELS[rule.status].toUpperCase()}</span><span aria-hidden="true">◈</span></div><h3>{AUTOMATIC_EMAIL_RULE_LABELS[rule.ruleType].toUpperCase()}</h3><dl><div><dt>Mode prévu</dt><dd>{AUTOMATIC_EMAIL_MODE_LABELS[rule.executionMode]}</dd></div><div><dt>Expéditeur</dt><dd>Selon le courtier du Contact{rule.defaultBroker ? ` · secours ${BROKER_LABELS[rule.defaultBroker]}` : " · secours requis"}</dd></div><div><dt>Déclencheur</dt><dd>{triggerLabel(rule)}</dd></div><div><dt>Destinataires potentiels</dt><dd>{count} sur 30 jours</dd></div><div><dt>Prochaine occurrence</dt><dd>{next ? `${formatDate(next.scheduledDate)} · ${next.scheduledTime}` : "Aucune dans les 30 jours"}</dd></div><div><dt>Signature Gmail</dt><dd>{rule.defaultBroker && connections.find((item) => item.broker === rule.defaultBroker)?.gmailSignatureEnabled ? "Utilisée automatiquement ✓" : "À vérifier / autoriser"}</dd></div></dl>{issues.length > 0 && <p className="automatic-email-rule-issues">{issues[0]}</p>}<div className="automatic-email-rule-actions"><button onClick={() => setEditing({ ...rule, triggerConfig: { ...rule.triggerConfig } })} type="button">CONFIGURER</button><button onClick={() => setPreviewRuleId(rule.id)} type="button">PRÉVISUALISER</button></div></article>)}
      </div></section>

      <section className="automatic-emails-connections"><div className="automatic-emails-section-title"><p className="section-kicker">Infrastructure existante</p><h2>GMAIL ET SIGNATURES</h2></div><div>{CONTACT_BROKERS.map((broker) => { const status = connections.find((item) => item.broker === broker); return <article key={broker}><strong>{BROKER_LABELS[broker]}</strong><span>{status?.gmailSendEnabled ? "Gmail prêt ✓" : "Gmail à connecter"}</span><span>{status?.gmailSignatureEnabled ? "Signature autorisée ✓" : "Signature à autoriser"}</span></article>; })}</div><p>La signature réelle sera récupérée directement de Gmail au moment d’un futur envoi autorisé. Aucun nouveau scope OAuth n’est requis.</p></section>

      <section className="automatic-emails-history"><div className="automatic-emails-section-title"><p className="section-kicker">Historique</p><h2>AUCUN COURRIEL AUTOMATIQUE ENVOYÉ</h2></div>{deliveries.length === 0 ? <p>Aucune file persistante n’a été créée. Les simulations affichées sur cette page ne sont pas enregistrées comme des envois.</p> : <div>{deliveries.map((delivery) => <article key={delivery.id}><strong>{delivery.status === "queued" ? "Simulation en attente" : "Aperçu"}</strong><span>{delivery.recipientEmail}</span><span>{new Intl.DateTimeFormat("fr-CA", { dateStyle: "long", timeStyle: "short", timeZone: "America/Toronto" }).format(new Date(delivery.scheduledFor))}</span></article>)}</div>}</section>
    </>}
  </div>

  {editing && <div className="automatic-email-modal-backdrop" role="presentation"><section aria-labelledby="automatic-email-editor-title" aria-modal="true" className="automatic-email-modal automatic-email-editor" role="dialog"><header><div><p className="section-kicker">Configuration verrouillée</p><h2 id="automatic-email-editor-title">{AUTOMATIC_EMAIL_RULE_LABELS[editing.ruleType].toUpperCase()}</h2></div><button aria-label="Fermer" onClick={() => setEditing(null)} type="button">×</button></header><div className="automatic-email-editor-grid"><label>Nom<input onChange={(event) => setEditing({ ...editing, name: event.target.value })} value={editing.name} /></label><label>Statut<select onChange={(event) => setEditing({ ...editing, status: event.target.value as AutomaticEmailRule["status"] })} value={editing.status}><option value="draft">Brouillon</option><option value="ready">Prête</option><option value="paused">En pause</option></select></label><label>Mode d’exécution<select onChange={(event) => setEditing({ ...editing, executionMode: event.target.value as AutomaticEmailRule["executionMode"] })} value={editing.executionMode}><option value="approval">À approuver</option><option value="automatic">Automatique</option></select><small>Ce choix servira après activation. Le système reste verrouillé.</small></label><label>Expéditeur — contacts non attribués<select onChange={(event) => setEditing({ ...editing, defaultBroker: event.target.value ? event.target.value as AutomaticEmailRule["defaultBroker"] : null })} value={editing.defaultBroker ?? ""}><option value="">Sélection obligatoire pour Prête</option>{CONTACT_BROKERS.map((broker) => <option key={broker} value={broker}>{BROKER_LABELS[broker]}</option>)}</select></label><label>Heure prévue<input max="23" min="0" onChange={(event) => setEditing({ ...editing, sendHour: Number(event.target.value) })} type="number" value={editing.sendHour} /></label><label>Minute<input max="59" min="0" onChange={(event) => setEditing({ ...editing, sendMinute: Number(event.target.value) })} type="number" value={editing.sendMinute} /></label>{editing.ruleType === "mortgage_renewal" && <label>Nombre de mois avant<input max="24" min="1" onChange={(event) => setEditing({ ...editing, triggerConfig: { leadMonths: Number(event.target.value) } })} type="number" value={editing.triggerConfig.leadMonths ?? 6} /></label>}{editing.ruleType === "google_review" && <><label>Délai après conclusion<input max="365" min="0" onChange={(event) => setEditing({ ...editing, triggerConfig: { ...editing.triggerConfig, delayDays: Number(event.target.value) } })} type="number" value={editing.triggerConfig.delayDays ?? 3} /></label><label className="automatic-email-editor-wide">URL Avis Google<input onChange={(event) => setEditing({ ...editing, triggerConfig: { ...editing.triggerConfig, googleReviewUrl: event.target.value } })} placeholder="https://..." type="url" value={editing.triggerConfig.googleReviewUrl ?? ""} /></label></>}<label className="automatic-email-editor-wide">Objet<input onChange={(event) => setEditing({ ...editing, subjectTemplate: event.target.value })} value={editing.subjectTemplate} /></label><label className="automatic-email-editor-wide">Message<textarea onChange={(event) => setEditing({ ...editing, bodyTemplate: event.target.value })} rows={8} value={editing.bodyTemplate} /></label></div><div className="automatic-email-variables"><strong>Variables disponibles</strong>{AUTOMATIC_EMAIL_VARIABLES[editing.ruleType].map((variable) => <code key={variable}>{`{{${variable}}}`}</code>)}</div>{ruleConfigurationIssues(editing).length > 0 && <div className="automatic-email-editor-warning"><strong>CONFIGURATION INCOMPLÈTE</strong>{ruleConfigurationIssues(editing).map((issue) => <span key={issue}>{issue}</span>)}</div>}<footer><button onClick={() => setEditing(null)} type="button">ANNULER</button><button disabled={isSaving} onClick={() => void saveRule()} type="button">{isSaving ? "ENREGISTREMENT…" : "ENREGISTRER"}</button></footer></section></div>}

  {previewRule && <div className="automatic-email-modal-backdrop" role="presentation"><section aria-labelledby="automatic-email-preview-title" aria-modal="true" className="automatic-email-modal" role="dialog"><header><div><p className="section-kicker">Aucun envoi</p><h2 id="automatic-email-preview-title">PRÉVISUALISATION</h2></div><button aria-label="Fermer" onClick={() => setPreviewRuleId(null)} type="button">×</button></header><div className="automatic-email-simulation-warning"><strong>SIMULATION SEULEMENT</strong><span>Aucun courriel ne sera envoyé.</span></div>{previewOccurrence ? <dl className="automatic-email-preview"><div><dt>Expéditeur prévu</dt><dd>{previewOccurrence.brokerLabel}</dd></div><div><dt>Destinataire</dt><dd>{previewOccurrence.recipientName} · {previewOccurrence.recipientEmail || "courriel manquant"}</dd></div><div><dt>Objet</dt><dd>{previewOccurrence.subject}</dd></div><div><dt>Message</dt><dd>{previewOccurrence.message}</dd></div><div><dt>Signature Gmail</dt><dd>sera ajoutée lors d’un futur envoi autorisé</dd></div></dl> : <p className="automatic-email-empty-preview">Aucun destinataire potentiel pour cette règle dans les 30 prochains jours.</p>}<footer><button onClick={() => setPreviewRuleId(null)} type="button">FERMER</button></footer></section></div>}

  {showSchedule && <div className="automatic-email-modal-backdrop" role="presentation"><section aria-labelledby="automatic-email-schedule-title" aria-modal="true" className="automatic-email-modal automatic-email-schedule" role="dialog"><header><div><p className="section-kicker">30 prochains jours</p><h2 id="automatic-email-schedule-title">ENVOIS PRÉVUS</h2></div><button aria-label="Fermer" onClick={() => setShowSchedule(false)} type="button">×</button></header><div className="automatic-email-simulation-warning"><strong>SIMULATION SEULEMENT</strong><span>Aucun de ces courriels ne sera envoyé tant que les envois automatiques ne seront pas activés.</span></div><div className="automatic-email-schedule-list">{occurrences.map((item) => <article key={`${item.ruleId}:${item.occurrenceKey}`}><time>{formatDate(item.scheduledDate)} · {item.scheduledTime}</time><div><strong>{item.recipientName}</strong><span>{item.ruleName} · {item.brokerLabel}</span></div><span className={item.blockingReasons.length ? "blocked" : "ready"}>{item.blockingReasons.length ? "À compléter" : "Simulation prête"}</span></article>)}{occurrences.length === 0 && <p>Aucune occurrence potentielle dans les 30 prochains jours.</p>}</div><footer><button onClick={() => setShowSchedule(false)} type="button">FERMER</button></footer></section></div>}

  {confirmation && <div className="automatic-email-confirmation" role="status">✓ {confirmation}</div>}
  </main>;
}
