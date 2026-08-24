import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateFollowUpDate } from "../lib/follow-up";
import { appNavigationOrder } from "./software-links";

const root = process.cwd();
const removedFeature = ["pipe", "line"].join("");
const removedRoute = `/${removedFeature}`;
const removedHistory = `${removedFeature}_history`;
const camelBuyerStage = `buyer${removedFeature[0].toUpperCase()}${removedFeature.slice(1)}Stage`;
const camelSellerStage = `seller${removedFeature[0].toUpperCase()}${removedFeature.slice(1)}Stage`;

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("retrait du parcours commercial des contacts", () => {
  it("conserve l'ordre exact de la navigation sans l'ancienne route", () => {
    expect(appNavigationOrder).toEqual([
      "Accueil",
      "Contacts",
      "Listings",
      "Transactions",
      "Calendrier",
      "Statistiques",
      "Courriels Auto",
      "Logiciels",
      "Paramètres",
    ]);
    expect(source("app/components/app-header.tsx")).not.toContain(removedRoute);
    expect(existsSync(resolve(root, `app/${removedFeature}`))).toBe(false);
    const proxy = source("proxy.ts");
    expect(proxy).toContain(`path === "${removedRoute}"`);
    expect(proxy).toContain('new URL("/contacts", request.url)');
  });

  it("retire les étapes du modèle Contact et de la fiche détaillée", () => {
    const contactTypes = source("app/data/contact-types.ts");
    const contactProfile = source("app/contacts/[contactId]/page.tsx");

    expect(contactTypes).not.toContain(camelBuyerStage);
    expect(contactTypes).not.toContain(camelSellerStage);
    expect(contactProfile).not.toContain(camelBuyerStage);
    expect(contactProfile).not.toContain(camelSellerStage);
    expect(contactProfile).not.toContain(`update${removedFeature[0].toUpperCase()}${removedFeature.slice(1)}Stage`);
  });

  it("conserve les contacts, relances, notes, adresses et transactions liées", () => {
    const dataContext = source("app/crm-data-context.tsx");
    const contactProfile = source("app/contacts/[contactId]/page.tsx");

    expect(dataContext).toContain("addManualContact");
    expect(dataContext).toContain("updateContact");
    expect(dataContext).toContain("updateFollowUp");
    expect(dataContext).toContain("mergeContacts");
    expect(contactProfile).toContain("FollowUpSchedulerModal");
    expect(contactProfile).toContain("ClientHistory");
    expect(contactProfile).toContain("ContactAddressManager");
    expect(contactProfile).toContain("TRANSACTIONS LIÉES");
    expect(calculateFollowUpDate("one-week", undefined, new Date(2026, 7, 19))).toBe("2026-08-26");
  });

  it("retire la dépendance SQL des fusions sans opération destructive sur contacts", () => {
    const migration = source(`supabase/migrations/20260819131843_remove_contact_${removedFeature}.sql`);
    const schema = source("supabase/schema.sql");

    expect(schema).not.toContain(removedHistory);
    expect(migration.match(new RegExp(`update\\s+public\\.${removedHistory}`, "gi"))).toBeNull();
    expect(migration).not.toMatch(/delete\s+from\s+public\.contacts/i);
    expect(migration).not.toMatch(/truncate/i);
    expect(migration).not.toMatch(/drop\s+table\s+(?:if\s+exists\s+)?public\.contacts/i);
    expect(migration).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.contacts/i);
    expect(migration).toContain(`crm_${removedFeature}_removal_contact_count`);
  });
});
