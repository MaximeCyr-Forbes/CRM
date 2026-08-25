import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GOOGLE_ACCOUNT_CHANGE_REQUIRED_MESSAGE,
  getGoogleOAuthFeedback,
} from "./oauth-feedback";

describe("retour OAuth Google dans Paramètres", () => {
  it.each(["calendar", "gmail"] as const)(
    "affiche le message de changement de compte pour %s",
    (capability) => {
      expect(getGoogleOAuthFeedback(capability, "account-change-required")).toEqual({
        type: "error",
        text: GOOGLE_ACCOUNT_CHANGE_REQUIRED_MESSAGE,
      });
    },
  );

  it("conserve les messages OAuth existants", () => {
    expect(getGoogleOAuthFeedback("calendar", "connected")?.text).toBe("Google Agenda connecté avec succès.");
    expect(getGoogleOAuthFeedback("gmail", "error")?.text).toBe("L’activation Gmail n’a pas pu être terminée.");
  });

  it("conserve l’erreur de changement de compte pendant le rechargement des connexions", () => {
    const settingsPage = readFileSync(resolve(process.cwd(), "app/settings/page.tsx"), "utf8");
    expect(settingsPage).toContain("void loadConnections(preserveOAuthError)");
    expect(settingsPage).toContain("if (!preserveError) setError(null)");
  });
});
