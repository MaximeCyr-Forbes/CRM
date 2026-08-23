import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ accessDenied: false, sameOrigin: true, send: vi.fn() }));
vi.mock("../../../lib/crm-access", () => ({ requireApiAccess: vi.fn(async () => ({ response: state.accessDenied ? Response.json({ error: "Accès CRM requis." }, { status: 401 }) : null })) }));
vi.mock("../../../lib/google-calendar/config", () => ({ isSameOriginRequest: vi.fn(() => state.sameOrigin) }));
vi.mock("../../../lib/google-gmail/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../lib/google-gmail/service")>();
  return { ...original, sendGmailMessage: state.send };
});

import { POST } from "./route";

function request(payload: unknown) {
  return new Request("https://crm.example.com/api/gmail/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://crm.example.com" },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/gmail/send", () => {
  beforeEach(() => {
    state.accessDenied = false;
    state.sameOrigin = true;
    state.send.mockReset().mockResolvedValue({ id: "message-1", senderEmail: "maxime@example.com" });
  });

  it("protège l’accès CRM et l’origine", async () => {
    state.accessDenied = true;
    expect((await POST(request({}))).status).toBe(401);
    state.accessDenied = false;
    state.sameOrigin = false;
    expect((await POST(request({}))).status).toBe(403);
  });

  it("transmet strictement le selectedBroker fourni comme expéditeur", async () => {
    const response = await POST(request({ senderBroker: "maxime", contactId: "11111111-1111-4111-8111-111111111111", to: "client@example.com", subject: "Suivi", message: "Bonjour" }));
    expect(response.status).toBe(200);
    expect(state.send).toHaveBeenCalledWith("maxime", { to: "client@example.com", subject: "Suivi", message: "Bonjour" });
  });

  it("refuse un courtier unassigned ou inconnu", async () => {
    expect((await POST(request({ senderBroker: "unassigned", contactId: "11111111-1111-4111-8111-111111111111", to: "client@example.com", subject: "Suivi", message: "Bonjour" }))).status).toBe(400);
    expect(state.send).not.toHaveBeenCalled();
  });
});
