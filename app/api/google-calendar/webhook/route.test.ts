import { beforeEach, describe, expect, it, vi } from "vitest";

const processWebhook = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../../../lib/google-calendar/service", () => ({
  processGoogleCalendarWebhook: processWebhook,
}));

import { POST } from "./route";

describe("webhook public Google Calendar", () => {
  beforeEach(() => processWebhook.mockClear());

  it("accepte un POST au body vide sans session CRM", async () => {
    const request = new Request("https://crm.example/api/google-calendar/webhook", {
      method: "POST",
      headers: {
        "Content-Length": "0",
        "X-Goog-Channel-ID": "channel",
        "X-Goog-Channel-Token": "secret",
        "X-Goog-Resource-ID": "resource",
        "X-Goog-Resource-State": "exists",
      },
    });
    const response = await POST(request);
    expect(response.status).toBe(204);
    expect(processWebhook).toHaveBeenCalledWith(request.headers);
  });

  it("ne retourne aucun détail sensible si le traitement échoue", async () => {
    processWebhook.mockRejectedValueOnce(new Error("secret-token"));
    const response = await POST(new Request("https://crm.example/api/google-calendar/webhook", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
  });
});
