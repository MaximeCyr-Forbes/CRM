import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { TransactionDraft } from "../../data/transaction-types";
import { analyzeExtractedOaciqDocuments } from "../oaciq-reader/parser";
import { extractTransactionDetails } from "../oaciq-reader/transaction-details";
import { prefillPromise } from "./oaciq-prefill-fixtures";
import { matchOaciqParty, prefillOaciqTransaction, preserveOaciqPrice, type OaciqPrefillField } from "./oaciq-prefill";

const initial: TransactionDraft = { address: "", centrisNumber: "", price: null, promiseDate: null, broker: "maxime", type: "purchase", status: "new", contactIds: [], generalNotes: "Note conservée" };
const doc = prefillPromise();
const analysis = { ...analyzeExtractedOaciqDocuments([doc]), ...extractTransactionDetails(doc), requiresReview: false };
const jean = { id: "jean", firstName: "Jean", lastName: "Tremblay", email: "jean@example.test", phone: "" };
const run = (a = analysis, dirty = new Set<OaciqPrefillField>(), values = initial, price = "") => prefillOaciqTransaction(values, price, a, [jean], dirty);

describe("préremplissage OACIQ prudent du formulaire existant", () => {
  it("remplit PA seule et ajoute un contact fiable sans toucher courtier/type/statut", () => {
    const result = run();
    expect(result.values).toMatchObject({ address: "123 rue Test, Ville-Test, QC, H0H 0H0", promiseDate: "2026-09-01", broker: "maxime", type: "purchase", status: "new", generalNotes: "Note conservée", contactIds: ["jean"], centrisNumber: "" });
    expect(result.price).toBe("450000");
    expect(analysis.acceptanceDateTime?.slice(0, 10)).toBe("2026-09-10");
  });
  it.each([475000, 500000])("applique le prix final consolidé %i, pas le premier prix PA", (finalPrice) => expect(run({ ...analysis, finalPrice }).price).toBe(String(finalPrice)));
  it.each([null, NaN, Infinity, -1, 0, 1e13])("ignore le prix invalide %s sans effacer le formulaire", (finalPrice) => expect(run({ ...analysis, finalPrice }, new Set(), initial, "460000").price).toBe("460000"));
  it("protège les valeurs tapées avant analyse et conserve tous les contacts déjà liés", () => {
    const values = { ...initial, address: "Mon adresse", promiseDate: "2026-08-30", contactIds: ["existing"] };
    const result = run(analysis, new Set(["address", "price", "promiseDate"]), values, "460000");
    expect(result.values).toMatchObject({ address: "Mon adresse", promiseDate: "2026-08-30", contactIds: ["existing", "jean"] });
    expect(result.price).toBe("460000"); expect(result.conflicts).toHaveLength(3);
  });
  it("actualise une valeur automatique à la réanalyse, mais propose une valeur manuellement corrigée", () => {
    const first = run();
    const bo = { ...analysis, finalPrice: 475000 };
    expect(prefillOaciqTransaction(first.values, first.price, bo, [jean], new Set(), first.applied).price).toBe("475000");
    const edited = prefillOaciqTransaction(first.values, "460000", bo, [jean], new Set(["price"]), first.applied);
    expect(edited.price).toBe("460000"); expect(edited.conflicts).toContainEqual({ field: "price", value: "475000" });
  });
  it("Centris peut compléter son numéro mais jamais remplacer le prix final OACIQ", () => {
    const centris = { ...initial, centrisNumber: "12345678", price: 425000 };
    expect(preserveOaciqPrice(centris, "500000", true)).toMatchObject({ centrisNumber: "12345678", price: 500000 });
    expect(preserveOaciqPrice(centris, "495000", true).price).toBe(495000);
    expect(preserveOaciqPrice(centris, "", true).price).toBeNull();
    expect(preserveOaciqPrice(centris, "", false).price).toBe(425000);
  });
  it("sans détection fiable, ne copie ni Non détecté ni date d’acceptation", () => {
    const missing = { ...analysis, propertyAddress: "Non détectée", paDate: null, finalPrice: null };
    expect(run(missing).values).toMatchObject({ address: "", promiseDate: null });
  });
  it("respecte la sélection Vente provenant d’un workflow Listing", () => expect(run(analysis, new Set(), { ...initial, type: "sale", status: "pa_accepted" }).values).toMatchObject({ type: "sale", status: "pa_accepted" }));
  it("utilise une seule extraction et garde le dernier state lors du retour asynchrone", () => {
    const adapter = readFileSync("app/lib/transactions/oaciq-analysis.ts", "utf8");
    expect(adapter).not.toContain("parsePurchaseAgreement"); expect(adapter).not.toContain("extractPositionedTextFromPDF");
    const modal = readFileSync("app/components/transaction-editor-modal.tsx", "utf8");
    expect(modal).toContain("const current = latestForm.current");
    expect(modal).toContain("onAnalyzed={applyOaciqAnalysis}");
    expect(modal).not.toContain("analysis.acceptanceDateTime?.slice");
  });
});

describe("correspondances strictes des parties", () => {
  const p = analysis.buyers[0];
  it("refuse un homonyme sans identifiant et ne choisit jamais au hasard", () => expect(matchOaciqParty({ ...p, email: "" }, [jean, { ...jean, id: "other" }])).toEqual({ contactId: null, ambiguous: true }));
  it("distingue les homonymes par email exact", () => expect(matchOaciqParty(p, [jean, { ...jean, id: "other", email: "other@example.test" }]).contactId).toBe("jean"));
  it("refuse les identifiants contradictoires et les adresses email partagées", () => {
    expect(matchOaciqParty({ ...p, phone: "5145550101" }, [jean, { ...jean, id: "other", email: "other@example.test", phone: "514-555-0101" }]).contactId).toBeNull();
    expect(matchOaciqParty(p, [jean, { ...jean, id: "other" }]).contactId).toBeNull();
  });
  it("compare prénoms/noms exacts normalisés (accents, espaces, tirets)", () => {
    const party = analysis.buyers[1];
    expect(matchOaciqParty(party, [{ ...jean, firstName: " MARIE ÈVE ", lastName: "NOEL", email: "" }]).contactId).toBe("jean");
    expect(matchOaciqParty(party, [{ ...jean, firstName: "Marie", lastName: "Noël" }]).contactId).toBeNull();
  });
  it("utilise le téléphone exact international et signale les absents sans création", () => {
    expect(matchOaciqParty(analysis.sellers[0], [{ ...jean, phone: "+1 (514) 555-0101" }]).contactId).toBe("jean");
    expect(matchOaciqParty(p, [])).toEqual({ contactId: null, ambiguous: false });
  });
  it("lie plusieurs acheteurs et vendeurs sans doublonner les liens existants", () => {
    const contacts = [...analysis.buyers, ...analysis.sellers].map((p, i) => ({ ...p, id: String(i) }));
    const result = prefillOaciqTransaction({ ...initial, contactIds: ["0"] }, "", analysis, contacts, new Set());
    expect(result.values.contactIds).toEqual(["0", "1", "2", "3"]);
  });
});
