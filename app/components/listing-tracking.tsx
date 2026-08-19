"use client";

import { useMemo, useState, type FormEvent } from "react";
import { BROKER_LABELS } from "../data/contact-types";
import { LISTING_INTEREST_LABELS, type ListingVisit } from "../data/listing-types";
import { useListingTracking } from "../lib/listings/use-listing-tracking";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";
import { ListingVisitModal } from "./listing-visit-modal";

const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const displayDate = (value: string) => date.format(new Date(`${value.slice(0, 10)}T12:00:00Z`));

function VisitDeleteModal({ visit, isSaving, onClose, onConfirm }: { visit: ListingVisit; isSaving: boolean; onClose: () => void; onConfirm: () => Promise<void> }) {
  useDialogLifecycle(true, onClose);
  return <div className="listing-editor-backdrop" role="presentation"><section aria-labelledby="delete-visit-title" aria-modal="true" className="listing-delete-modal" role="dialog"><header className="listing-editor-heading"><div><p className="section-kicker">Action irréversible</p><h2 id="delete-visit-title">SUPPRIMER CETTE VISITE ?</h2></div><button aria-label="Fermer" onClick={onClose} type="button">×</button></header><div className="listing-delete-content"><strong>{displayDate(visit.visitDate)}</strong><p>Cette visite et son feedback seront retirés du suivi.</p></div><footer className="listing-delete-actions"><button onClick={onClose} type="button">Annuler</button><button className="destructive-button" disabled={isSaving} onClick={() => void onConfirm()} type="button">{isSaving ? "Suppression…" : "Supprimer"}</button></footer></section></div>;
}

