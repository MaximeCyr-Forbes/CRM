import { CONTACT_BROKERS, type ContactBroker } from "./contact-types";

export const RECOMMENDATION_STATUSES = ["unread", "read"] as const;

export type RecommendationAuthor = Exclude<ContactBroker, "unassigned">;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export type CRMRecommendation = {
  id: string;
  title: string;
  content: string;
  submittedBy: RecommendationAuthor;
  status: RecommendationStatus;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  openedAt: string | null;
  openedBy: RecommendationAuthor | null;
};

export type CRMRecommendationDraft = Pick<CRMRecommendation, "title" | "content" | "submittedBy">;

export type CRMRecommendationRow = {
  id: string;
  title: string;
  content: string;
  submitted_by: RecommendationAuthor;
  status: RecommendationStatus;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  opened_at: string | null;
  opened_by: RecommendationAuthor | null;
};

export function isRecommendationAuthor(value: unknown): value is RecommendationAuthor {
  return typeof value === "string" && CONTACT_BROKERS.includes(value as RecommendationAuthor);
}

export function isRecommendationStatus(value: unknown): value is RecommendationStatus {
  return typeof value === "string"
    && RECOMMENDATION_STATUSES.includes(value as RecommendationStatus);
}

export function isRecommendationId(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function validateRecommendationText(title: string, content: string) {
  if (!title.trim()) return "Ajoutez un titre.";
  if (!content.trim()) return "Décrivez votre recommandation.";
  if (title.trim().length > 120) return "Le titre doit contenir au maximum 120 caractères.";
  if (content.trim().length > 4000) return "La recommandation doit contenir au maximum 4000 caractères.";
  return null;
}

export function parseRecommendationDraft(value: unknown): CRMRecommendationDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const allowedFields = new Set(["title", "content", "submittedBy"]);
  if (Object.keys(data).some((field) => !allowedFields.has(field))) return null;
  if (
    typeof data.title !== "string"
    || typeof data.content !== "string"
    || !isRecommendationAuthor(data.submittedBy)
    || validateRecommendationText(data.title, data.content)
  ) return null;
  return {
    title: data.title.trim(),
    content: data.content.trim(),
    submittedBy: data.submittedBy,
  };
}

export function mapRecommendationRow(row: CRMRecommendationRow): CRMRecommendation {
  if (!isRecommendationAuthor(row.submitted_by) || !isRecommendationStatus(row.status)) {
    throw new Error("Recommandation Supabase invalide.");
  }
  if (row.opened_by !== null && !isRecommendationAuthor(row.opened_by)) {
    throw new Error("Auteur d’ouverture Supabase invalide.");
  }
  if (
    typeof row.is_completed !== "boolean"
    || (row.completed_at !== null && typeof row.completed_at !== "string")
    || row.is_completed !== (row.completed_at !== null)
  ) {
    throw new Error("Statut de traitement Supabase invalide.");
  }
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    submittedBy: row.submitted_by,
    status: row.status,
    isCompleted: row.is_completed,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    openedAt: row.opened_at,
    openedBy: row.opened_by,
  };
}

export function sortRecommendations(recommendations: ReadonlyArray<CRMRecommendation>) {
  return [...recommendations].sort((first, second) => {
    if (first.isCompleted !== second.isCompleted) return first.isCompleted ? 1 : -1;
    if (first.status !== second.status) return first.status === "unread" ? -1 : 1;
    return second.createdAt.localeCompare(first.createdAt);
  });
}

export function formatRecommendationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date indisponible";
  return new Intl.DateTimeFormat("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Toronto",
  }).format(date).replace(/(\d{2}) h (\d{2})/, "$1:$2");
}

export function acquireRecommendationSubmissionLock(lock: { current: boolean }) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseRecommendationSubmissionLock(lock: { current: boolean }) {
  lock.current = false;
}

export function acquireRecommendationDeletionLock(
  lock: { current: string | null },
  recommendationId: string,
) {
  if (lock.current !== null) return false;
  lock.current = recommendationId;
  return true;
}

export function releaseRecommendationDeletionLock(lock: { current: string | null }) {
  lock.current = null;
}

export function acquireRecommendationCompletionLock(
  lock: { current: string | null },
  recommendationId: string,
) {
  if (lock.current !== null) return false;
  lock.current = recommendationId;
  return true;
}

export function releaseRecommendationCompletionLock(lock: { current: string | null }) {
  lock.current = null;
}
