import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CalendarConnectionStatus } from "../../data/calendar-types";
import {
  CUSTOM_EMAIL_VARIABLES,
  customCampaignConfigurationIssues,
  parseCustomContactIds,
  parseCustomEmailCampaignDraft,
  parseCustomEmailCampaignStepDraft,
  parseCustomStepOrder,
  type CustomEmailCampaign,
  type CustomEmailCampaignContact,
  type CustomEmailCampaignStep,
} from "../../data/custom-email-campaign-types";
import { AUTOMATIC_EMAIL_RUNNER_AVAILABLE } from "./master-lock";
import { calculateCustomCampaignOccurrences, customCampaignDuration, resolveCustomEmailTemplate } from "./custom-campaign-calculations";

const IDS = {
  campaign: "11111111-1111-4111-8111-111111111111",
  jean: "22222222-2222-4222-8222-222222222222",
  marie: "33333333-3333-4333-8333-333333333333",
  step1: "44444444-4444-4444-8444-444444444444",
  step2: "55555555-5555-4555-8555-555555555555",
  step3: "66666666-6666-4666-8666-666666666666",
};

function connection(broker: "france" | "maxime" | "sandrine", gmail = true, signature = true): CalendarConnectionStatus {
  return { broker, connected: gmail, email: `${broker}@example.com`, gmailSendEnabled: gmail, gmailSignatureEnabled: signature, centrisShowings: { scopeGranted: true, calendarDetected: true, status: "synchronized" }, birthdays: { synced: 0, pending: 0, error: 0 }, mortgageRenewals: { synced: 0, pending: 0, error: 0 }, watch: { changeVersion: 0, lastNotificationAt: null, watchActive: false, expiresAt: null } };
}

function campaign(values: Partial<CustomEmailCampaign> = {}): CustomEmailCampaign {
  return { id: IDS.campaign, name: "Prospection 2026", status: "ready", executionMode: "automatic", senderStrategy: "assigned_broker", fixedBroker: null, fallbackBroker: "maxime", startDate: "2026-09-01", sendHour: 9, sendMinute: 0, timezone: "America/Toronto", contactCount: 2, stepCount: 3, durationDays: 10, createdAt: "2026-08-24T12:00:00Z", updatedAt: "2026-08-24T12:00:00Z", ...values };
}

function contact(id: string, firstName: string, broker: CustomEmailCampaignContact["broker"], email = `${firstName.toLowerCase()}@example.com`): CustomEmailCampaignContact {
  return { id, firstName, lastName: firstName === "Jean" ? "Tremblay" : "Gagnon", email, phone: "514-555-0101", broker, selected: true };
}

function steps(): CustomEmailCampaignStep[] {
  return [
    { id: IDS.step1, campaignId: IDS.campaign, stepOrder: 1, delayDaysAfterPrevious: 0, subjectTemplate: "Présentation", bodyTemplate: "Bonjour {{firstName}}", createdAt: "", updatedAt: "" },
    { id: IDS.step2, campaignId: IDS.campaign, stepOrder: 2, delayDaysAfterPrevious: 3, subjectTemplate: "Suivi {{fullName}}", bodyTemplate: "Téléphone : {{phone}}", createdAt: "", updatedAt: "" },
    { id: IDS.step3, campaignId: IDS.campaign, stepOrder: 3, delayDaysAfterPrevious: 7, subjectTemplate: "Dernier suivi", bodyTemplate: "Courriel : {{email}}", createdAt: "", updatedAt: "" },
  ];
}

function productionSources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) return productionSources(path);
    return /\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") ? [readFileSync(path, "utf8")] : [];
  });
}

