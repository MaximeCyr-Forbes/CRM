import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("upgrade OAuth Gmail", () => {
  it("demande seulement calendar.events et gmail.send avec identité de base", () => {
    const connect = readFileSync("app/api/google-calendar/connect/route.ts", "utf8");
    expect(connect).toContain('"https://www.googleapis.com/auth/calendar.events"');
    expect(connect).toContain('"https://www.googleapis.com/auth/gmail.send"');
    expect(connect).not.toMatch(/gmail\.(readonly|modify|compose|labels|metadata)/);
    expect(connect).toContain("connection.gmailSendEnabled");
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
