import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCSVContacts, parseVCardContacts } from "../lib/contact-import";
import { formatMortgageRenewalDate, normalizeMortgageRenewalDate } from "../lib/mortgage-renewal-date";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("date de renouvellement hypothécaire du contact", () => {
  it("accepte une date future ISO et l’affiche en français", () => {
    expect(normalizeMortgageRenewalDate("2029-10-15")).toBe("2029-10-15");
    expect(formatMortgageRenewalDate("2029-10-15")).toBe("15 octobre 2029");
    expect(normalizeMortgageRenewalDate("2029-02-30")).toBe("");
  });

  it("ne détecte ni n’importe jamais la date depuis CSV ou vCard", () => {
    const csv = parseCSVContacts("Prénom,Nom,Date de renouvellement hypothécaire\nJean,Tremblay,2029-10-15");
    const vcard = parseVCardContacts([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Tremblay;Jean;;;",
      "X-MORTGAGE-RENEWAL-DATE:2029-10-15",
      "END:VCARD",
    ].join("\r\n"));
    expect(csv[0].mortgageRenewalDate).toBe("");
    expect(vcard[0].mortgageRenewalDate).toBe("");
  });

  it("expose le champ dans les créations manuelles, l’édition et la fusion", () => {
    expect(source("app/contacts/page.tsx")).toContain('mortgageRenewalDate: "Date de renouvellement hypothécaire"');
    expect(source("app/components/contact-editor-modal.tsx")).toContain("value={values.mortgageRenewalDate}");
    expect(source("app/components/transaction-editor-modal.tsx")).toContain("mortgageRenewalDate");
    expect(source("app/components/listing-editor-modal.tsx")).toContain("mortgageRenewalDate");
    expect(source("app/components/duplicate-resolution-modal.tsx")).toContain('key: "mortgageRenewalDate"');
  });

  it("conserve explicitement la valeur vide dans les deux importeurs", () => {
    expect(source("app/lib/contact-import.ts")).toContain('field === "mortgageRenewalDate"');
    expect(source("app/lib/contact-import-csv.ts")).toContain('mortgageRenewalDate: ""');
    expect(source("app/api/crm/data/route.ts")).toContain('mortgage_renewal_date: null');
  });

  it("réutilise les files bornées et recrée les événements Google absents", () => {
    const service = source("app/lib/google-calendar/service.ts");
    expect(service).toContain("syncContactMortgageRenewals");
    expect(service).toContain("Math.min(4, rows.length)");
    expect(service).toContain("response.status === 404 || response.status === 410");
    expect(service).toContain('last_error: "Google Agenda non connecté."');
    expect(service).toContain("deleteMortgageRenewalEventsForContact");
  });
});
