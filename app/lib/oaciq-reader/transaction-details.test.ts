import { describe, expect, it } from "vitest";
import { prefillPromise } from "../transactions/oaciq-prefill-fixtures";
import { document, word } from "./test-fixtures";
import { extractTransactionDetails } from "./transaction-details";

describe("données transactionnelles de la PA principale, sans deuxième lecture PDF", () => {
  it("lit seulement l’immeuble 3.1 et conserve parties, rôles et sources", () => {
    const result = extractTransactionDetails(prefillPromise());
    expect(result.propertyAddress).toBe("123 rue Test, Ville-Test, QC, H0H 0H0");
    expect(result.buyers.map((p) => p.fullName)).toEqual(["Jean Tremblay", "Marie-Ève Noël"]);
    expect(result.sellers.map((p) => p.fullName)).toEqual(["Hélène Côté", "Louis-Philippe Richer"]);
    expect(result.buyers[0]).toMatchObject({ firstName: "Jean", lastName: "Tremblay", email: "jean@example.test", role: "buyer" });
    expect(result.fieldSources.propertyAddress).toMatchObject({ sourceDocument: "PA-test.pdf", sourceSection: "3.1", confidence: "high" });
    expect(result.centrisNumber).toBe("");
  });
  it("n’utilise jamais les adresses des parties si 3.1 est vide", () => {
    const doc = prefillPromise(); doc.pages = doc.pages.slice(0, 1);
    expect(extractTransactionDetails(doc).propertyAddress).toBe("");
  });
  it("ne prend aucun nom de courtier, témoin ou mandataire dans les emplacements", () => {
    const doc = prefillPromise();
    doc.pages[0].words = doc.pages[0].words.filter((w) => w.text !== "Jean Tremblay");
    doc.pages[0].words.push(word("Représenté par", 40, 120), word("Mandataire Exemple", 40, 130));
    const result = extractTransactionDetails(doc);
    expect(result.buyers.map((p) => p.fullName)).not.toContain("Mandataire Exemple");
    expect(result.sellers.map((p) => p.fullName)).not.toContain("Autre Courtier");
  });
  it("garde la signature PA distincte de la réponse vendeur et de l’accusé", () => {
    const result = extractTransactionDetails(prefillPromise());
    expect(result.paDate).toBe("2026-09-01");
    expect(result.fieldSources.paDate?.sourceDocument).toBe("PA-test.pdf");
  });
  it("reconnaît la section 16 réelle et exclut la date du témoin placée sous l’acheteur", () => {
    const doc = prefillPromise();
    doc.pages[1].words = doc.pages[1].words.map((w) => ({ ...w, text: w.text.replace("13. SIGNATURES", "16. SIGNATURES") }));
    doc.pages[1].words.push(word("SIGNATURE DE L’ACHETEUR 1", 40, 525), word("Signé le 2026-09-04", 40, 530), word("TÉMOIN - SIGNATURE", 40, 540));
    doc.pages[1].text = doc.pages[1].words.sort((a, b) => a.top - b.top).map((w) => w.text).join("\n");
    expect(extractTransactionDetails(doc).paDate).toBe("2026-09-01");
  });
  it("n’invente pas une date PA depuis la seule acceptation", () => {
    const doc = prefillPromise();
    doc.pages[1].text = doc.pages[1].text.replace("Signé le 2026-09-01 10:00:00", "");
    expect(extractTransactionDetails(doc).paDate).toBeNull();
  });
  it("refuse les dates invalides et normalise une date française explicite", () => {
    const doc = prefillPromise();
    doc.pages[1].text = doc.pages[1].text.replace("2026-09-01", "2026-02-30");
    expect(extractTransactionDetails(doc).paDate).toBeNull();
    doc.pages[1].text += "\nDate de la PA : 1 septembre 2026";
    expect(extractTransactionDetails(doc).paDate).toBe("2026-09-01");
  });
  it("convertit une signature acheteur en jour Toronto seulement dans la zone 13", () => {
    const doc = prefillPromise();
    doc.pages[1].text = doc.pages[1].text.replace("Signé le 2026-09-01 10:00:00", "");
    doc.signatures.push({ field: "buyer", name: "Jean Tremblay", contact: "", reason: "", signedAt: "2026-09-02T02:00:00Z", pageIndex: 1, top: 510 });
    expect(extractTransactionDetails(doc).paDate).toBe("2026-09-01");
    doc.signatures[0].top = 680;
    expect(extractTransactionDetails(doc).paDate).toBeNull();
  });
  it("ne confond ni PA/CP ni numéros de formulaire et inscription", () => {
    expect(extractTransactionDetails(document("CP.pdf", "CONTRE-PROPOSITION CP 20002\nDate de la PA : 2026-09-12")).paDate).toBeNull();
    expect(extractTransactionDetails(prefillPromise(true)).centrisNumber).toBe("12345678");
    const doc = prefillPromise(true); doc.pages[1].text += "\nNuméro Centris : 87654321";
    expect(extractTransactionDetails(doc).centrisNumber).toBe("");
  });
});
