"use client";

import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";

interface DeleteAnalysisConfirmationProps {
  analysisLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteAnalysisConfirmation({ analysisLabel, busy, onCancel, onConfirm }: DeleteAnalysisConfirmationProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  return (
    <div className="analysis-delete-modal__overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <div className="analysis-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="analysis-delete-title" aria-describedby="analysis-delete-description">
        <div className="analysis-delete-modal__icon" aria-hidden="true"><Trash2 size={20} /></div>
        <div>
          <h2 id="analysis-delete-title">Supprimer cette analyse ?</h2>
          <p id="analysis-delete-description">Cette action est définitive. L’analyse et ses données sauvegardées seront supprimées.</p>
          <strong>{analysisLabel}</strong>
        </div>
        <div className="analysis-delete-modal__actions">
          <button ref={cancelButtonRef} type="button" disabled={busy} onClick={onCancel}>Annuler</button>
          <button className="analysis-delete-modal__confirm" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? "Suppression…" : "Supprimer définitivement"}
          </button>
        </div>
      </div>
    </div>
  );
}
