import { beforeEach, describe, expect, it, vi } from "vitest";

const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const SIGNATURE_SCOPE = "https://www.googleapis.com/auth/gmail.settings.basic";
const state = vi.hoisted(() => ({
  connection: {
    broker: "maxime" as const,
    google_account_email: "maxime@example.com",
    calendar_id: "primary",
    encrypted_access_token: "encrypted-access",
    encrypted_refresh_token: "encrypted-refresh",
    access_token_expires_at: "2099-01-01T00:00:00.000Z",
    scopes: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.settings.basic"],
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
  GmailSignatureAuthorizationRequiredError,
  buildGmailRawMessage,
  selectGmailSendAsIdentity,
  sendGmailMessage,
  validateGmailMessage,
} from "./service";

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function decodeAlternative(mime: string, type: "plain" | "html") {
  const match = mime.match(new RegExp(`Content-Type: text/${type}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`));
  return Buffer.from((match?.[1] ?? "").replace(/\s/g, ""), "base64").toString("utf8");
}

describe("service Gmail avec signature", () => {
  beforeEach(() => {
    state.connection = {
      broker: "maxime",
      google_account_email: "maxime@example.com",
      calendar_id: "primary",
      encrypted_access_token: "encrypted-access",
      encrypted_refresh_token: "encrypted-refresh",
      access_token_expires_at: "2099-01-01T00:00:00.000Z",
      scopes: ["https://www.googleapis.com/auth/calendar.events", SEND_SCOPE, SIGNATURE_SCOPE],
    };
    state.request.mockReset();
  });

  it("choisit pour Maxime l’identité correspondant au compte avant l’identité par défaut", () => {
    const selected = selectGmailSendAsIdentity([
      { sendAsEmail: "alias@example.com", isDefault: true, signature: "Alias" },
      { sendAsEmail: "MAXIME@example.com", signature: "Maxime" },
    ], "maxime@example.com");
    expect(selected?.signature).toBe("Maxime");
  });

  it("choisit pour France l’identité par défaut puis pour Sandrine l’identité principale", () => {
    expect(selectGmailSendAsIdentity([
      { sendAsEmail: "autre@example.com", isPrimary: true },
      { sendAsEmail: "france.alias@example.com", isDefault: true },
    ], "france@example.com")?.sendAsEmail).toBe("france.alias@example.com");
    expect(selectGmailSendAsIdentity([
      { sendAsEmail: "sandrine.alias@example.com" },
      { sendAsEmail: "sandrine.primary@example.com", isPrimary: true },
    ], "sandrine@example.com")?.sendAsEmail).toBe("sandrine.primary@example.com");
  });

  it("construit un multipart UTF-8 texte + HTML et préserve exactement le HTML Gmail", () => {
    const signature = '<div style="color:#123"><b>Maxime Cyr</b><br><a href="https://forbes.example">Équipe Forbes</a><img src="https://cdn.example/logo.png" style="width:120px"></div>';
    const raw = buildGmailRawMessage(
      { to: "test@example.com", subject: "Visite à Montréal — suivi", message: "Bonjour François,\n<script>alert('x')</script>\nÀ bientôt!" },
      { sendAsEmail: "maxime@example.com", displayName: "Maxime Cyr", replyToAddress: "reponse@example.com", signature },
      "forbes-test-boundary",
    );
    const mime = decodeBase64Url(raw);
    const plain = decodeAlternative(mime, "plain");
    const html = decodeAlternative(mime, "html");
    expect(mime).toContain('Content-Type: multipart/alternative; boundary="forbes-test-boundary"');
    expect(mime).toContain("From: =?UTF-8?B?");
    expect(mime).toContain("Reply-To: reponse@example.com");
    expect(plain).toContain("Bonjour François,\r\n<script>alert('x')</script>\r\nÀ bientôt!\r\n\r\nMaxime Cyr");
    expect(html).toContain("Bonjour François,<br>&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;<br>À bientôt!");
    expect(html).toContain(`<br><br>${signature}`);
    expect(html).toContain('<img src="https://cdn.example/logo.png" style="width:120px">');
    expect(html).toContain('<a href="https://forbes.example">Équipe Forbes</a>');
  });

  it("n’invente aucune signature quand Gmail retourne une signature vide", () => {
    const mime = decodeBase64Url(buildGmailRawMessage(
      { to: "test@example.com", subject: "Suivi", message: "Bonjour" },
      { sendAsEmail: "maxime@example.com", signature: "   " },
      "empty-signature",
    ));
    expect(decodeAlternative(mime, "plain")).toBe("Bonjour");
    expect(decodeAlternative(mime, "html")).toBe('<div dir="ltr">Bonjour</div>');
  });

  it("refuse les injections de headers et les champs hors limites", () => {
    expect(() => validateGmailMessage({ to: "test@example.com", subject: "Suivi\r\nBcc: intrus@example.com", message: "Bonjour" })).toThrow(/retours à la ligne/i);
    expect(() => validateGmailMessage({ to: "invalide", subject: "Suivi", message: "Bonjour" })).toThrow(/adresse courriel/i);
    expect(() => validateGmailMessage({ to: "test@example.com", subject: "", message: "Bonjour" })).toThrow(/objet/i);
  });

  it("lit SendAs avant l’envoi et utilise l’identité du courtier sélectionné", async () => {
    state.request
      .mockResolvedValueOnce(Response.json({ sendAs: [{ sendAsEmail: "maxime@example.com", displayName: "Maxime", signature: "<b>Maxime</b>", isPrimary: true }] }))
      .mockResolvedValueOnce(Response.json({ id: "gmail-message-1", threadId: "thread-1" }));
    await expect(sendGmailMessage("maxime", { to: "test@example.com", subject: "Suivi", message: "Bonjour" })).resolves.toMatchObject({ senderEmail: "maxime@example.com" });
    expect(state.request).toHaveBeenCalledTimes(2);
    expect(state.request.mock.calls[0][1]).toBe("https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs");
    expect(state.request.mock.calls[1][1]).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(JSON.parse(String(state.request.mock.calls[1][2].body))).toEqual({ raw: expect.any(String) });
  });

  it("refuse une connexion Agenda sans gmail.send", async () => {
    state.connection = { ...state.connection!, scopes: ["https://www.googleapis.com/auth/calendar.events", SIGNATURE_SCOPE] };
    await expect(sendGmailMessage("maxime", { to: "test@example.com", subject: "Suivi", message: "Bonjour" })).rejects.toBeInstanceOf(GmailNotEnabledError);
    expect(state.request).not.toHaveBeenCalled();
  });

  it("demande une nouvelle autorisation si gmail.settings.basic manque", async () => {
    state.connection = { ...state.connection!, scopes: ["https://www.googleapis.com/auth/calendar.events", SEND_SCOPE] };
    await expect(sendGmailMessage("maxime", { to: "test@example.com", subject: "Suivi", message: "Bonjour" })).rejects.toBeInstanceOf(GmailSignatureAuthorizationRequiredError);
    expect(state.request).not.toHaveBeenCalled();
  });
});
