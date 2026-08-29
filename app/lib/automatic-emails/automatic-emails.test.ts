import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CalendarConnectionStatus } from "../../data/calendar-types";
import type { AutomaticEmailRule } from "../../data/automatic-email-types";
import { googleReviewTransactionTypes, parseAutomaticEmailRuleDraft, ruleConfigurationIssues } from "../../data/automatic-email-types";
import {
  calculateAutomaticEmailOccurrences,
  invalidTemplateVariables,
  resolveAutomaticEmailTemplate,
  type AutomaticEmailPreviewDataset,
} from "./calculations";
import { AUTOMATIC_EMAIL_RUNNER_AVAILABLE, automaticEmailsEnabled } from "./master-lock";

const originalLock = process.env.AUTOMATIC_EMAILS_ENABLED;

afterEach(() => {
  if (originalLock === undefined) delete process.env.AUTOMATIC_EMAILS_ENABLED;
  else process.env.AUTOMATIC_EMAILS_ENABLED = originalLock;
});

function connection(broker: "france" | "maxime" | "sandrine", gmail = true, signature = true): CalendarConnectionStatus {
  return {
    broker, connected: gmail, email: gmail ? `${broker}@example.com` : null,
    gmailSendEnabled: gmail, gmailSignatureEnabled: signature,
    centrisShowings: { scopeGranted: true, calendarDetected: true, status: "synchronized" },
    birthdays: { synced: 0, pending: 0, error: 0 }, mortgageRenewals: { synced: 0, pending: 0, error: 0 },
    watch: { changeVersion: 0, lastNotificationAt: null, watchActive: false, expiresAt: null },
  };
}

function rule(values: Partial<AutomaticEmailRule> = {}): AutomaticEmailRule {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ruleType: "birthday",
    name: "Bonne fête",
    status: "draft",
    executionMode: "approval",
    defaultBroker: "france",
    subjectTemplate: "Bonne fête {{firstName}}! 🎉",
    bodyTemplate: "Bonjour {{fullName}}, bonne fête!",
    sendHour: 9,
    sendMinute: 0,
    timezone: "America/Toronto",
    triggerConfig: {},
    createdAt: "2026-08-24T12:00:00Z",
    updatedAt: "2026-08-24T12:00:00Z",
    ...values,
  };
}

function googleReviewRule(values: Partial<AutomaticEmailRule> = {}): AutomaticEmailRule {
  return rule({
    ruleType: "google_review",
    name: "Demande d’avis Google",
    subjectTemplate: "Votre avis compte pour nous",
    bodyTemplate: "Bonjour {{firstName}}, avis pour {{transactionType}} au {{transactionAddress}} : {{googleReviewUrl}}",
    triggerConfig: { delayDays: 3, googleReviewUrl: "https://g.page/r/forbes/review", transactionTypes: ["purchase", "sale"] },
    ...values,
  });
}

function client(id: string, email = `${id}@example.com`) {
  return { id, firstName: id === "jean" ? "Jean" : "Marie", lastName: "Tremblay", email, broker: "maxime" as const, birthDate: null, mortgageRenewalDate: null };
}

function transaction(id: string, type: "purchase" | "sale", values: Partial<AutomaticEmailPreviewDataset["transactions"][number]> = {}) {
  return {
    id,
    type,
    address: "123, rue Principale, Montréal",
    status: "completed",
    notaryDate: "2026-08-24",
    saleFinalizedAt: type === "sale" ? "2026-08-24T14:00:00Z" : null,
    purchaseFinalizedAt: type === "purchase" ? "2026-08-24T14:00:00Z" : null,
    ...values,
  };
}

function dataset(values: Partial<AutomaticEmailPreviewDataset> = {}): AutomaticEmailPreviewDataset {
  return {
    contacts: [], transactions: [], transactionContacts: [],
    connections: [connection("maxime"), connection("france"), connection("sandrine")],
    ...values,
  };
}

function productionSources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) return productionSources(path);
    return /\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") ? [readFileSync(path, "utf8")] : [];
  });
}

