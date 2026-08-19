"use client";

import { useState, type FormEvent } from "react";
import { LISTING_INTEREST_LABELS, type ListingVisit, type ListingVisitDraft } from "../data/listing-types";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

function initialDraft(visit: ListingVisit | null): ListingVisitDraft {
  return visit ? {
    visitDate: visit.visitDate, visitTime: visit.visitTime,
    visitingBrokerName: visit.visitingBrokerName, visitingBrokerAgency: visit.visitingBrokerAgency,
    buyerNames: visit.buyerNames, feedback: visit.feedback, interestLevel: visit.interestLevel,
  } : {
    visitDate: new Date().toISOString().slice(0, 10), visitTime: null,
    visitingBrokerName: "", visitingBrokerAgency: "", buyerNames: "", feedback: "", interestLevel: null,
  };
}

export function ListingVisitModal({ visit, isSaving, onClose, onSave }: {
  visit: ListingVisit | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (draft: ListingVisitDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => initialDraft(visit));
  const [error, setError] = useState<string | null>(null);
  useDialogLifecycle(true, onClose);
  const update = <K extends keyof ListingVisitDraft>(field: K, value: ListingVisitDraft[K]) => setDraft((current) => ({ ...current, [field]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!draft.visitDate) { setError("La date de visite est obligatoire."); return; }
    try { await onSave(draft); } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Enregistrement de la visite impossible.");
    }
  }

  return (
    <div className="listing-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="listing-visit-title" aria-modal="true" className="listing-visit-modal" role="dialog">
        <header className="listing-editor-heading"><div><p className="section-kicker">Suivi de mise en marché</p><h2 id="listing-visit-title">{visit ? "MODIFIER LA VISITE" : "AJOUTER UNE VISITE"}</h2></div><button aria-label="Fermer" onClick={onClose} type="button">×</button></header>
        <form className="listing-visit-form" onSubmit={submit}>
          <div className="listing-visit-fields">
            <label><span>Date *</span><input autoFocus required type="date" value={draft.visitDate} onChange={(event) => update("visitDate", event.target.value)} /></label>
            <label><span>Heure</span><input type="time" value={draft.visitTime ?? ""} onChange={(event) => update("visitTime", event.target.value || null)} /></label>
            <label><span>Courtier visiteur</span><input value={draft.visitingBrokerName} onChange={(event) => update("visitingBrokerName", event.target.value)} /></label>
            <label><span>Agence</span><input value={draft.visitingBrokerAgency} onChange={(event) => update("visitingBrokerAgency", event.target.value)} /></label>
            <label className="listing-visit-wide"><span>Acheteurs / visiteurs</span><input value={draft.buyerNames} onChange={(event) => update("buyerNames", event.target.value)} /></label>
            <label><span>Niveau d’intérêt</span><select value={draft.interestLevel ?? ""} onChange={(event) => update("interestLevel", event.target.value ? event.target.value as ListingVisitDraft["interestLevel"] : null)}><option value="">Non précisé</option>{Object.entries(LISTING_INTEREST_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="listing-visit-wide"><span>Commentaires / feedback</span><textarea rows={5} value={draft.feedback} onChange={(event) => update("feedback", event.target.value)} /></label>
          </div>
          {error && <p className="listing-editor-error" role="alert">{error}</p>}
          <footer className="listing-visit-actions"><button onClick={onClose} type="button">Annuler</button><button className="listing-submit" disabled={isSaving} type="submit">{isSaving ? "Enregistrement…" : "Enregistrer"}</button></footer>
        </form>
      </section>
    </div>
  );
}
