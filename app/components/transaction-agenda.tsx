"use client";
import { useEffect, useRef, useState } from "react";
import type { TransactionDeadline } from "../data/transaction-types";
import { compareTransactionDeadlines, formatTransactionDeadlineTime } from "../lib/transactions/deadline-time";
import { agendaState, CONFIDENCE_LABELS } from "../lib/transactions/oaciq-agenda";

export function TransactionAgenda({ deadlines, disabled, onAdd, onEdit, onComplete, onDelete }: {
  deadlines: TransactionDeadline[]; disabled: boolean; onAdd: () => void;
  onEdit: (deadline: TransactionDeadline) => void;
  onComplete: (deadline: TransactionDeadline, completed: boolean) => Promise<unknown>;
  onDelete: (deadline: TransactionDeadline) => Promise<unknown>;
}) {
  const [now, setNow] = useState(() => new Date());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer); }, []);
  async function change(action: () => Promise<unknown>) {
    if (busy.current || disabled) return;
    busy.current = true;
    setPending(true); setError(null);
    try { await action(); } catch { setError("La modification de l’échéance a échoué. Réessayez."); } finally { busy.current = false; setPending(false); }
  }
  return <section className="transaction-detail-section" aria-labelledby="transaction-deadlines-title">
    <div className="transaction-section-heading"><div><p className="section-kicker">Suivi du dossier</p><h2 id="transaction-deadlines-title">AGENDA DE LA TRANSACTION</h2></div><button className="transaction-add-deadline" disabled={disabled} onClick={onAdd} type="button">+ Ajouter une échéance</button></div>
    {error && <p role="alert" className="transaction-form-error">{error}</p>}
    <div className="transaction-deadlines">{[...deadlines].sort(compareTransactionDeadlines).map((deadline) => {
      const state = agendaState(deadline, now);
      const time = formatTransactionDeadlineTime(deadline.dueTime);
      const date = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${deadline.dueDate}T12:00:00Z`));
      const source = deadline.source;
      return <article className={deadline.completed ? "deadline-completed" : ""} key={deadline.id}>
        <label><input aria-label={`Fait : ${deadline.title}`} checked={deadline.completed} disabled={pending || disabled} onChange={(e) => void change(() => onComplete(deadline, e.target.checked))} type="checkbox" /><span aria-hidden="true" /></label>
        <div><div className="deadline-title-line"><h3>{deadline.title}</h3><strong className={state === "FAIT" ? "agenda-done" : state === "EN RETARD" ? "agenda-overdue" : "agenda-upcoming"}>{state}</strong></div><p>{date}{time ? ` · ${time}` : ""}</p>
          <small className={`calendar-deadline-state calendar-${deadline.googleCalendarSyncStatus}`}>{deadline.googleCalendarEventId ? `Google Agenda · ${deadline.googleCalendarSyncStatus === "synced" ? "Synchronisé" : deadline.googleCalendarLastError ?? "En attente"}` : deadline.googleCalendarSyncStatus === "pending" || deadline.googleCalendarSyncStatus === "error" ? deadline.googleCalendarLastError ?? "Synchronisation Google en attente" : "Agenda interne · Non envoyé à Google"}</small>
          {source?.type === "oaciq" && <div className="oaciq-source"><span>Source : {[source.form, source.section && `clause ${source.section}`, source.document].filter(Boolean).join(" · ")}</span>{source.confidence && <span>Confiance : {CONFIDENCE_LABELS[source.confidence]}</span>}</div>}
          {source?.text && <details><summary>Voir la source</summary><p className="oaciq-source-text">{source.text}</p></details>}
        </div>
        <div className="deadline-actions"><button disabled={pending || disabled} onClick={() => onEdit(deadline)} type="button">Modifier</button><button className="destructive-button" disabled={pending || disabled} onClick={() => { if (window.confirm("Supprimer cette échéance ?")) void change(() => onDelete(deadline)); }} type="button">Supprimer</button></div>
      </article>;
    })}{!deadlines.length && <div className="transaction-section-empty">Aucune échéance pour le moment.</div>}</div>
  </section>;
}
