import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { selectedBrokerToGmailBroker } from "./contact-email-modal";

describe("modal d’envoi de courriel Contact", () => {
  it("convertit uniquement le courtier sélectionné en expéditeur", () => {
    expect(selectedBrokerToGmailBroker("France")).toBe("france");
    expect(selectedBrokerToGmailBroker("Maxime")).toBe("maxime");
    expect(selectedBrokerToGmailBroker("Sandrine")).toBe("sandrine");
    expect(selectedBrokerToGmailBroker(null)).toBeNull();
  });

  it("n’utilise jamais contact.broker et protège le double envoi", () => {
    const source = readFileSync("app/components/contact-email-modal.tsx", "utf8");
    const contactPage = readFileSync("app/contacts/[contactId]/page.tsx", "utf8");
    expect(source).toContain("senderBroker, contactId, to, subject, message");
    expect(source).toContain("contact.broker ne participe jamais à ce choix");
    expect(source).toContain("sendingRef.current");
    expect(source).toContain("ENVOI…");
    expect(source).toContain("GMAIL NON ACTIVÉ");
    expect(contactPage).toContain("selectedBroker={selectedBroker}");
    expect(contactPage).toContain("initialTo={contact.email}");
    expect(contactPage).toContain("Envoyer un courriel");
  });

  it("affiche dans Paramètres le scope Gmail distinct du statut Agenda", () => {
    const settings = readFileSync("app/settings/page.tsx", "utf8");
    expect(settings).toContain('Gmail : {connection.gmailSendEnabled ? "ACTIVÉ ✓" : "NON ACTIVÉ"}');
    expect(settings).toContain("capability=gmail&returnTo=/settings");
    expect(settings).toContain("Activer Gmail");
  });
});
