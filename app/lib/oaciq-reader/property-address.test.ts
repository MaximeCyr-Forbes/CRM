import { describe, expect, it } from "vitest";
import { extractPAPropertyAddress } from "./property-address";
import { analyzeExtractedOaciqDocuments } from "./parser";
import { counter, document, promise, word } from "./test-fixtures";
import { prefillPromise } from "../transactions/oaciq-prefill-fixtures";
import { extractTransactionDetails } from "./transaction-details";

// Entirely synthetic: the private regression PDF is tested outside Git.
const section = (address: string) => `3. DESCRIPTION SOMMAIRE DE L'IMMEUBLE\n3.1 L'immeuble est décrit comme suit :\n${address}\nDÉSIGNATION CADASTRALE\n9999999\n4. PRIX`;
const pa = (address: string, number = "10001") => {
  const doc = promise({ number });
  doc.pages[0].text += `\n${section(address)}`;
  return doc;
};

describe("canonical PA clause 3.1 address", () => {
  it.each(["64Z", "123A", "123-125", "306Z-306AZ"])("preserves civic %s", civic => {
    expect(extractPAPropertyAddress(pa(`${civic} Rue Exemple, Laval, H0H 0H0, QC`))).toMatchObject({
      propertyAddress: `${civic} Rue Exemple, Laval, H0H 0H0, QC`,
      propertyCivicNumber: civic, propertyStreet: "Rue Exemple", propertyCity: "Laval",
      propertyPostalCode: "H0H 0H0", propertyProvince: "QC",
    });
  });
  it("never uses buyer or seller addresses", () => {
    const doc = pa("300 rue Immeuble, Laval, H0H 0H0");
    doc.pages[0].text = `1. PARTIES\n10 rue Acheteur\n20 rue Vendeur\n${doc.pages[0].text}`;
    expect(extractPAPropertyAddress(doc)?.propertyAddress).toBe("300 rue Immeuble, Laval, H0H 0H0");
    doc.pages[0].text = doc.pages[0].text.replace("300 rue Immeuble, Laval, H0H 0H0", "");
    const result = analyzeExtractedOaciqDocuments([doc]);
    expect(result.propertyAddress).toBeNull();
    expect(result.warnings).toContain("Adresse de l’immeuble non détectée dans la clause 3.1.");
  });
  it("requires the section and excludes later clauses", () => {
    expect(extractPAPropertyAddress(document("PA.pdf", "3.1\n300 rue Exemple, Laval"))).toBeNull();
    expect(extractPAPropertyAddress(pa("3.2\n300 rue Exemple, Laval"))).toBeNull();
  });
  it("reconstructs multiline address values", () => {
    expect(extractPAPropertyAddress(pa("300 rue Exemple\nLaval\nQC\nH0H 0H0"))).toMatchObject({ propertyCity: "Laval", propertyProvince: "QC", propertyPostalCode: "H0H 0H0" });
  });
  it("reconstructs the printed columns", () => {
    const doc = pa("");
    doc.pages[0].words = [word("3. DESCRIPTION SOMMAIRE DE L'IMMEUBLE", 30, 100), word("3.1", 30, 120),
      ...["306Z-306AZ", "Rue Exemple", "Laval", "QC", "H0H 0H0"].map((text, i) => word(text, 30 + 110 * i, 140)),
      ...["NUMÉRO", "RUE", "VILLE", "PROVINCE", "CODE POSTAL"].map((text, i) => word(text, 30 + 110 * i, 160)),
      word("DÉSIGNATION CADASTRALE", 30, 180)];
    // PDF.js splits the postal caption into individual words.
    doc.pages[0].words[11].text = "CODE";
    expect(extractPAPropertyAddress(doc)?.propertyAddress).toBe("306Z-306AZ Rue Exemple, Laval, H0H 0H0, QC");
  });
  it("uses the PA associated with the CP regardless of upload order", () => {
    const selected = pa("300 rue Immeuble, Laval", "10001");
    const other = pa("900 rue Autre, Laval", "10002");
    const cp = counter({ target: "10001" });
    cp.pages[0].text += `\n${section("700 rue Annexe, Laval")}`;
    expect(analyzeExtractedOaciqDocuments([other, cp, selected]).propertyAddress).toBe("300 rue Immeuble, Laval");
    expect(() => analyzeExtractedOaciqDocuments([other, selected])).toThrow();
  });
  it("refuses different properties merged into one document", () => {
    const doc = pa("300 rue Immeuble, Laval");
    doc.pages.push(...pa("900 rue Autre, Laval").pages);
    expect(extractPAPropertyAddress(doc)).toBeNull();
  });
  it("keeps the second buyer after the wrapped first caption", () => {
    const doc = prefillPromise();
    doc.pages[0].words.push(word("REPRÉSENTANT, LIEN AVEC L'ACHETEUR", 40, 210));
    expect(extractTransactionDetails(doc).buyers.map(p => p.fullName)).toEqual(["Jean Tremblay", "Marie-Ève Noël"]);
  });
});
