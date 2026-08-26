"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CRMRecommendation } from "../data/recommendation-types";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

export function RecommendationDeleteConfirmationModal({
  recommendation,
  isDeleting,
  onClose,
  onConfirm,
}: {
  recommendation: CRMRecommendation;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeIfIdle = useCallback(() => {
    if (!isDeleting) onClose();
  }, [isDeleting, onClose]);
  useDialogLifecycle(true, closeIfIdle);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  async function confirm() {
    if (isDeleting) return;
    setError(null);
    try {
      await onConfirm();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "La recommandation n’a pas pu être supprimée. Réessayez.",
      );
    }
  }

  return (
    <div
      className="listing-editor-backdrop recommendation-delete-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && closeIfIdle()}
      role="presentation"
    >
      <section
        aria-labelledby="recommendation-delete-title"
        aria-modal="true"
        className="listing-delete-modal recommendation-delete-modal"
        role="alertdialog"
      >
        <header className="listing-editor-heading">
          <div>
            <p className="section-kicker">Action irréversible</p>
            <h2 id="recommendation-delete-title">SUPPRIMER CETTE RECOMMANDATION ?</h2>
          </div>
          <button aria-label="Fermer" disabled={isDeleting} onClick={closeIfIdle} ref={closeButtonRef} type="button">×</button>
        </header>
        <div className="listing-delete-content">
          <strong>« {recommendation.title} »</strong>
          <p>Cette action est définitive.</p>
          {error && <p className="listing-editor-error" role="alert">{error}</p>}
        </div>
        <footer className="listing-delete-actions">
          <button disabled={isDeleting} onClick={closeIfIdle} type="button">Annuler</button>
          <button
            aria-busy={isDeleting}
            className="destructive-button"
            disabled={isDeleting}
            onClick={() => void confirm()}
            type="button"
          >
            {isDeleting ? "Suppression…" : "Supprimer"}
          </button>
        </footer>
      </section>
    </div>
  );
}
