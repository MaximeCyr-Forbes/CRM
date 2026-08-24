import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("interface de l’historique immobilier du Contact", () => {
  it("remplace l’ancienne section et la place entre les adresses et les notes", () => {
    const profile = source("app/contacts/[contactId]/page.tsx");
    const addresses = profile.indexOf("profile-addresses-section");
    const history = profile.indexOf("<ContactPropertyHistory");
    const notes = profile.indexOf("<ClientHistory");

    expect(profile).not.toContain("TRANSACTIONS LIÉES");
    expect(addresses).toBeGreaterThan(-1);
    expect(history).toBeGreaterThan(addresses);
    expect(notes).toBeGreaterThan(history);
    expect(profile).toContain("useListings()");
    expect(profile).toContain("new Map(listings.map");
  });

  it("affiche le résumé, les deux types de dossiers et les navigations attendues", () => {
    const component = source("app/components/contact-property-history.tsx");
    for (const label of ["HISTORIQUE IMMOBILIER", "Dossiers", "Achats", "Ventes", "Volume conclu", "ACHAT", "VENTE"]) {
      expect(component).toContain(label);
    }
    expect(component).toContain("LISTING FORBES");
    expect(component).toContain("Délai avant PA");
    expect(component).toContain("transaction.type === \"sale\"");
    expect(component).toContain("/transactions/${transaction.id}");
    expect(component).toContain("/listings/${sourceListingLink.listingId}");
  });

  it("utilise uniquement les classes dédiées demandées", () => {
    const component = source("app/components/contact-property-history.tsx");
    const css = source("app/globals.css");
    for (const className of [
      "contact-property-history",
      "contact-property-history-summary",
      "contact-property-history-grid",
      "contact-property-history-card",
      "contact-property-history-badges",
      "contact-property-history-details",
      "contact-property-history-actions",
    ]) {
      expect(component).toContain(className);
      expect(css).toContain(`.${className}`);
    }
  });
});