describe("préparation des courriels automatiques verrouillés", () => {
  it("refuse READY si l’expéditeur, l’objet ou le message manque", () => {
    const incomplete = rule({ defaultBroker: null, subjectTemplate: "", bodyTemplate: "" });
    expect(ruleConfigurationIssues(incomplete)).toHaveLength(3);
    expect(parseAutomaticEmailRuleDraft({
      ...incomplete,
      status: "ready",
      ruleType: incomplete.ruleType,
    })).toBeNull();
  });

  it("valide et résout uniquement les variables prévues par la règle", () => {
    expect(invalidTemplateVariables("birthday", "Bonjour {{firstName}} {{purchaseDate}}")).toEqual(["purchaseDate"]);
    expect(resolveAutomaticEmailTemplate("Bonjour {{firstName}} {{lastName}}", { firstName: "Jean", lastName: "Tremblay" })).toBe("Bonjour Jean Tremblay");
  });

  it("simule la bonne fête de Jean le 24 août sans fonction d’envoi", () => {
    const occurrences = calculateAutomaticEmailOccurrences([rule()], dataset({ contacts: [{
      id: "contact-jean", firstName: "Jean", lastName: "Tremblay", email: "jean@example.com", broker: "maxime",
      birthDate: "1990-08-24", mortgageRenewalDate: null,
    }] }), "2026-08-24", "2026-08-24");
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({ recipientName: "Jean Tremblay", broker: "maxime", subject: "Bonne fête Jean! 🎉", scheduledTime: "09:00" });
    expect(AUTOMATIC_EMAIL_RUNNER_AVAILABLE).toBe(false);
  });

  it("utilise France comme expéditeur de simulation d’un contact non attribué", () => {
    const occurrences = calculateAutomaticEmailOccurrences([rule({ defaultBroker: "france" })], dataset({ contacts: [{
      id: "contact-louise", firstName: "Louise", lastName: "Roy", email: "louise@example.com", broker: "unassigned",
      birthDate: "1985-08-24", mortgageRenewalDate: null,
    }] }), "2026-08-24", "2026-08-24");
    expect(occurrences[0]).toMatchObject({ broker: "france", brokerLabel: "France" });
  });

  it("simule un renouvellement six mois avant la date réelle", () => {
    const mortgageRule = rule({
      ruleType: "mortgage_renewal", name: "Renouvellement hypothécaire",
      subjectTemplate: "Votre renouvellement", bodyTemplate: "Échéance {{mortgageRenewalDate}}", triggerConfig: { leadMonths: 6 },
    });
    const occurrences = calculateAutomaticEmailOccurrences([mortgageRule], dataset({ contacts: [{
      id: "contact-mortgage", firstName: "Hélène", lastName: "Côté", email: "helene@example.com", broker: "sandrine",
      birthDate: null, mortgageRenewalDate: "2027-02-24",
    }] }), "2026-08-24", "2026-08-24");
    expect(occurrences[0]).toMatchObject({ scheduledDate: "2026-08-24", broker: "sandrine" });
    expect(occurrences[0].message).toContain("24 février 2027");
  });

  it("utilise uniquement notaryDate pour l’anniversaire d’un achat terminé", () => {
    const purchaseRule = rule({ ruleType: "purchase_anniversary", name: "Anniversaire d’achat", subjectTemplate: "Un an déjà", bodyTemplate: "Depuis le {{purchaseDate}}" });
    const occurrences = calculateAutomaticEmailOccurrences([purchaseRule], dataset({
      contacts: [{ id: "buyer", firstName: "André", lastName: "Noël", email: "andre@example.com", broker: "maxime", birthDate: null, mortgageRenewalDate: null }],
      transactions: [{ id: "purchase", type: "purchase", address: "123 rue Exemple", status: "completed", notaryDate: "2025-08-24", saleFinalizedAt: null, purchaseFinalizedAt: "2025-08-24T14:00:00Z" }],
      transactionContacts: [{ transactionId: "purchase", contactId: "buyer" }],
    }), "2026-08-24", "2026-08-24");
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({ transactionId: "purchase", scheduledDate: "2026-08-24" });
  });

  it("ignore un ancien achat completed sans marqueur commercial", () => {
    const purchaseRule = rule({ ruleType: "purchase_anniversary", name: "Anniversaire d’achat", subjectTemplate: "Un an déjà", bodyTemplate: "Depuis le {{purchaseDate}}" });
    const occurrences = calculateAutomaticEmailOccurrences([purchaseRule], dataset({
      contacts: [{ id: "buyer", firstName: "André", lastName: "Noël", email: "andre@example.com", broker: "maxime", birthDate: null, mortgageRenewalDate: null }],
      transactions: [{ id: "legacy-purchase", type: "purchase", address: "123 rue Exemple", status: "completed", notaryDate: "2025-08-24", saleFinalizedAt: null, purchaseFinalizedAt: null }],
      transactionContacts: [{ transactionId: "legacy-purchase", contactId: "buyer" }],
    }), "2026-08-24", "2026-08-24");
    expect(occurrences).toHaveLength(0);
  });

  it("valide strictement le paramétrage Avis Google sans migration", () => {
    expect(googleReviewTransactionTypes({})).toEqual(["purchase", "sale"]);
    const valid = googleReviewRule({ status: "ready" });
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...validDraft } = valid;
    expect(parseAutomaticEmailRuleDraft(validDraft)?.triggerConfig).toMatchObject({
      delayDays: 3,
      googleReviewUrl: "https://g.page/r/forbes/review",
      transactionTypes: ["purchase", "sale"],
    });
    for (const triggerConfig of [
      { delayDays: 3, googleReviewUrl: "https://example.com", transactionTypes: [] },
      { delayDays: 3, googleReviewUrl: "https://example.com", transactionTypes: ["rental"] },
      { delayDays: 366, googleReviewUrl: "https://example.com", transactionTypes: ["purchase"] },
    ]) expect(parseAutomaticEmailRuleDraft({ ...validDraft, triggerConfig })).toBeNull();
    expect(ruleConfigurationIssues({ ...valid, triggerConfig: { ...valid.triggerConfig, googleReviewUrl: "http://example.com" } }))
      .toContain("L’URL Avis Google doit utiliser HTTPS.");
  });

  it("simule un avis Achat trois jours après le notaire", () => {
    const occurrences = calculateAutomaticEmailOccurrences([googleReviewRule()], dataset({
      contacts: [client("jean")],
      transactions: [transaction("purchase", "purchase")],
      transactionContacts: [{ transactionId: "purchase", contactId: "jean" }],
    }), "2026-08-27", "2026-08-27");
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      occurrenceKey: "google-review:purchase:jean",
      scheduledDate: "2026-08-27",
      transactionType: "purchase",
      conclusionDate: "2026-08-24",
      transactionAddress: "123, rue Principale, Montréal",
    });
    expect(occurrences[0].message).toContain("Achat");
  });

  it("simule une vente selon le notaire, puis selon le marqueur final en fallback", () => {
    const contacts = [client("jean")];
    const transactionContacts = [
      { transactionId: "sale-notary", contactId: "jean" },
      { transactionId: "sale-fallback", contactId: "jean" },
    ];
    const occurrences = calculateAutomaticEmailOccurrences([googleReviewRule()], dataset({
      contacts,
      transactions: [
        transaction("sale-notary", "sale", { notaryDate: "2026-08-20", saleFinalizedAt: "2026-08-21T14:00:00Z" }),
        transaction("sale-fallback", "sale", { notaryDate: null, saleFinalizedAt: "2026-08-22T14:00:00Z" }),
      ],
      transactionContacts,
    }), "2026-08-23", "2026-08-25");
    expect(occurrences.map((item) => [item.occurrenceKey, item.scheduledDate])).toEqual([
      ["google-review:sale-notary:jean", "2026-08-23"],
      ["google-review:sale-fallback:jean", "2026-08-25"],
    ]);
  });

  it("filtre séparément les achats et les ventes admissibles", () => {
    const previewDataset = dataset({
      contacts: [client("jean")],
      transactions: [transaction("purchase", "purchase"), transaction("sale", "sale")],
      transactionContacts: [
        { transactionId: "purchase", contactId: "jean" },
        { transactionId: "sale", contactId: "jean" },
      ],
    });
    const purchases = calculateAutomaticEmailOccurrences([
      googleReviewRule({ triggerConfig: { delayDays: 3, googleReviewUrl: "https://example.com", transactionTypes: ["purchase"] } }),
    ], previewDataset, "2026-08-27", "2026-08-27");
    const sales = calculateAutomaticEmailOccurrences([
      googleReviewRule({ triggerConfig: { delayDays: 3, googleReviewUrl: "https://example.com", transactionTypes: ["sale"] } }),
    ], previewDataset, "2026-08-27", "2026-08-27");
    expect(purchases.map((item) => item.transactionId)).toEqual(["purchase"]);
    expect(sales.map((item) => item.transactionId)).toEqual(["sale"]);
  });

  it("génère une occurrence par Contact, déduplique les liens et conserve un courriel manquant comme bloqué", () => {
    const occurrences = calculateAutomaticEmailOccurrences([googleReviewRule()], dataset({
      contacts: [client("jean"), client("marie", "")],
      transactions: [transaction("sale", "sale")],
      transactionContacts: [
        { transactionId: "sale", contactId: "jean" },
        { transactionId: "sale", contactId: "marie" },
        { transactionId: "sale", contactId: "jean" },
      ],
    }), "2026-08-27", "2026-08-27");
    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((item) => item.occurrenceKey).sort()).toEqual([
      "google-review:sale:jean",
      "google-review:sale:marie",
    ]);
    expect(occurrences.find((item) => item.contactId === "marie")?.blockingReasons)
      .toContain("Adresse courriel manquante.");
  });

  it("signale Gmail déconnecté sans faire de requête réseau", () => {
    const occurrences = calculateAutomaticEmailOccurrences([rule()], dataset({
      contacts: [{ id: "contact", firstName: "Marie", lastName: "Ève", email: "marie@example.com", broker: "maxime", birthDate: "1992-08-24", mortgageRenewalDate: null }],
      connections: [connection("maxime", false, false)],
    }), "2026-08-24", "2026-08-24");
    expect(occurrences[0].gmailConnected).toBe(false);
    expect(occurrences[0].blockingReasons).toContain("Gmail n’est pas connecté pour Maxime.");
  });

  it("déduplique la même occurrence par rule_id et occurrence_key", () => {
    const birthdayRule = rule();
    const previewDataset = dataset({ contacts: [{ id: "contact", firstName: "Jean", lastName: "Roy", email: "jean@example.com", broker: "maxime", birthDate: "1990-08-24", mortgageRenewalDate: null }] });
    expect(calculateAutomaticEmailOccurrences([birthdayRule, birthdayRule], previewDataset, "2026-08-24", "2026-08-24")).toHaveLength(1);
  });

  it("garde le master lock faux par défaut et n’ajoute aucune route d’envoi automatique", () => {
    delete process.env.AUTOMATIC_EMAILS_ENABLED;
    expect(automaticEmailsEnabled()).toBe(false);
    process.env.AUTOMATIC_EMAILS_ENABLED = "TRUE";
    expect(automaticEmailsEnabled()).toBe(false);
    process.env.AUTOMATIC_EMAILS_ENABLED = "true";
    expect(automaticEmailsEnabled()).toBe(true);
    const root = process.cwd();
    expect(() => readFileSync(resolve(root, "app/api/automatic-emails/run/route.ts"), "utf8")).toThrow();
    expect(() => readFileSync(resolve(root, "app/api/automatic-emails/send/route.ts"), "utf8")).toThrow();
    expect(() => readFileSync(resolve(root, "app/api/automatic-emails/send-auto/route.ts"), "utf8")).toThrow();
    expect(() => readFileSync(resolve(root, "app/api/cron/automatic-emails/route.ts"), "utf8")).toThrow();
    const sources = [
      ...productionSources(resolve(root, "app/api/automatic-emails")),
      ...productionSources(resolve(root, "app/lib/automatic-emails")),
    ].join("\n");
    expect(sources).not.toContain("sendGmailMessage");
    expect(sources).not.toContain("messages.send");
    expect(sources).not.toContain("/gmail/v1/users/me/messages/send");
    expect(sources).not.toContain('from("automatic_email_deliveries").insert');
  });
});
