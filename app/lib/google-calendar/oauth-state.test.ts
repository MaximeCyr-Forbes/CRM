import { describe, expect, it } from "vitest";
import { createOAuthState, sanitizeOAuthReturnTo, verifyOAuthState } from "./oauth-state";

describe("state OAuth Google", () => {
  it("n’accepte que les destinations locales sûres", () => {
    expect(sanitizeOAuthReturnTo("/contacts/123?gmail=1")).toBe("/contacts/123?gmail=1");
    for (const unsafe of ["//evil.example", "https://evil.example", "http://evil.example", "javascript:alert(1)", "/\\evil.example"]) {
      expect(sanitizeOAuthReturnTo(unsafe)).toBe("/settings");
    }
  });

  it("signe et vérifie la capability Gmail et le returnTo", async () => {
    process.env.GOOGLE_CLIENT_ID = "client";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.GOOGLE_OAUTH_STATE_SECRET = "state-secret-for-tests";
    const state = await createOAuthState("sandrine", "gmail", "/contacts/11111111-1111-4111-8111-111111111111");
    await expect(verifyOAuthState(state)).resolves.toMatchObject({ broker: "sandrine", capability: "gmail", returnTo: "/contacts/11111111-1111-4111-8111-111111111111" });
  });
});