describe("campagnes courriel personnalisées en simulation", () => {
  it("valide strictement campagne, sélection, étapes et ordre", () => {
    expect(CUSTOM_EMAIL_VARIABLES).toEqual(["firstName", "lastName", "fullName", "email", "phone"]);
    expect(parseCustomEmailCampaignDraft({ name: "Prospection", status: "draft", executionMode: "approval", senderStrategy: "assigned_broker", fixedBroker: null, fallbackBroker: "france", startDate: "2026-09-01", sendHour: 9, sendMinute: 0, timezone: "America/Toronto" })).not.toBeNull();
    expect(parseCustomEmailCampaignDraft({ name: "Prospection", status: "active", executionMode: "approval", senderStrategy: "assigned_broker", fixedBroker: null, fallbackBroker: "france", startDate: "2026-09-01", sendHour: 9, sendMinute: 0, timezone: "America/Toronto" })).toBeNull();
    expect(parseCustomEmailCampaignStepDraft({ delayDaysAfterPrevious: 3, subjectTemplate: "Objet", bodyTemplate: "Message" })).not.toBeNull();
    expect(parseCustomEmailCampaignStepDraft({ delayDaysAfterPrevious: 3651, subjectTemplate: "Objet", bodyTemplate: "Message" })).toBeNull();
    expect(parseCustomContactIds({ contactIds: [IDS.jean, IDS.marie] })).toEqual([IDS.jean, IDS.marie]);
    expect(parseCustomContactIds({ contactIds: [IDS.jean, IDS.jean] })).toBeNull();
    expect(parseCustomStepOrder({ stepIds: [IDS.step3, IDS.step1, IDS.step2] })).toEqual([IDS.step3, IDS.step1, IDS.step2]);
    expect(customCampaignDuration(steps())).toBe(10);
  });

  it("calcule Jour 0, Jour 3 et Jour 10 pour Jean et Marie sans envoi", () => {
    const occurrences = calculateCustomCampaignOccurrences(campaign(), [contact(IDS.jean, "Jean", "maxime"), contact(IDS.marie, "Marie", "france")], steps(), [connection("maxime"), connection("france"), connection("sandrine")]);
    expect(occurrences).toHaveLength(6);
    expect(occurrences.filter((item) => item.contactId === IDS.jean).map((item) => item.scheduledDate)).toEqual(["2026-09-01", "2026-09-04", "2026-09-11"]);
    expect(occurrences.filter((item) => item.contactId === IDS.marie).map((item) => item.scheduledDate)).toEqual(["2026-09-01", "2026-09-04", "2026-09-11"]);
    expect(occurrences[0].occurrenceKey).toBe(`custom:${IDS.campaign}:${IDS.jean}:${IDS.step1}`);
    expect(AUTOMATIC_EMAIL_RUNNER_AVAILABLE).toBe(false);
  });

  it("personnalise chaque modèle avec les données fiables du Contact", () => {
    expect(resolveCustomEmailTemplate("Bonjour {{firstName}} {{lastName}} — {{email}} — {{phone}}", contact(IDS.jean, "Jean", "maxime"))).toBe("Bonjour Jean Tremblay — jean@example.com — 514-555-0101");
    const occurrences = calculateCustomCampaignOccurrences(campaign(), [contact(IDS.jean, "Jean", "maxime"), contact(IDS.marie, "Marie", "france")], steps(), [connection("maxime"), connection("france")]);
    expect(occurrences.find((item) => item.contactId === IDS.jean && item.stepOrder === 1)?.message).toBe("Bonjour Jean");
    expect(occurrences.find((item) => item.contactId === IDS.marie && item.stepOrder === 1)?.message).toBe("Bonjour Marie");
  });

  it("résout l’expéditeur attribué, fixe et de secours", () => {
    const connections = [connection("maxime"), connection("france"), connection("sandrine")];
    const assigned = calculateCustomCampaignOccurrences(campaign(), [contact(IDS.jean, "Jean", "maxime"), contact(IDS.marie, "Marie", "france")], [steps()[0]], connections);
    expect(assigned.map((item) => item.broker)).toEqual(["maxime", "france"]);
    const fixed = calculateCustomCampaignOccurrences(campaign({ senderStrategy: "fixed_broker", fixedBroker: "sandrine", fallbackBroker: null }), [contact(IDS.jean, "Jean", "maxime"), contact(IDS.marie, "Marie", "france")], [steps()[0]], connections);
    expect(fixed.map((item) => item.broker)).toEqual(["sandrine", "sandrine"]);
    const fallback = calculateCustomCampaignOccurrences(campaign(), [contact(IDS.jean, "Jean", "unassigned")], [steps()[0]], connections);
    expect(fallback[0].broker).toBe("maxime");
  });

  it("bloque une adresse manquante et les configurations READY incomplètes", () => {
    const noEmail = contact(IDS.jean, "Jean", "unassigned", "");
    const occurrences = calculateCustomCampaignOccurrences(campaign(), [noEmail], [steps()[0]], [connection("maxime")]);
    expect(occurrences[0].blockingReasons).toContain("Adresse courriel manquante.");
    expect(customCampaignConfigurationIssues(campaign({ fallbackBroker: null }), [noEmail], steps())).toContain("Choisissez le courtier de secours des Contacts non attribués.");
    expect(customCampaignConfigurationIssues(campaign(), [], [])).toEqual(expect.arrayContaining(["Sélectionnez au moins un Contact.", "Ajoutez au moins un courriel."]));
  });

  it("ne contient aucun runner, appel Gmail automatique ou écriture delivery", () => {
    const root = process.cwd();
    const sources = [...productionSources(resolve(root, "app/api/automatic-emails/custom-campaigns")), ...productionSources(resolve(root, "app/lib/automatic-emails"))].join("\n");
    for (const forbidden of ["sendGmailMessage", "messages.send", "/gmail/v1/users/me/messages/send", 'from("automatic_email_deliveries").insert', 'from("custom_email_campaign_deliveries")']) expect(sources).not.toContain(forbidden);
    for (const route of ["run", "send", "execute", "dispatch", "cron"]) expect(() => readFileSync(resolve(root, `app/api/automatic-emails/custom-campaigns/${route}/route.ts`), "utf8")).toThrow();
  });

  it("protège toutes les API et contrôle l’origine de chaque écriture", () => {
    const root = process.cwd();
    const read = (path: string) => readFileSync(resolve(root, path), "utf8");
    const routes = [
      "app/api/automatic-emails/custom-campaigns/route.ts",
      "app/api/automatic-emails/custom-campaigns/[campaignId]/route.ts",
      "app/api/automatic-emails/custom-campaigns/[campaignId]/contacts/route.ts",
      "app/api/automatic-emails/custom-campaigns/[campaignId]/steps/route.ts",
      "app/api/automatic-emails/custom-campaigns/[campaignId]/steps/[stepId]/route.ts",
      "app/api/automatic-emails/custom-campaigns/[campaignId]/preview/route.ts",
    ];
    for (const route of routes) expect(read(route)).toContain("requireApiAccess");
    for (const route of routes.slice(0, 5)) {
      const source = read(route);
      if (/export async function (POST|PUT|PATCH|DELETE)/.test(source)) expect(source).toContain("isSameOriginRequest");
    }
    expect(read(routes[5])).toContain("simulationOnly");
  });
});
