"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type Broker, useBroker } from "../broker-context";
import { BROKER_LABELS } from "../data/contact-types";
import {
  acquireRecommendationCompletionLock,
  acquireRecommendationDeletionLock,
  acquireRecommendationSubmissionLock,
  filterRecommendations,
  formatRecommendationDate,
  getRecommendationCounts,
  releaseRecommendationCompletionLock,
  releaseRecommendationDeletionLock,
  releaseRecommendationSubmissionLock,
  sortRecommendations,
  validateRecommendationText,
  type CRMRecommendation,
  type RecommendationAuthor,
  type RecommendationFilter,
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
  const [recommendationFilter, setRecommendationFilter] = useState<RecommendationFilter>("pending");
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [reloadAdminKey, setReloadAdminKey] = useState(0);
  const [openedRecommendation, setOpenedRecommendation] = useState<CRMRecommendation | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<CRMRecommendation | null>(null);
  const [completingRecommendationId, setCompletingRecommendationId] = useState<string | null>(null);
  const [completionConfirmation, setCompletionConfirmation] = useState<string | null>(null);
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
      setCompletionConfirmation(null);
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
    setCompletionConfirmation(null);
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

  async function setRecommendationCompletion(
    recommendation: CRMRecommendation,
    shouldBeCompleted: boolean,
  ) {
    if (
      recommendation.isCompleted === shouldBeCompleted
      || deletionLock.current !== null
      || !acquireRecommendationCompletionLock(completionLock, recommendation.id)
    ) return;

    setCompletingRecommendationId(recommendation.id);
    setCompletionConfirmation(null);
    setAdminError(null);
    try {
      const response = await fetch(`/api/recommendations/${recommendation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: shouldBeCompleted ? "complete" : "reopen" }),
      });
      const payload = await response.json().catch(() => null) as {
        data?: CRMRecommendation;
      } | null;
      if (!response.ok || !payload?.data || payload.data.isCompleted !== shouldBeCompleted) {
        throw new Error("Traitement impossible");
      }

      const updated = payload.data;
      setRecommendations((current) => sortRecommendations(
        current.map((item) => item.id === updated.id ? updated : item),
      ));
      setOpenedRecommendation((current) => current?.id === updated.id ? updated : current);
      setCompletionConfirmation(shouldBeCompleted
        ? "✓ Recommandation marquée comme faite."
        : "Recommandation remise à faire.");
    } catch {
      setAdminError(shouldBeCompleted
        ? "La recommandation n’a pas pu être marquée comme faite. Réessayez."
        : "La recommandation n’a pas pu être remise à faire. Réessayez.");
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

  const recommendationCounts = getRecommendationCounts(recommendations);
  const visibleRecommendations = filterRecommendations(recommendations, recommendationFilter);

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
            <strong className={recommendationCounts.pending === 0 ? "is-complete" : undefined}>
              {recommendationCounts.pending === 0
                ? "✓ TOUT EST TRAITÉ"
                : `${recommendationCounts.pending} À TRAITER`}
            </strong>
          </header>

          <nav className="recommendation-filters" aria-label="Filtrer les recommandations reçues">
            {([
              ["pending", "À FAIRE", recommendationCounts.pending],
              ["completed", "FAITES", recommendationCounts.completed],
              ["all", "TOUTES", recommendationCounts.all],
            ] as const).map(([filter, label, count]) => (
              <button
                aria-pressed={recommendationFilter === filter}
                className={recommendationFilter === filter ? "is-active" : undefined}
                key={filter}
                onClick={() => setRecommendationFilter(filter)}
                type="button"
              >
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </nav>

          {deletionConfirmation && (
            <div className="recommendation-deletion-confirmation" role="status">
              ✓ Recommandation supprimée.
            </div>
          )}

          {completionConfirmation && (
            <div className="recommendation-completion-confirmation" role="status">
              {completionConfirmation}
            </div>
          )}

          {adminError && (
            <div className="recommendation-admin-error" role="alert">
              <span>{adminError}</span>
              <button onClick={() => setReloadAdminKey((key) => key + 1)} type="button">Réessayer</button>
            </div>
          )}
          {isLoadingAdmin && <p className="recommendation-admin-state">Chargement des recommandations...</p>}
          {!isLoadingAdmin && visibleRecommendations.length === 0 && !adminError && (
            <p className="recommendation-admin-state">
              {recommendations.length === 0
                ? "Aucune recommandation reçue pour le moment."
                : recommendationFilter === "pending"
                  ? "✓ Tout est traité."
                  : recommendationFilter === "completed"
                    ? "Aucune recommandation faite pour le moment."
                    : "Aucune recommandation reçue pour le moment."}
            </p>
          )}

          <div className="recommendation-list">
            {visibleRecommendations.map((recommendation) => (
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
                    {recommendation.isCompleted && recommendation.completedAt && recommendation.completedBy && (
                      <div>
                        <dt>Terminée</dt>
                        <dd>
                          {formatRecommendationDate(recommendation.completedAt)} · par {BROKER_LABELS[recommendation.completedBy]}
                        </dd>
                      </div>
                    )}
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
                    aria-label={recommendation.isCompleted
                      ? "Remettre cette recommandation à faire"
                      : "Marquer cette recommandation comme faite"}
                    aria-busy={completingRecommendationId === recommendation.id}
                    className={recommendation.isCompleted
                      ? "recommendation-row-reopen"
                      : "recommendation-row-complete"}
                    disabled={
                      deletingRecommendationId === recommendation.id
                      || completingRecommendationId === recommendation.id
                    }
                    onClick={() => void setRecommendationCompletion(recommendation, !recommendation.isCompleted)}
                    type="button"
                  >
                    {completingRecommendationId === recommendation.id
                      ? "TRAITEMENT…"
                      : recommendation.isCompleted ? "REMETTRE À FAIRE" : "FAIT"}
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
          onCompletionChange={(isCompleted) => void setRecommendationCompletion(openedRecommendation, isCompleted)}
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
