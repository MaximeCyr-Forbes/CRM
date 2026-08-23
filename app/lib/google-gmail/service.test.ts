import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  connection: {
    broker: "maxime" as const,
    google_account_email: "maxime@example.com",
    calendar_id: "primary",
    encrypted_access_token: "encrypted-access",
    encrypted_refresh_token: "encrypted-refresh",
    access_token_expires_at: "2099-01-01T00:00:00.000Z",
    scopes: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/gmail.send"],
  } as null | {
    broker: "maxime";
    google_account_email: string;
    calendar_id: string;
    encrypted_access_token: string;
    encrypted_refresh_token: string;
    access_token_expires_at: string;
    scopes: string[];
  },
  request: vi.fn(),
}));

vi.mock("../google/connection", () => ({
  getGoogleConnection: vi.fn(async () => state.connection),
  googleAuthenticatedRequest: state.request,
}));

import {
  GmailNotEnabledError,
  buildGmailRawMessage,
  sendGmailMessage,
  validateGmailMessage,
} from "./service";

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

describe("service Gmail", () => {
  beforeEach(() => {
    state.connection = {
      broker: "maxime",
      google_account_email: "maxime@example.com",
      calendar_id: "primary",
      encrypted_access_token: "encrypted-access",
      encrypted_refresh_token: "encrypted-refresh",
      access_token_expires_at: "2099-01-01T00:00:00.000Z",
      scopes: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/gmail.send"],
    };
    state.request.mockReset();
    state.request.mockResolvedValue(Response.json({ id: "gmail-message-1", threadId: "thread-1" }));
  });

  it("construit un MIME UTF-8 base64url sans corrompre les accents", () => {
    const subject = "Visite à Montréal — suivi";
    const message = "Bonjour François,\n\nMerci beaucoup.\n\nÀ bientôt!";
    const mime = decodeBase64Url(buildGmailRawMessage({ to: "test@example.com", subject, message }));
    expect(mime).toContain("To: test@example.com\r\n");
    expect(mime).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(mime).toContain("Bonjour François,\r\n\r\nMerci beaucoup.\r\n\r\nÀ bientôt!");
    const encodedSubject = mime.match(/Subject: =\?UTF-8\?B\?(.+)\?=/)?.[1];
    expect(Buffer.from(encodedSubject ?? "", "base64").toString("utf8")).toBe(subject);
  });

  it("refuse les injections de headers et les champs hors limites", () => {
    expect(() => validateGmailMessage({ to: "test@example.com", subject: "Suivi\r\nBcc: intrus@example.com", message: "Bonjour" })).toThrow(/retours à la ligne/i);
    expect(() => validateGmailMessage({ to: "invalide", subject: "Suivi", message: "Bonjour" })).toThrow(/adresse courriel/i);
    expect(() => validateGmailMessage({ to: "test@example.com", subject: "", message: "Bonjour" })).toThrow(/objet/i);
  });

  it("envoie seulement par users/me quand gmail.send est actif", async () => {
    await expect(sendGmailMessage("maxime", { to: "test@example.com", subject: "Suivi", message: "Bonjour" })).resolves.toMatchObject({ senderEmail: "maxime@example.com" });
    expect(state.request).toHaveBeenCalledTimes(1);
    expect(state.request.mock.calls[0][1]).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(JSON.parse(String(state.request.mock.calls[0][2].body))).toEqual({ raw: expect.any(String) });
  });

  it("refuse une connexion Agenda qui ne possède pas gmail.send", async () => {
    state.connection = { ...state.connection!, scopes: ["https://www.googleapis.com/auth/calendar.events"] };
    await expect(sendGmailMessage("maxime", { to: "test@example.com", subject: "Suivi", message: "Bonjour" })).rejects.toBeInstanceOf(GmailNotEnabledError);
    expect(state.request).not.toHaveBeenCalled();
  });
});
