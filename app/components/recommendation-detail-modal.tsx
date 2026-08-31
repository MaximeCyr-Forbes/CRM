"use client";

import { useEffect, useRef } from "react";
import { BROKER_LABELS } from "../data/contact-types";
import {
  formatRecommendationDate,
  type CRMRecommendation,
} from "../data/recommendation-types";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

export function RecommendationDetailModal({
  recommendation,
  isCompleting,
  isDeleting,
  onClose,
  onCompletionChange,
  onDelete,
}: {
  recommendation: CRMRecommendation;
  isCompleting: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onCompletionChange: (isCompleted: boolean) => void;
  onDelete: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useDialogLifecycle(true, onClose);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  return (
    <div
      className="recommendation-detail-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      role="presentation"
    >
      <section
        aria-describedby="recommendation-detail-content"
        aria-labelledby="recommendation-detail-title"
        aria-modal="true"
        className="recommendation-detail-modal"
        role="dialog"
      >
        <header className="recommendation-detail-header">
          <div>
            <p className="section-kicker">Recommandation</p>
            <h2 id="recommendation-detail-title">{recommendation.title}</h2>
          </div>
          <button
            aria-label="Fermer la recommandation"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </header>

        {recommendation.isCompleted && (
          <div className="recommendation-detail-completed" role="status">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>FAIT</strong>
              <small>
                {recommendation.completedAt && recommendation.completedBy
                  ? `Terminée le ${formatRecommendationDate(recommendation.completedAt)} par ${BROKER_LABELS[recommendation.completedBy]}.`
                  : "Cette recommandation est traitée."}
              </small>
            </div>
          </div>
        )}

        <dl className="recommendation-detail-meta">
          <div>
            <dt>Soumise par</dt>
            <dd>{BROKER_LABELS[recommendation.submittedBy]}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{formatRecommendationDate(recommendation.createdAt)}</dd>
          </div>
        </dl>

        <div className="recommendation-detail-content" id="recommendation-detail-content">
          {recommendation.content}
        </div>

        <footer className="recommendation-detail-actions">
          <button
            className="destructive-button"
            disabled={isDeleting || isCompleting}
            onClick={onDelete}
            type="button"
          >
            {isDeleting ? "Suppression…" : "Supprimer"}
          </button>
          <button
            aria-label={recommendation.isCompleted
              ? "Remettre cette recommandation à faire"
              : "Marquer cette recommandation comme faite"}
            aria-busy={isCompleting}
            className={recommendation.isCompleted
              ? "recommendation-detail-reopen"
              : "recommendation-detail-complete"}
            disabled={isCompleting || isDeleting}
            onClick={() => onCompletionChange(!recommendation.isCompleted)}
            type="button"
          >
            {isCompleting ? "Traitement…" : recommendation.isCompleted ? "Remettre à faire" : "Fait"}
          </button>
          <button onClick={onClose} type="button">Fermer</button>
        </footer>
      </section>
    </div>
  );
}
