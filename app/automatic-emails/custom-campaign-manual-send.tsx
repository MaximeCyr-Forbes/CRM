"use client";

import { useEffect, useRef, useState } from "react";
import type { CustomEmailCampaignStep } from "../data/custom-email-campaign-types";
import type { ManualHistory, ManualPreview } from "../data/custom-email-manual-types";
import { BROKER_LABELS } from "../data/contact-types";

async function read<T>(response: Response): Promise<T> {
  const body = await response.json() as { data?: T; error?: string };
  if (!response.ok || body.data === undefined) throw new Error(body.error ?? "Opération indisponible.");
  return body.data;
}

export default function CustomCampaignManualSend({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const [steps, setSteps] = useState<CustomEmailCampaignStep[]>([]);
  const [stepId, setStepId] = useState("");
  const [preview, setPreview] = useState<ManualPreview | null>(null);
  const [history, setHistory] = useState<ManualHistory[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [contactId, setContactId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [checked, setChecked] = useState(false);
  const [retry, setRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const generation = useRef(0);
  const base = `/api/automatic-emails/custom-campaigns/${campaignId}`;

  async function load(id: string) {
    const current = ++generation.current;
    setLoading(true); setError(""); setPreview(null); setConfirm(false); setChecked(false);
    try {
      const [data, rows] = await Promise.all([
        fetch(`${base}/manual-send?stepId=${id}`, { cache: "no-store" }).then(read<ManualPreview>),
        fetch(`${base}/manual-send`, { cache: "no-store" }).then(read<ManualHistory[]>),
      ]);
      if (current !== generation.current) return;
      setPreview(data); setHistory(rows); setContactId(data.recipients[0]?.contactId ?? "");
      setSelected(data.recipients.filter((item) => !item.deliveryStatus).map((item) => item.contactId));
    } catch (reason) { if (current === generation.current) setError(reason instanceof Error ? reason.message : "Préparation impossible."); }
    finally { if (current === generation.current) setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    void fetch(base, { cache: "no-store" }).then(read<{ steps: CustomEmailCampaignStep[] }>).then((bundle) => {
      if (!active) return;
      setSteps(bundle.steps); setStepId(bundle.steps[0]?.id ?? "");
      if (bundle.steps[0]) void load(bundle.steps[0].id); else setLoading(false);
    }).catch(() => { if (active) { setError("Chargement impossible."); setLoading(false); } });
    return () => { active = false; generation.current++; };
  }, [campaignId]);

  const recipient = preview?.recipients.find((item) => item.contactId === contactId);
  const chosen = preview?.recipients.filter((item) => selected.includes(item.contactId)) ?? [];
  const ready = chosen.filter((item) => !item.blockingReasons.length && (retry ? item.deliveryStatus === "failed" : !item.deliveryStatus));
  const blocked = chosen.length - ready.length;
  const failed = preview?.recipients.filter((item) => item.deliveryStatus === "failed" && !item.blockingReasons.length) ?? [];

  function begin(isRetry: boolean) {
    setRetry(isRetry);
    if (isRetry) setSelected(failed.map((item) => item.contactId));
    setChecked(false); setConfirm(true);
  }

  async function send() {
    if (!preview || !checked || sending.current || !ready.length) return;
    sending.current = true; setBusy(true); setError("");
    const batchId = crypto.randomUUID();
    const attemptKey = crypto.randomUUID();
    const eligible = chosen.filter((item) => retry ? item.deliveryStatus === "failed" : !item.deliveryStatus);
    const ids = eligible.map((item) => item.contactId);
    const fingerprints = Object.fromEntries(eligible.map((item) => [item.contactId, item.fingerprint]));
    try {
      for (let offset = 0; offset < ids.length; offset += 3) {
        const rows = await read<ManualHistory[]>(await fetch(`${base}/manual-send`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: "ENVOYER", batchId, attemptKey, stepId: preview.stepId,
            contactIds: ids.slice(offset, offset + 3), fingerprints, retry }),
        }));
        setHistory(rows);
      }
      setConfirm(false); setChecked(false);
      await load(preview.stepId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Envoi interrompu. Consultez l’historique.");
      setConfirm(false); setChecked(false);
      try { setHistory(await read<ManualHistory[]>(await fetch(`${base}/manual-send`, { cache: "no-store" }))); } catch { /* Keep the visible interruption. */ }
      setPreview(null);
    } finally { sending.current = false; setBusy(false); }
  }

  return <div className="automatic-email-modal-backdrop" role="presentation"><section className="automatic-email-modal custom-campaign-preview" role="dialog" aria-modal="true" aria-labelledby="manual-send-title">
    <header><div><p className="section-kicker">Aucun envoi automatique</p><h2 id="manual-send-title">{preview?.campaignName ?? "ENVOI MANUEL"}</h2></div><button disabled={busy} aria-label="Fermer" onClick={onClose} type="button">×</button></header>
    <div className="custom-campaign-editor-body">
      {error && <p role="alert">{error}</p>}
      <label>Étape à envoyer<select disabled={busy || confirm} value={stepId} onChange={(event) => { setStepId(event.target.value); setRetry(false); void load(event.target.value); }}>{steps.map((step) => <option key={step.id} value={step.id}>Courriel {step.stepOrder} — {step.subjectTemplate}</option>)}</select></label>
      <p>Chaque étape exige un envoi manuel distinct. Les dates, heures et délais de simulation ne déclenchent rien.</p>
      <button disabled={busy || loading} onClick={() => void load(stepId)} type="button">ACTUALISER L’APERÇU ET L’HISTORIQUE</button>
      {loading && <p role="status">Vérification des Contacts et des signatures Gmail…</p>}
      {preview && <>
        <label>Prévisualisation pour<select disabled={busy} value={contactId} onChange={(event) => setContactId(event.target.value)}>{preview.recipients.map((item) => <option key={item.contactId} value={item.contactId}>{item.name || item.to}</option>)}</select></label>
        {recipient && <article><p><strong>De :</strong> {recipient.senderName} &lt;{recipient.senderEmail}&gt;</p><p><strong>À :</strong> {recipient.to}</p><p><strong>Objet :</strong> {recipient.subject}</p>{recipient.html && <iframe title="Message avec signature Gmail réelle" sandbox="" referrerPolicy="no-referrer" srcDoc={recipient.html} style={{ width: "100%", height: 300, border: "1px solid #ddd", background: "white" }} />}<p>{recipient.blockingReasons.join(" ")}</p></article>}
        <div className="custom-campaign-contact-list">{preview.recipients.map((item) => <label key={item.contactId}><input type="checkbox" disabled={busy || confirm || !!item.deliveryStatus} checked={selected.includes(item.contactId)} onChange={(event) => { setRetry(false); setSelected(event.target.checked ? [...selected, item.contactId] : selected.filter((id) => id !== item.contactId)); }} /><span>{item.name} · {item.to}<small>{item.broker ? BROKER_LABELS[item.broker] : "Sans courtier"} · {item.deliveryStatus ?? (item.blockingReasons.length ? "BLOQUÉ" : "PRÊT")}{item.blockingReasons.length > 0 && ` · ${item.blockingReasons.join(" ")}`}</small></span></label>)}</div>
        {!confirm ? <div><button disabled={busy || !chosen.some((item) => !item.deliveryStatus && !item.blockingReasons.length)} onClick={() => begin(false)} type="button">ENVOYER MAINTENANT</button><button disabled={busy || !failed.length} onClick={() => begin(true)} type="button">RÉESSAYER MANUELLEMENT LES ÉCHECS</button></div> : <section aria-label="Confirmation de l’envoi manuel"><h3>CONFIRMER L’ENVOI IMMÉDIAT</h3><p>{preview.campaignName} · Courriel {preview.stepOrder}</p><p>{ready.length} destinataire(s) prêt(s) · {blocked} bloqué(s), exclus de l’envoi.</p><p>{(["maxime", "france", "sandrine"] as const).map((broker) => `${BROKER_LABELS[broker]} : ${ready.filter((item) => item.broker === broker).length}`).join(" · ")}</p><label><input checked={checked} disabled={busy} type="checkbox" onChange={(event) => setChecked(event.target.checked)} />Je confirme l’envoi manuel immédiat</label><button disabled={!checked || busy || !ready.length} onClick={() => void send()} type="button">{busy ? "ENVOI EN COURS…" : `ENVOYER ${ready.length} COURRIELS MAINTENANT`}</button><button disabled={busy} onClick={() => setConfirm(false)} type="button">ANNULER</button></section>}
      </>}
      <h3>HISTORIQUE DES ENVOIS MANUELS</h3><p>{history.filter((row) => row.status === "sent").length} envoyé(s) · {history.filter((row) => row.status === "failed").length} échec(s) · {history.filter((row) => row.status === "pending").length} en cours / à vérifier · {history.filter((row) => row.status === "blocked").length} bloqué(s)</p>
      {history.map((row) => <p key={row.id}>{row.recipient_email} · {row.broker ? BROKER_LABELS[row.broker] : "Sans courtier"} · {row.status} · {row.error ?? row.gmail_message_id}</p>)}
    </div><footer><button disabled={busy} onClick={onClose} type="button">FERMER</button></footer>
  </section></div>;
}
