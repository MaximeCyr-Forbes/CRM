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
    expect(source).toContain("SIGNATURE GMAIL — AUTORISATION REQUISE");
    expect(source).toContain("ACTIVER LA SIGNATURE GMAIL");
    expect(contactPage).toContain("selectedBroker={selectedBroker}");
    expect(contactPage).toContain("initialTo={contact.email}");
    expect(contactPage).toContain("Envoyer un courriel");
  });

  it("affiche dans Paramètres le scope Gmail distinct du statut Agenda", () => {
    const settings = readFileSync("app/settings/page.tsx", "utf8");
    expect(settings).toContain('Gmail — Envoi {connection.gmailSendEnabled ? "activé ✓" : "non activé"}');
    expect(settings).toContain('Signature Gmail — {connection.gmailSignatureEnabled ? "Synchronisée ✓" : "Autorisation requise"}');
    expect(settings).toContain("capability=gmail&returnTo=/settings");
    expect(settings).toContain("ACTIVER LA SIGNATURE GMAIL");
  });

  it("ouvre la même modal CRM depuis l’email de la liste et de la fiche sans mailto", () => {
    const contactsPage = readFileSync("app/contacts/page.tsx", "utf8");
    const contactPage = readFileSync("app/contacts/[contactId]/page.tsx", "utf8");
    expect(contactsPage).toContain("<ContactEmailModal");
    expect(contactsPage).toContain("setEmailContactId(contact.id)");
    expect(contactsPage).toContain("selectedBroker={selectedBroker}");
    expect(contactsPage).toContain("initialTo={emailContact.email}");
    expect(contactPage).toContain("setIsEmailOpen(true)");
    expect(contactPage).toContain("selectedBroker={selectedBroker}");
    expect(contactsPage).not.toContain("mailto:");
    expect(contactPage).not.toContain("mailto:");
    expect(contactsPage).toContain("href={`tel:${contact.phone}`}");
    expect(contactPage).toContain("href={`tel:${contact.phone}`}");
  });
});
