"use client";

import { useState } from "react";
import { Archive, Check, CloudOff, LoaderCircle, RotateCcw, Save } from "lucide-react";
import type { AnalysisStatus, MarketValueOpinion, ReportPreparerId } from "../../../types";
import { REPORT_PREPARERS } from "@/app/lib/tools/acm/features/analysis/preparers";
import type { SaveIndicatorState } from "../hooks/use-analysis-persistence";

interface AnalysisPersistenceBarProps {
  title: string;
  status: AnalysisStatus;
  saveState: SaveIndicatorState;
  lastSavedAt?: string;
  errorMessage: string;
  opinion: MarketValueOpinion;
  preparedBy: ReportPreparerId;
  onTitleChange: (title: string) => void;
  onSave: () => Promise<unknown>;
  onPreparedByChange: (preparedBy: ReportPreparerId) => void;
  onStatusChange: (status: AnalysisStatus) => Promise<unknown>;
}

const SAVE_LABELS: Record<SaveIndicatorState, string> = {
  dirty: "Modification…",
  saving: "Sauvegarde…",
  saved: "Analyse sauvegardée",
  error: "Sauvegarde impossible",
  unavailable: "Supabase à configurer",
};
const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = { draft: "Brouillon", completed: "Terminée", archived: "Archivée" };

function opinionIsComplete(opinion: MarketValueOpinion): boolean {
  return [opinion.minimumValue, opinion.maximumValue, opinion.recommendedValue]
    .every((value) => typeof value === "number" && Number.isFinite(value));
}

export function AnalysisPersistenceBar({
  title,
  status,
  saveState,
  lastSavedAt,
  errorMessage,
  opinion,
  preparedBy,
  onTitleChange,
  onSave,
  onPreparedByChange,
  onStatusChange,
}: AnalysisPersistenceBarProps) {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const isSaving = saveState === "saving";
  const savedTime = lastSavedAt ? new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit" }).format(new Date(lastSavedAt)) : null;

  return (
    <section className="analysis-persistence" aria-label="Sauvegarde de l’analyse">
      <label className="analysis-persistence__title">
        <span>Titre de l’analyse</span>
        <input value={title} onChange={(event) => onTitleChange(event.target.value)} />
        <small>Statut : {ANALYSIS_STATUS_LABELS[status]}</small>
      </label>
      <label className="analysis-persistence__preparer">
        <span>Préparé par</span>
        <select value={preparedBy} onChange={(event) => onPreparedByChange(event.target.value as ReportPreparerId)}>
          {REPORT_PREPARERS.map((preparer) => <option key={preparer.id} value={preparer.id}>{preparer.displayName.toUpperCase()}</option>)}
        </select>
      </label>
      <div className={`analysis-persistence__state analysis-persistence__state--${saveState}`} role="status">
        {isSaving ? <LoaderCircle className="spin" size={14} /> : saveState === "saved" ? <Check size={14} /> : saveState === "unavailable" ? <CloudOff size={14} /> : null}
        <span>{SAVE_LABELS[saveState]}</span>
        {savedTime && <small>Dernière sauvegarde : {savedTime}</small>}
      </div>
      <div className="analysis-persistence__actions">
        <button className="primary-button primary-button--compact" type="button" disabled={isSaving} onClick={() => void onSave()}>
          <Save size={15} /> Sauvegarder l’analyse
        </button>
        {status === "draft" && (
          <button className="secondary-button" type="button" disabled={!opinionIsComplete(opinion) || isSaving} onClick={() => void onStatusChange("completed")}>
            <Check size={15} /> Marquer comme terminée
          </button>
        )}
        {status === "archived" ? (
          <button className="secondary-button" type="button" disabled={isSaving} onClick={() => void onStatusChange("draft")}><RotateCcw size={15} /> Restaurer</button>
        ) : (
          <button className="secondary-button" type="button" disabled={isSaving} onClick={() => setConfirmArchive(true)}><Archive size={15} /> Archiver</button>
        )}
      </div>
      {confirmArchive && status !== "archived" && (
        <div className="analysis-persistence__confirmation" role="alert">
          <span>Archiver cette analyse sans la supprimer?</span>
          <button type="button" onClick={() => setConfirmArchive(false)}>Annuler</button>
          <button type="button" onClick={() => { setConfirmArchive(false); void onStatusChange("archived"); }}>Confirmer l’archivage</button>
        </div>
      )}
      {errorMessage && <p className="analysis-persistence__error" role="alert">{errorMessage}</p>}
    </section>
  );
}
