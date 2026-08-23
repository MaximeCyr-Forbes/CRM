import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("upgrade OAuth Gmail", () => {
  it("demande calendar.events, gmail.send et gmail.settings.basic avec identité de base", () => {
    const connect = readFileSync("app/api/google-calendar/connect/route.ts", "utf8");
    expect(connect).toContain('"https://www.googleapis.com/auth/calendar.events"');
    expect(connect).toContain("GMAIL_SEND_SCOPE");
    expect(connect).toContain("GMAIL_SETTINGS_BASIC_SCOPE");
    const scopes = readFileSync("app/lib/google-gmail/scopes.ts", "utf8");
    expect(scopes).toContain('"https://www.googleapis.com/auth/gmail.send"');
    expect(scopes).toContain('"https://www.googleapis.com/auth/gmail.settings.basic"');
    expect(connect).not.toMatch(/gmail\.(readonly|modify|compose|labels|metadata)/);
    expect(connect).toContain("connection.gmailSendEnabled");
    expect(connect).toContain("connection.gmailSignatureEnabled");
  });

  it("préserve le returnTo signé et fusionne les scopes existants", () => {
    const callback = readFileSync("app/api/google-calendar/callback/route.ts", "utf8");
    const service = readFileSync("app/lib/google-calendar/service.ts", "utf8");
    expect(callback).toContain("new URL(returnTo, applicationOrigin)");
    expect(callback).toContain('capability === "gmail"');
    expect(service).toContain("...(existingConnection?.scopes ?? [])");
    expect(service).toContain("...(tokens.scope?.split");
  });
});
