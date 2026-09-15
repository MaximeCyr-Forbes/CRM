import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ denied: false, origin: true, send: vi.fn(), prepare: vi.fn() }));
vi.mock("../../../../../lib/crm-access", () => ({ requireApiAccess: async () => ({ response: state.denied ? Response.json({}, { status: 401 }) : null }) }));
vi.mock("../../../../../lib/google-calendar/config", () => ({ isSameOriginRequest: () => state.origin }));
vi.mock("../../../../../lib/automatic-emails/custom-manual-service", () => ({ sendManualCampaign: state.send, prepareManualCampaign: state.prepare }));
vi.mock("../../../../../lib/automatic-emails/custom-manual-persistence", () => ({ manualHistory: async () => [] }));
import { GET, POST } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ campaignId: id }) };
const valid = { confirmation: "ENVOYER", batchId: id, attemptKey: id, stepId: id, contactIds: [id], fingerprints: { [id]: "a".repeat(64) }, retry: false };
const request = (body: unknown) => new Request(`https://crm.example/api/automatic-emails/custom-campaigns/${id}/manual-send`, { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { state.denied = false; state.origin = true; state.send.mockReset().mockResolvedValue([]); state.prepare.mockReset().mockResolvedValue({ preview: {} }); });
it("refuse les accès non authentifiés en lecture et écriture", async () => {
  state.denied = true;
  expect((await GET(new Request("https://crm.example"), context)).status).toBe(401);
  expect((await POST(request(valid), context)).status).toBe(401);
  expect(state.send).not.toHaveBeenCalled();
});
it("refuse une origine différente", async () => {
  state.origin = false;
  expect((await POST(request(valid), context)).status).toBe(403);
  expect(state.send).not.toHaveBeenCalled();
});
it.each([null, {}, { ...valid, confirmation: true }, { ...valid, confirmation: "envoyer" }, { ...valid, contactIds: [id, id] }, { ...valid, contactIds: [] }, { ...valid, fingerprints: {} }])("refuse la confirmation ou sélection invalide %j", async (body) => {
  expect((await POST(request(body), context)).status).toBe(400);
  expect(state.send).not.toHaveBeenCalled();
});
it("envoie seulement après confirmation ENVOYER et retourne l’historique", async () => {
  expect((await POST(request(valid), context)).status).toBe(200);
  expect(state.send).toHaveBeenCalledWith(id, valid);
});
it("la lecture d’aperçu et d’historique n’envoie rien", async () => {
  await GET(new Request(`https://crm.example?stepId=${id}`), context);
  await GET(new Request("https://crm.example"), context);
  expect(state.send).not.toHaveBeenCalled();
});
