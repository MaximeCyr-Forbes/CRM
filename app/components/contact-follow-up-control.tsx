"use client";
import { useRef, useState } from "react";
import type { Contact } from "../data/contact-types";
import { BROKER_LABELS } from "../data/contact-types";
import { formatFollowUpCompletionTime, type ContactFollowUpCompletion } from "../data/contact-follow-up-types";
import { useFollowUps } from "../follow-up-context";
import { useCRMData } from "../crm-data-context";
import { formatFollowUpDate } from "../lib/follow-up";

export function ContactFollowUpControl({ contact, history, historyError, onRefresh, onSchedule }: {
  contact: Contact; history: ContactFollowUpCompletion[]; historyError: string | null;
  onRefresh: () => Promise<void>; onSchedule: () => void;
}) {
  const { completeFollowUp } = useFollowUps();
  const { retry } = useCRMData();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState(false);
  const latest = history.find(item => !item.reverted_at);
  const failed = history.filter(item => item.google_sync_status !== "synced");
  async function act(action: "complete" | "revert" | "retry", completionId?: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      let result;
      if (action === "complete") result = await completeFollowUp(contact.id);
      else {
        const response = await fetch(`/api/contacts/${contact.id}/follow-up-completions`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, completionId }),
        });
        result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Confirmation impossible.");
        await retry();
      }
      setUndo(false);
      setMessage(action === "complete" ? "SUIVI ENREGISTRÉ ✓" : action === "revert" ? "Confirmation annulée · historique conservé." : result.calendarSync.message);
      if (result.calendarSync.status === "error") setError(result.calendarSync.message);
      await onRefresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Opération impossible."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="contact-follow-up-completion">
    {contact.nextFollowUpDate && <label className="follow-up-complete-check">
      <input type="checkbox" checked={false} disabled={busy} onChange={() => void act("complete")} />
      {busy ? "Enregistrement…" : "SUIVI EFFECTUÉ"}
    </label>}
    {historyError ? <p role="alert">{historyError}</p> : latest ? <div className="info-group">
      <span>✓ Dernier suivi effectué</span>
      <strong>{formatFollowUpCompletionTime(latest.completed_at)}</strong>
      <small>Par {BROKER_LABELS[latest.completed_by_broker as keyof typeof BROKER_LABELS] ?? latest.completed_by_broker}</small>
      <button type="button" disabled={busy} onClick={() => setUndo(true)}>Annuler la confirmation</button>
    </div> : <p>Aucun suivi effectué enregistré.</p>}
    {undo && latest && <div role="group" aria-label="Confirmer l’annulation du suivi">
      <p>Annuler cette confirmation ? L’historique sera conservé. {contact.nextFollowUpDate ? "La nouvelle relance restera inchangée." : `La relance du ${formatFollowUpDate(latest.scheduled_for)} pourra être restaurée si aucun suivi plus récent n’existe.`}</p>
      <button type="button" disabled={busy} onClick={() => void act("revert", latest.id)}>Confirmer l’annulation</button>
      <button type="button" disabled={busy} onClick={() => setUndo(false)}>Conserver la confirmation</button>
    </div>}
    {message && <div role="status"><p>{message}</p>{!contact.nextFollowUpDate && <button type="button" disabled={busy} onClick={onSchedule}>Programmer la prochaine relance</button>}</div>}
    {error && <p role="alert">{error}</p>}
    {failed.map(item => <div key={item.id} className="calendar-sync-state calendar-sync-error">
      <span>Google Agenda · suivi du {formatFollowUpDate(item.scheduled_for)}</span>
      <strong>{item.google_sync_error ?? "Retrait de l’événement en attente."}</strong>
      <button type="button" disabled={busy} onClick={() => void act("retry", item.id)}>Réessayer le retrait Google</button>
    </div>)}
  </div>;
}