export function ListingTracking({ listingId }: { listingId: string }) {
  const tracking = useListingTracking(listingId);
  const [newTask, setNewTask] = useState("");
  const [editingTask, setEditingTask] = useState<{ id: string; title: string } | null>(null);
  const [visitModal, setVisitModal] = useState<ListingVisit | "new" | null>(null);
  const [deletingVisit, setDeletingVisit] = useState<ListingVisit | null>(null);
  const completed = tracking.data.tasks.filter((task) => task.completed).length;
  const visitSummary = useMemo(() => ({
    high: tracking.data.visits.filter((visit) => visit.interestLevel === "high").length,
    medium: tracking.data.visits.filter((visit) => visit.interestLevel === "medium").length,
    low: tracking.data.visits.filter((visit) => visit.interestLevel === "low").length,
  }), [tracking.data.visits]);

  async function addTask(event: FormEvent) {
    event.preventDefault();
    if (!newTask.trim()) return;
    await tracking.addTask(newTask);
    setNewTask("");
  }

  if (tracking.isLoading) return <section className="listing-detail-section listing-tracking-state" aria-live="polite">Chargement du suivi de mise en marché…</section>;
  if (tracking.error && tracking.data.tasks.length === 0) return <section className="listing-detail-section listing-tracking-state" role="alert"><span>{tracking.error}</span><button onClick={() => void tracking.retry()} type="button">Réessayer</button></section>;

  return (
    <section className="listing-detail-section listing-tracking" aria-labelledby="listing-tracking-title">
      <div className="listing-detail-section-heading"><div><p className="section-kicker">Pilotage du mandat</p><h2 id="listing-tracking-title">SUIVI DE MISE EN MARCHÉ</h2></div></div>
      {tracking.error && <p className="listing-editor-error" role="alert">{tracking.error}</p>}

      <div className="listing-tracking-grid">
        <section className="listing-tracking-panel listing-checklist" aria-labelledby="listing-checklist-title">
          <header><div><span>Checklist</span><h3 id="listing-checklist-title">MISE EN MARCHÉ</h3></div><strong>{completed} / {tracking.data.tasks.length}</strong></header>
          <div className="listing-checklist-progress" aria-label={`${completed} tâches complétées sur ${tracking.data.tasks.length}`}><span style={{ width: `${tracking.data.tasks.length ? Math.round(completed / tracking.data.tasks.length * 100) : 0}%` }} /></div>
          <div className="listing-task-list">
            {tracking.data.tasks.map((task) => <article className={task.completed ? "listing-task-completed" : ""} key={task.id}>
              <label><input checked={task.completed} disabled={tracking.isSaving} onChange={() => void tracking.toggleTask(task.id, !task.completed)} type="checkbox" /><span><strong>{task.title}</strong>{task.completedAt && <small>Complétée{task.completedBy ? ` par ${BROKER_LABELS[task.completedBy]}` : ""} · {displayDate(task.completedAt)}</small>}</span></label>
              {task.isCustom && <div><button aria-label={`Modifier ${task.title}`} onClick={() => setEditingTask({ id: task.id, title: task.title })} type="button">✎</button><button aria-label={`Supprimer ${task.title}`} className="listing-task-delete" onClick={() => window.confirm("Supprimer cette tâche personnalisée ?") && void tracking.deleteTask(task.id)} type="button">⌫</button></div>}
            </article>)}
          </div>
          {editingTask && <form className="listing-task-form" onSubmit={(event) => { event.preventDefault(); void tracking.updateTask(editingTask.id, editingTask.title).then(() => setEditingTask(null)); }}><input aria-label="Titre de la tâche" autoFocus value={editingTask.title} onChange={(event) => setEditingTask({ ...editingTask, title: event.target.value })} /><button type="submit">Enregistrer</button><button onClick={() => setEditingTask(null)} type="button">Annuler</button></form>}
          <form className="listing-task-form" onSubmit={(event) => void addTask(event)}><input aria-label="Nouvelle tâche personnalisée" placeholder="Nouvelle tâche personnalisée" value={newTask} onChange={(event) => setNewTask(event.target.value)} /><button disabled={tracking.isSaving || !newTask.trim()} type="submit">+ Ajouter une tâche</button></form>
        </section>

        <section className="listing-tracking-panel listing-visits" aria-labelledby="listing-visits-title">
          <header><div><span>Rétroaction acheteurs</span><h3 id="listing-visits-title">VISITES</h3></div><button onClick={() => setVisitModal("new")} type="button">+ Ajouter une visite</button></header>
          <div className="listing-visit-summary"><strong>{tracking.data.visits.length} {tracking.data.visits.length === 1 ? "visite" : "visites"}</strong><span>{visitSummary.high} fort · {visitSummary.medium} moyen · {visitSummary.low} faible</span></div>
          <div className="listing-visit-list">
            {tracking.data.visits.map((visit) => <article key={visit.id}>
              <header><strong>{displayDate(visit.visitDate)}{visit.visitTime ? ` · ${visit.visitTime}` : ""}</strong><div><button aria-label="Modifier la visite" onClick={() => setVisitModal(visit)} type="button">✎</button><button aria-label="Supprimer la visite" className="listing-task-delete" onClick={() => setDeletingVisit(visit)} type="button">⌫</button></div></header>
              {(visit.visitingBrokerName || visit.visitingBrokerAgency) && <p><span>Courtier</span>{[visit.visitingBrokerName, visit.visitingBrokerAgency].filter(Boolean).join(" — ")}</p>}
              {visit.buyerNames && <p><span>Acheteurs</span>{visit.buyerNames}</p>}
              {visit.interestLevel && <strong className={`listing-interest listing-interest-${visit.interestLevel}`}>Intérêt {LISTING_INTEREST_LABELS[visit.interestLevel]}</strong>}
              {visit.feedback && <blockquote>{visit.feedback}</blockquote>}
            </article>)}
            {tracking.data.visits.length === 0 && <p className="listing-detail-empty">Aucune visite enregistrée pour le moment.</p>}
          </div>
        </section>

        <section className="listing-tracking-panel" aria-labelledby="listing-price-history-title">
          <header><div><span>Évolution du mandat</span><h3 id="listing-price-history-title">HISTORIQUE DE PRIX</h3></div></header>
          <div className="listing-price-history">{tracking.data.priceHistory.map((entry) => <article key={entry.id}><span>{displayDate(entry.changedAt)}</span><strong>{entry.amount === null ? "Non renseigné" : `${money.format(entry.amount)}${entry.purpose === "rental" ? " / mois" : ""}`}</strong><small>{entry.purpose === "sale" ? "Vente" : "Location"}</small></article>)}{tracking.data.priceHistory.length === 0 && <p className="listing-detail-empty">Aucun historique de prix ou de loyer.</p>}</div>
        </section>

        <section className="listing-tracking-panel" aria-labelledby="listing-activity-title">
          <header><div><span>Journal automatique</span><h3 id="listing-activity-title">ACTIVITÉ</h3></div></header>
          <div className="listing-activity-list">{tracking.data.activity.map((entry) => <article key={entry.id}><time>{dateTime.format(new Date(entry.createdAt))}</time><div><strong>{entry.title}</strong>{entry.detail && <p>{entry.detail}</p>}{entry.actorBroker && <small>{BROKER_LABELS[entry.actorBroker]}</small>}</div></article>)}{tracking.data.activity.length === 0 && <p className="listing-detail-empty">Aucune activité pour le moment.</p>}</div>
        </section>
      </div>

      {visitModal && <ListingVisitModal visit={visitModal === "new" ? null : visitModal} isSaving={tracking.isSaving} onClose={() => setVisitModal(null)} onSave={async (draft) => { if (visitModal === "new") await tracking.addVisit(draft); else await tracking.updateVisit(visitModal.id, draft); setVisitModal(null); }} />}
      {deletingVisit && <VisitDeleteModal visit={deletingVisit} isSaving={tracking.isSaving} onClose={() => setDeletingVisit(null)} onConfirm={async () => { await tracking.deleteVisit(deletingVisit.id); setDeletingVisit(null); }} />}
    </section>
  );
}
