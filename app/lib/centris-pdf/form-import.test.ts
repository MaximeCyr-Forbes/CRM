import { describe, expect, it } from "vitest";
import type { TransactionDraft } from "../../data/transaction-types";
import { parseCentrisText } from "./parse";
import { syntheticCentrisFixtures as fixtures } from "./synthetic-fixtures";
import {
  applyCentrisTransactionImport,
  buildCentrisTransactionImportPreview,
  defaultCentrisImportSelection,
  mergeCentrisGeneralNotes,
  type CentrisImportSelection,
} from "./form-import";

function draft(values: Partial<TransactionDraft> = {}): TransactionDraft {
  return {
    address: "",
    centrisNumber: "",
    type: "purchase",
    broker: "maxime",
    contactIds: ["contact-1", "contact-2"],
    price: null,
    promiseDate: null,
    status: "inspection",
    generalNotes: "",
    ...values,
  };
}

const parse = (fixture: (typeof fixtures)[keyof typeof fixtures]) => parseCentrisText(fixture, "fixture-synthetique.pdf");
const allSelected: CentrisImportSelection = {
  address: true,
  centrisNumber: true,
  price: true,
  promiseDate: true,
  generalNotes: true,
};

describe("application contrôlée d’une fiche Centris à une Transaction", () => {
  it("applique l’adresse, le numéro Centris et le prix d’une vente", () => {
    const result = parse(fixtures.land);
    const next = applyCentrisTransactionImport(draft(), result, allSelected);
    expect(next.address).toBe(result.address.fullAddress);
    expect(next.centrisNumber).toBe("91000002");
    expect(next.price).toBe(325000);
  });

  it("applique un loyer mensuel comme prix en conservant son contexte dans le résultat", () => {
    const result = parse(fixtures.residentialRental);
    const next = applyCentrisTransactionImport(draft(), result, allSelected);
    expect(result.pricing.mode).toBe("monthly_rent");
    expect(result.pricing.monthlyAmount).toBe(6500);
    expect(next.price).toBe(6500);
  });

  it("refuse toujours de convertir ou d’appliquer un tarif annuel au pied carré", () => {
    const result = parse(fixtures.commercialPerSquareFoot);
    const current = draft({ price: 1234 });
    expect(defaultCentrisImportSelection(current, result).price).toBe(false);
    expect(applyCentrisTransactionImport(current, result, allSelected).price).toBe(1234);
  });

  it("applique uniquement la date PA explicitement suggérée", () => {
    const result = parse(fixtures.soldWithPromiseDate);
    const next = applyCentrisTransactionImport(draft(), result, allSelected);
    expect(next.promiseDate).toBe("2026-04-21");
    expect(next.promiseDate).not.toBe(result.dates.conditionsLiftedDate);
  });

  it("conserve les notes existantes et ajoute un séparateur avec un marqueur Centris", () => {
    const result = parse(fixtures.condo);
    const next = applyCentrisTransactionImport(draft({ generalNotes: "Note manuelle importante" }), result, allSelected);
    expect(next.generalNotes).toContain("Note manuelle importante\n\n---\n\nFICHE CENTRIS IMPORTÉE — No Centris 91000003");
  });

  it("ne duplique jamais deux fois le même résumé Centris", () => {
    const result = parse(fixtures.condo);
    const once = mergeCentrisGeneralNotes("", result.suggestedTransactionValues.generalNotes, result.centrisNumber);
    const twice = mergeCentrisGeneralNotes(once, result.suggestedTransactionValues.generalNotes, result.centrisNumber);
    expect(twice).toBe(once);
    expect(twice.match(/FICHE CENTRIS IMPORTÉE/g)).toHaveLength(1);
  });

  it("détecte un conflit et ne coche pas une valeur manuelle différente", () => {
    const result = parse(fixtures.condo);
    const current = draft({ address: "100 rue déjà saisie", centrisNumber: "11111111", price: 10 });
    const preview = buildCentrisTransactionImportPreview(current, result);
    const selection = defaultCentrisImportSelection(current, result);
    expect(preview.find((item) => item.field === "address")?.hasConflict).toBe(true);
    expect(selection).toMatchObject({ address: false, centrisNumber: false, price: false });
  });

  it("ne coche pas par défaut un champ de confiance faible", () => {
    const result = parse(fixtures.condo);
    result.confidence.address = "low";
    expect(defaultCentrisImportSelection(draft(), result).address).toBe(false);
  });

  it("préserve strictement courtier, type, statut et contacts", () => {
    const current = draft({ type: "sale", broker: "france", status: "on_market", contactIds: ["contact-a", "contact-b"] });
    const next = applyCentrisTransactionImport(current, parse(fixtures.soldWithPromiseDate), allSelected);
    expect(next).toMatchObject({ type: "sale", broker: "france", status: "on_market", contactIds: ["contact-a", "contact-b"] });
    expect(next.contactIds).toBe(current.contactIds);
  });
});
