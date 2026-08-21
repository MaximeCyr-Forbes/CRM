import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CRMRecommendation, CRMRecommendationDraft } from "../../data/recommendation-types";

const state = vi.hoisted(() => ({
  accessDenied: false,
  sameOrigin: true,
  drafts: [] as CRMRecommendationDraft[],
  recommendations: [] as CRMRecommendation[],
  deletedRecommendationIds: [] as string[],
}));

vi.mock("../../lib/crm-access", () => ({
  requireApiAccess: vi.fn(async () => ({
    response: state.accessDenied
      ? Response.json({ error: "Accès CRM requis." }, { status: 401 })
      : null,
  })),
}));

vi.mock("../../lib/google-calendar/config", () => ({
  isSameOriginRequest: vi.fn(() => state.sameOrigin),
}));

vi.mock("../../lib/recommendations/persistence", () => ({
  listRecommendations: vi.fn(async () => state.recommendations),
  createRecommendation: vi.fn(async (draft: CRMRecommendationDraft) => {
    state.drafts.push(draft);
    const recommendation: CRMRecommendation = {
      id: "10000000-0000-4000-8000-000000000001",
      ...draft,
      status: "unread",
      createdAt: "2026-08-21T18:25:00.000Z",
      openedAt: null,
      openedBy: null,
    };
    state.recommendations.unshift(recommendation);
    return recommendation;
  }),
  markRecommendationRead: vi.fn(async (recommendationId: string) => {
    const recommendation = state.recommendations.find((item) => item.id === recommendationId);
    if (!recommendation) return null;
    const updated: CRMRecommendation = {
      ...recommendation,
      status: "read",
      openedAt: "2026-08-21T18:30:00.000Z",
      openedBy: "maxime",
    };
    state.recommendations = state.recommendations.map((item) => item.id === updated.id ? updated : item);
    return updated;
  }),
  deleteRecommendation: vi.fn(async (recommendationId: string) => {
    const recommendationIndex = state.recommendations.findIndex((item) => item.id === recommendationId);
    if (recommendationIndex < 0) return false;
    state.deletedRecommendationIds.push(recommendationId);
    state.recommendations.splice(recommendationIndex, 1);
    return true;
  }),
}));

import { GET, POST } from "./route";
import { DELETE, PATCH } from "./[recommendationId]/route";

const recommendationId = "10000000-0000-4000-8000-000000000001";

function post(body: unknown) {
  return POST(new Request("http://localhost/api/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify(body),
  }));
}

function remove(id: string) {
  return DELETE(
    new Request(`http://localhost/api/recommendations/${id}`, {
      method: "DELETE",
      headers: { Origin: "http://localhost" },
    }),
    { params: Promise.resolve({ recommendationId: id }) },
  );
}

describe("API recommandations", () => {
  beforeEach(() => {
    state.accessDenied = false;
    state.sameOrigin = true;
    state.drafts = [];
    state.recommendations = [];
    state.deletedRecommendationIds = [];
  });

  it("crée une recommandation France non lue", async () => {
    const response = await post({
      title: "Ajouter une fonctionnalité X",
      content: "Ce serait pratique de...",
      submittedBy: "france",
    });
    const payload = await response.json() as { data: CRMRecommendation };

    expect(response.status).toBe(201);
    expect(state.drafts).toEqual([{
      title: "Ajouter une fonctionnalité X",
      content: "Ce serait pratique de...",
      submittedBy: "france",
    }]);
    expect(payload.data).toMatchObject({ submittedBy: "france", status: "unread" });
  });

  it("refuse les auteurs et contenus invalides côté serveur", async () => {
    expect((await post({ title: "", content: "Texte", submittedBy: "france" })).status).toBe(400);
    expect((await post({ title: "Titre", content: "", submittedBy: "france" })).status).toBe(400);
    expect((await post({ title: "x".repeat(121), content: "Texte", submittedBy: "france" })).status).toBe(400);
    expect((await post({ title: "Titre", content: "x".repeat(4001), submittedBy: "france" })).status).toBe(400);
    expect((await post({ title: "Titre", content: "Texte", submittedBy: "unassigned" })).status).toBe(400);
    expect(state.drafts).toHaveLength(0);
  });

  it("protège les lectures et les écritures par la session CRM", async () => {
    state.accessDenied = true;
    expect((await GET()).status).toBe(401);
    expect((await post({ title: "Titre", content: "Texte", submittedBy: "maxime" })).status).toBe(401);
    expect((await remove(recommendationId)).status).toBe(401);
  });

  it("refuse une écriture qui ne provient pas de la même origine", async () => {
    state.sameOrigin = false;
    expect((await post({ title: "Titre", content: "Texte", submittedBy: "sandrine" })).status).toBe(403);
    expect((await remove(recommendationId)).status).toBe(403);
    expect(state.drafts).toHaveLength(0);
    expect(state.deletedRecommendationIds).toHaveLength(0);
  });

  it("retourne les recommandations persistées au rechargement", async () => {
    await post({ title: "Titre", content: "Texte", submittedBy: "france" });
    const response = await GET();
    const payload = await response.json() as { data: CRMRecommendation[] };
    expect(response.status).toBe(200);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].id).toBe(recommendationId);
  });

  it("marque une recommandation lue par Maxime à l’ouverture", async () => {
    await post({ title: "Titre", content: "Texte", submittedBy: "france" });
    const response = await PATCH(
      new Request(`http://localhost/api/recommendations/${recommendationId}`, {
        method: "PATCH",
        headers: { Origin: "http://localhost" },
      }),
      { params: Promise.resolve({ recommendationId }) },
    );
    const payload = await response.json() as { data: CRMRecommendation };
    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({ status: "read", openedBy: "maxime" });
    expect(payload.data.openedAt).not.toBeNull();
  });

  it("supprime une recommandation puis ne la retourne plus au rechargement", async () => {
    await post({ title: "À retirer", content: "Texte", submittedBy: "france" });
    const response = await remove(recommendationId);
    const payload = await response.json() as { data: { recommendationId: string } };

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ recommendationId });
    expect(state.deletedRecommendationIds).toEqual([recommendationId]);

    const refreshed = await GET();
    const refreshedPayload = await refreshed.json() as { data: CRMRecommendation[] };
    expect(refreshedPayload.data).toEqual([]);
  });

  it("retourne 404 pour une recommandation inexistante", async () => {
    expect((await remove("20000000-0000-4000-8000-000000000002")).status).toBe(404);
  });

  it("retourne 400 pour un identifiant invalide", async () => {
    expect((await remove("identifiant-invalide")).status).toBe(400);
    expect(state.deletedRecommendationIds).toHaveLength(0);
  });
});
