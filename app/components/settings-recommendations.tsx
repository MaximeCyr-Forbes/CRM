"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type Broker, useBroker } from "../broker-context";
import { BROKER_LABELS } from "../data/contact-types";
import {
  acquireRecommendationCompletionLock,
  acquireRecommendationDeletionLock,
  acquireRecommendationSubmissionLock,
  formatRecommendationDate,
  releaseRecommendationCompletionLock,
  releaseRecommendationDeletionLock,
  releaseRecommendationSubmissionLock,
  sortRecommendations,
  validateRecommendationText,
  type CRMRecommendation,
  type RecommendationAuthor,
} from "../data/recommendation-types";
import { RecommendationDeleteConfirmationModal } from "./recommendation-delete-confirmation-modal";
import { RecommendationDetailModal } from "./recommendation-detail-modal";

const BROKER_KEYS: Record<Broker, RecommendationAuthor> = {
  France: "france",
  Maxime: "maxime",
  Sandrine: "sandrine",
};

export function SettingsRecommendations() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedBroker } = useBroker();
  const linkedRecommendationId = searchParams.get("recommendation");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const [recommendations, setRecommendations] = useState<CRMRecommendation[]>([]);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [reloadAdminKey, setReloadAdminKey] = useState(0);
  const [openedRecommendation, setOpenedRecommendation] = useState<CRMRecommendation | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<CRMRecommendation | null>(null);
  const [completingRecommendationId, setCompletingRecommendationId] = useState<string | null>(null);
  const [completionConfirmation, setCompletionConfirmation] = useState(false);
  const [deletingRecommendationId, setDeletingRecommendationId] = useState<string | null>(null);
  const [deletionConfirmation, setDeletionConfirmation] = useState(false);
  const deletionLock = useRef<string | null>(null);
  const completionLock = useRef<string | null>(null);
  const openedDeepLinkRef = useRef<string | null>(null);

  const submittedBy = selectedBroker ? BROKER_KEYS[selectedBroker] : null;
  // TODO : remplacer cette vérification d’affichage par un vrai rôle utilisateur
  // lorsque l’authentification individuelle sera ajoutée.
  const showAdministration = selectedBroker === "Maxime";

  useEffect(() => {
    if (!showAdministration) {
      setRecommendations([]);
      setAdminError(null);
      setIsLoadingAdmin(false);
      setOpenedRecommendation(null);
      setPendingDeletion(null);
      setCompletionConfirmation(false);
      setDeletionConfirmation(false);
      return;
    }

    let isCurrent = true;
    setIsLoadingAdmin(true);
    setAdminError(null);
    void fetch("/api/recommendations", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Chargement impossible");
        return response.json() as Promise<{ data: CRMRecommendation[] }>;
      })
      .then((payload) => {
        if (isCurrent) setRecommendations(sortRecommendations(payload.data));
      })
      .catch(() => {
        if (isCurrent) setAdminError("Les recommandations n’ont pas pu être chargées.");
      })
      .finally(() => {
        if (isCurrent) setIsLoadingAdmin(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [reloadAdminKey, showAdministration]);

  useEffect(() => {
    if (
      !showAdministration
      || isLoadingAdmin
      || !linkedRecommendationId
      || openedDeepLinkRef.current === linkedRecommendationId
    ) return;
    const recommendation = recommendations.find((item) => item.id === linkedRecommendationId);
    if (!recommendation) return;
    openedDeepLinkRef.current = linkedRecommendationId;
    void openRecommendation(recommendation);
  }, [isLoadingAdmin, linkedRecommendationId, recommendations, showAdministration]);

  async function submitRecommendation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmation(false);
    const validationError = validateRecommendationText(title, content);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    if (!submittedBy) {
      setFormError("Sélectionnez d’abord le courtier consulté pour envoyer une recommandation.");
      return;
    }
    if (!acquireRecommendationSubmissionLock(submissionLock)) return;

    setIsSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, submittedBy }),
      });
      const payload = await response.json().catch(() => null) as {
        data?: CRMRecommendation;
      } | null;
      if (!response.ok || !payload?.data) throw new Error("Envoi impossible");

      setTitle("");
      setContent("");
      setConfirmation(true);
      if (showAdministration) {
        setRecommendations((current) => sortRecommendations([payload.data!, ...current]));
      }
    } catch {
      setFormError("La recommandation n’a pas pu être envoyée. Réessayez.");
    } finally {
      releaseRecommendationSubmissionLock(submissionLock);
      setIsSubmitting(false);
    }
  }

  async function openRecommendation(recommendation: CRMRecommendation) {
    setCompletionConfirmation(false);
    setOpenedRecommendation(recommendation);
    if (recommendation.status === "read") return;
    setAdminError(null);
    try {
      const response = await fetch(`/api/recommendations/${recommendation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read" }),
      });
      const payload = await response.json().catch(() => null) as {
        data?: CRMRecommendation;
      } | null;
      if (!response.ok || !payload?.data) throw new Error("Ouverture impossible");
      const updated = payload.data;
      setRecommendations((current) => sortRecommendations(
        current.map((item) => item.id === updated.id ? updated : item),
      ));
      setOpenedRecommendation(updated);
    } catch {
      setAdminError("La recommandation n’a pas pu être marquée comme lue.");
    }
  }

  function clearRecommendationDeepLink() {
    if (!searchParams.has("recommendation")) {
      openedDeepLinkRef.current = null;
      return;
    }
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete("recommendation");
    openedDeepLinkRef.current = null;
    const query = nextSearchParams.toString();
    router.replace(query ? `/settings?${query}` : "/settings", { scroll: false });
  }

  function closeRecommendationDetail() {
    setOpenedRecommendation(null);
    clearRecommendationDeepLink();
  }

  function requestRecommendationDeletion(recommendation: CRMRecommendation) {
    setAdminError(null);
    setDeletionConfirmation(false);
    setPendingDeletion(recommendation);
  }

  async function completeRecommendation(recommendation: CRMRecommendation) {
    if (
      recommendation.isCompleted
      || deletionLock.current !== null
      || !acquireRecommendationCompletionLock(completionLock, recommendation.id)
    ) return;

    setCompletingRecommendationId(recommendation.id);
    setCompletionConfirmation(false);
    setAdminError(null);
    try {
      const response = await fetch(`/api/recommendations/${recommendation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const payload = await response.json().catch(() => null) as {
        data?: CRMRecommendation;
      } | null;
      if (!response.ok || !payload?.data?.isCompleted) throw new Error("Traitement impossible");

      const updated = payload.data;
      setRecommendations((current) => sortRecommendations(
        current.map((item) => item.id === updated.id ? updated : item),
      ));
      setOpenedRecommendation((current) => current?.id === updated.id ? updated : current);
      setCompletionConfirmation(true);
    } catch {
      setAdminError("La recommandation n’a pas pu être marquée comme faite. Réessayez.");
    } finally {
      releaseRecommendationCompletionLock(completionLock);
      setCompletingRecommendationId(null);
    }
  }

  async function deleteRecommendation(recommendationId: string) {
    if (completionLock.current !== null) return;
    if (!acquireRecommendationDeletionLock(deletionLock, recommendationId)) return;
    setDeletingRecommendationId(recommendationId);
    try {
      const response = await fetch(`/api/recommendations/${recommendationId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json().catch(() => null) as {
        data?: { recommendationId?: string };
      } | null;
      if (!response.ok || payload?.data?.recommendationId !== recommendationId) {
        throw new Error("Suppression impossible");
      }

      setRecommendations((current) => current.filter((item) => item.id !== recommendationId));
      setOpenedRecommendation(null);
      setPendingDeletion(null);
      setDeletionConfirmation(true);
      clearRecommendationDeepLink();
    } catch {
      throw new Error("La recommandation n’a pas pu être supprimée. Réessayez.");
    } finally {
      releaseRecommendationDeletionLock(deletionLock);
      setDeletingRecommendationId(null);
    }
  }

  const unreadCount = recommendations.filter(
    (recommendation) => recommendation.status === "unread" && !recommendation.isCompleted,
  ).length;

  return (
    <section className="settings-recommendations" aria-labelledby="recommendations-title">
      <header className="settings-recommendations-heading">
        <p className="section-kicker">Amélioration du CRM</p>
        <h2 id="recommendations-title">RECOMMANDATIONS</h2>
        <p>Vous avez une idée pour améliorer le CRM? Envoyez-la directement à l’administration.</p>
      </header>

      <article className="recommendation-submit-card">
        <form className="recommendation-form" noValidate onSubmit={submitRecommendation}>
          <label>
            <span>Titre *</span>
            <input
              maxLength={120}
              onChange={(event) => { setTitle(event.target.value); setFormError(null); setConfirmation(false); }}
              placeholder="Titre de la recommandation"
              type="text"
              value={title}
            />
          </label>
          <label>
            <span>Recommandation *</span>
            <textarea
              maxLength={4000}
              onChange={(event) => { setContent(event.target.value); setFormError(null); setConfirmation(false); }}
              placeholder="Décrivez votre suggestion..."
              rows={7}
              value={content}
            />
            <small>{content.length} / 4000</small>
          </label>

          {!selectedBroker && (
            <p className="recommendation-broker-required">
              Sélectionnez d’abord le courtier consulté pour envoyer une recommandation.
            </p>
          )}
          {formError && <p className="recommendation-form-error" role="alert">{formError}</p>}
          {confirmation && (
            <div className="recommendation-confirmation" role="status">
              <strong>✓ Recommandation envoyée.</strong>
              <span>Merci, elle a été transmise à l’administration.</span>
            </div>
          )}

          <button
            aria-busy={isSubmitting}
            disabled={!selectedBroker || isSubmitting}
            type="submit"
          >
            {isSubmitting ? "ENVOI…" : "ENVOYER LA RECOMMANDATION"}
          </button>
        </form>
      </article>

      {showAdministration && (
        <section className="recommendation-admin" aria-labelledby="recommendation-admin-title">
          <header className="recommendation-admin-header">
            <div>
              <p className="section-kicker">Administration</p>
              <h3 id="recommendation-admin-title">RECOMMANDATIONS REÇUES</h3>
            </div>
            <strong>{unreadCount === 0 ? "AUCUNE NON LUE" : `${unreadCount} NON LUE${unreadCount > 1 ? "S" : ""}`}</strong>
          </header>

          {deletionConfirmation && (
            <div className="recommendation-deletion-confirmation" role="status">
              ✓ Recommandation supprimée.
            </div>
          )}

          {completionConfirmation && (
            <div className="recommendation-completion-confirmation" role="status">
              ✓ Recommandation marquée comme faite.
            </div>
          )}

          {adminError && (
            <div className="recommendation-admin-error" role="alert">
              <span>{adminError}</span>
              <button onClick={() => setReloadAdminKey((key) => key + 1)} type="button">Réessayer</button>
            </div>
          )}
          {isLoadingAdmin && <p className="recommendation-admin-state">Chargement des recommandations...</p>}
          {!isLoadingAdmin && recommendations.length === 0 && !adminError && (
            <p className="recommendation-admin-state">Aucune recommandation reçue pour le moment.</p>
          )}

          <div className="recommendation-list">
            {recommendations.map((recommendation) => (
              <article
                className={`recommendation-row recommendation-row-${recommendation.status}${recommendation.isCompleted ? " recommendation-row-completed" : ""}`}
                key={recommendation.id}
              >
                <span className={`recommendation-status recommendation-status-${recommendation.status}`}>
                  <i aria-hidden="true" />
                  {recommendation.status === "unread" ? "NOUVELLE" : "LUE"}
                </span>
                <div className="recommendation-row-summary">
                  <div className="recommendation-row-title">
                    <h4>{recommendation.title}</h4>
                    {recommendation.isCompleted && (
                      <span className="recommendation-completed-badge">
                        <i aria-hidden="true">✓</i>
                        FAIT
                      </span>
                    )}
                  </div>
                  <dl>
                    <div><dt>Envoyé par</dt><dd>{BROKER_LABELS[recommendation.submittedBy]}</dd></div>
                    <div><dt>Date</dt><dd>{formatRecommendationDate(recommendation.createdAt)}</dd></div>
                  </dl>
                </div>
                <div className="recommendation-row-actions">
                  <button
                    disabled={
                      deletingRecommendationId === recommendation.id
                      || completingRecommendationId === recommendation.id
                    }
                    onClick={() => void openRecommendation(recommendation)}
                    type="button"
                  >
                    OUVRIR →
                  </button>
                  <button
                    aria-busy={completingRecommendationId === recommendation.id}
                    className="recommendation-row-complete"
                    disabled={
                      recommendation.isCompleted
                      || deletingRecommendationId === recommendation.id
                      || completingRecommendationId === recommendation.id
                    }
                    onClick={() => void completeRecommendation(recommendation)}
                    type="button"
                  >
                    {completingRecommendationId === recommendation.id
                      ? "TRAITEMENT…"
                      : recommendation.isCompleted ? "✓ FAIT" : "FAIT"}
                  </button>
                  <button
                    className="recommendation-row-delete"
                    disabled={
                      deletingRecommendationId === recommendation.id
                      || completingRecommendationId === recommendation.id
                    }
                    onClick={() => requestRecommendationDeletion(recommendation)}
                    type="button"
                  >
                    {deletingRecommendationId === recommendation.id ? "SUPPRESSION…" : "SUPPRIMER"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {openedRecommendation && !pendingDeletion && (
        <RecommendationDetailModal
          isCompleting={completingRecommendationId === openedRecommendation.id}
          isDeleting={deletingRecommendationId === openedRecommendation.id}
          onClose={closeRecommendationDetail}
          onComplete={() => void completeRecommendation(openedRecommendation)}
          onDelete={() => requestRecommendationDeletion(openedRecommendation)}
          recommendation={openedRecommendation}
        />
      )}

      {pendingDeletion && (
        <RecommendationDeleteConfirmationModal
          isDeleting={deletingRecommendationId === pendingDeletion.id}
          onClose={() => setPendingDeletion(null)}
          onConfirm={() => deleteRecommendation(pendingDeletion.id)}
          recommendation={pendingDeletion}
        />
      )}
    </section>
  );
}
