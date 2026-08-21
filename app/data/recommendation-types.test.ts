import { describe, expect, it } from "vitest";
import {
  acquireRecommendationDeletionLock,
  acquireRecommendationSubmissionLock,
  formatRecommendationDate,
  mapRecommendationRow,
  parseRecommendationDraft,
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
      created_at: unread.createdAt,
      opened_at: null,
      opened_by: null,
    })).toEqual(unread);
  });

  it("trie les non lues avant les lues puis les plus récentes en premier", () => {
    const read = { ...unread, id: "read", status: "read" as const, createdAt: "2026-08-21T20:00:00.000Z" };
    const newerUnread = { ...unread, id: "newer", createdAt: "2026-08-21T19:00:00.000Z" };
    expect(sortRecommendations([read, unread, newerUnread]).map((item) => item.id)).toEqual([
      "newer",
      unread.id,
      "read",
    ]);
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
});
