import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ broker: "maxime", denied: false, origin: true, remove: vi.fn() }));
vi.mock("../../../../lib/auth/route", () => ({ withCRMIdentity: (fn: unknown) => fn }));
vi.mock("../../../../lib/crm-access", () => ({ requireApiAccess: async () => ({ broker: state.broker, response: state.denied ? Response.json({}, { status: 401 }) : null }) }));
vi.mock("../../../../lib/google-calendar/config", () => ({ isSameOriginRequest: () => state.origin }));
vi.mock("../../../../lib/automatic-emails/custom-campaign-persistence", () => ({ deleteCustomEmailCampaign: state.remove }));
import { DELETE } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ campaignId: id }) };
const request = () => new Request(`https://crm.example/api/automatic-emails/custom-campaigns/${id}`, { method: "DELETE" });
beforeEach(() => { state.denied = false; state.origin = true; state.remove.mockReset().mockResolvedValue(true); });
it.each(["maxime", "france", "sandrine"])("allows authorized member %s to delete", async broker => {
  state.broker = broker; expect((await DELETE(request(), context)).status).toBe(200); expect(state.remove).toHaveBeenCalledWith(id);
});
it("rejects unauthenticated access", async () => { state.denied = true; expect((await DELETE(request(), context)).status).toBe(401); expect(state.remove).not.toHaveBeenCalled(); });
it("rejects cross-origin deletion", async () => { state.origin = false; expect((await DELETE(request(), context)).status).toBe(403); expect(state.remove).not.toHaveBeenCalled(); });
it("rejects invalid campaign IDs", async () => { expect((await DELETE(request(), { params: Promise.resolve({ campaignId: "bad" }) })).status).toBe(400); expect(state.remove).not.toHaveBeenCalled(); });
it("returns not found for an absent campaign", async () => { state.remove.mockResolvedValue(false); expect((await DELETE(request(), context)).status).toBe(404); });
it("reports database failure", async () => { state.remove.mockRejectedValue(new Error("QA failure")); const log = vi.spyOn(console, "error").mockImplementation(() => {}); expect((await DELETE(request(), context)).status).toBe(502); log.mockRestore(); });
