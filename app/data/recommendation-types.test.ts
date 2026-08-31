import { describe, expect, it } from "vitest";
import {
  acquireRecommendationCompletionLock,
  acquireRecommendationDeletionLock,
  acquireRecommendationSubmissionLock,
  formatRecommendationDate,
  filterRecommendations,
  getRecommendationCounts,
  mapRecommendationRow,
  parseRecommendationDraft,
  releaseRecommendationCompletionLock,
  releaseRecommendationDeletionLock,
  releaseRecommendationSubmissionLock,
  sortRecommendations,
  validateRecommendationText,
  type CRMRecommendation,
} from "./recommendation-types";

const unread: CRMRecommendation = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "Nouvelle idée",
  content: "Une amélioration utile.",
  submittedBy: "france",
  status: "unread",
  isCompleted: false,
  completedAt: null,
  completedBy: null,
  createdAt: "2026-08-20T18:00:00.000Z",
  openedAt: null,
  openedBy: null,
};

describe("types et validation des recommandations", () => {
  it("accepte et normalise une recommandation valide de France", () => {
    expect(parseRecommendationDraft({
      title: "  Ajouter une fonctionnalité X  ",
      content: "  Ce serait pratique de...  ",
      submittedBy: "france",
    })).toEqual({
      title: "Ajouter une fonctionnalité X",
      content: "Ce serait pratique de...",
      submittedBy: "france",
    });
  });

  it("refuse les champs vides ou composés uniquement d’espaces", () => {
    expect(validateRecommendationText("   ", "Texte")).toBe("Ajoutez un titre.");
    expect(validateRecommendationText("Titre", "   ")).toBe("Décrivez votre recommandation.");
    expect(parseRecommendationDraft({ title: " ", content: "Texte", submittedBy: "maxime" })).toBeNull();
    expect(parseRecommendationDraft({ title: "Titre", content: " ", submittedBy: "sandrine" })).toBeNull();
  });

  it("refuse les limites dépassées et les auteurs invalides", () => {
    expect(parseRecommendationDraft({ title: "x".repeat(121), content: "Texte", submittedBy: "maxime" })).toBeNull();
    expect(parseRecommendationDraft({ title: "Titre", content: "x".repeat(4001), submittedBy: "maxime" })).toBeNull();
    expect(parseRecommendationDraft({ title: "Titre", content: "Texte", submittedBy: "unassigned" })).toBeNull();
    expect(parseRecommendationDraft({ title: "Titre", content: "Texte", submittedBy: "autre" })).toBeNull();
  });

  it("mappe les noms Supabase vers le modèle applicatif", () => {
    expect(mapRecommendationRow({
      id: unread.id,
      title: unread.title,
      content: unread.content,
      submitted_by: "france",
      status: "unread",
      is_completed: false,
      completed_at: null,
      completed_by: null,
      created_at: unread.createdAt,
      opened_at: null,
      opened_by: null,
    })).toEqual(unread);
  });

  it("trie les recommandations à traiter par création puis les faites par date de traitement", () => {
    const read = { ...unread, id: "read", status: "read" as const, createdAt: "2026-08-21T20:00:00.000Z" };
    const newerUnread = { ...unread, id: "newer", createdAt: "2026-08-21T19:00:00.000Z" };
    const completed = {
      ...unread,
      id: "completed",
      isCompleted: true,
      completedAt: "2026-08-22T12:00:00.000Z",
      completedBy: "maxime" as const,
      createdAt: "2026-08-22T11:00:00.000Z",
    };
    expect(sortRecommendations([completed, read, unread, newerUnread]).map((item) => item.id)).toEqual([
      "read",
      "newer",
      unread.id,
      "completed",
    ]);
  });

  it("compte et filtre 4 recommandations à faire et 3 faites", () => {
    const recommendations = Array.from({ length: 7 }, (_, index): CRMRecommendation => ({
      ...unread,
      id: `recommendation-${index}`,
      isCompleted: index >= 4,
      completedAt: index >= 4 ? `2026-08-2${index}T12:00:00.000Z` : null,
      completedBy: index >= 4 ? "maxime" : null,
      createdAt: `2026-08-1${index}T12:00:00.000Z`,
    }));

    expect(getRecommendationCounts(recommendations)).toEqual({ pending: 4, completed: 3, all: 7 });
    expect(filterRecommendations(recommendations, "pending")).toHaveLength(4);
    expect(filterRecommendations(recommendations, "completed")).toHaveLength(3);
    expect(filterRecommendations(recommendations, "all")).toHaveLength(7);
  });

  it("formate les dates en français et à l’heure de Montréal", () => {
    expect(formatRecommendationDate("2026-08-21T18:25:00.000Z")).toContain("21 août 2026");
    expect(formatRecommendationDate("2026-08-21T18:25:00.000Z")).toContain("14:25");
  });

  it("bloque un double envoi tant que la première soumission est active", () => {
    const lock = { current: false };
    expect(acquireRecommendationSubmissionLock(lock)).toBe(true);
    expect(acquireRecommendationSubmissionLock(lock)).toBe(false);
    releaseRecommendationSubmissionLock(lock);
    expect(acquireRecommendationSubmissionLock(lock)).toBe(true);
  });

  it("bloque une deuxième suppression pendant la requête active", () => {
    const lock = { current: null as string | null };
    expect(acquireRecommendationDeletionLock(lock, "recommendation-1")).toBe(true);
    expect(acquireRecommendationDeletionLock(lock, "recommendation-1")).toBe(false);
    expect(acquireRecommendationDeletionLock(lock, "recommendation-2")).toBe(false);
    releaseRecommendationDeletionLock(lock);
    expect(acquireRecommendationDeletionLock(lock, "recommendation-2")).toBe(true);
  });

  it("bloque un double traitement pendant la requête active", () => {
    const lock = { current: null as string | null };
    expect(acquireRecommendationCompletionLock(lock, "recommendation-1")).toBe(true);
    expect(acquireRecommendationCompletionLock(lock, "recommendation-1")).toBe(false);
    expect(acquireRecommendationCompletionLock(lock, "recommendation-2")).toBe(false);
    releaseRecommendationCompletionLock(lock);
    expect(acquireRecommendationCompletionLock(lock, "recommendation-2")).toBe(true);
  });
});
