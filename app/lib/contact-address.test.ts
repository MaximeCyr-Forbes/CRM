import { describe, expect, it } from "vitest";
import { getContactAddressLines, getContactFullAddress, type ContactDraft } from "../data/contact-types";
import { normalizeContactDraft } from "./contact-import";
import { getDefaultDraftMergeSources, mergeContactDraftFields } from "./contact-merge";

function draft(values: Partial<ContactDraft> = {}): ContactDraft {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    birthDate: "",
    mortgageRenewalDate: "",
    civicNumber: "",
    address: "",
    apartment: "",
    city: "",
    province: "",
    postalCode: "",
    country: "",
    ...values,
  };
}

describe("adresse résidentielle", () => {
  it("compose une adresse sans séparateurs vides", () => {
    const contact = draft({
      civicNumber: "150",
      address: "Avenue Léo-Lacombe",
      apartment: "4",
      city: "Deux-Montagnes",
      province: "QC",
      postalCode: "J7R 3W7",
    });

    expect(getContactAddressLines(contact)).toEqual([
      "150 Avenue Léo-Lacombe, app. 4",
      "Deux-Montagnes, QC J7R 3W7",
    ]);
    expect(getContactFullAddress(contact)).toBe("150 Avenue Léo-Lacombe, app. 4, Deux-Montagnes, QC J7R 3W7");
  });

  it.each([
    ["150", "Avenue Léo-Lacombe", "150 Avenue Léo-Lacombe"],
    ["820", "25e Avenue", "820 25e Avenue"],
    ["1193", "rue Ovila-Forget", "1193 rue Ovila-Forget"],
    ["123A", "rue Principale", "123A rue Principale"],
    ["123-B", "rue Principale", "123-B rue Principale"],
  ])("compose le numéro civique %s avec la rue", (civicNumber, address, expected) => {
    expect(getContactFullAddress(draft({ civicNumber, address }))).toBe(expected);
  });

  it("n'affiche pas un numéro civique isolé sans rue", () => {
    expect(getContactFullAddress(draft({ civicNumber: "150" }))).toBe("");
  });

  it("normalise une correction pré-import en NFC sans retirer les accents", () => {
    const corrected = normalizeContactDraft(draft({
      firstName: " Simon Pierre ",
      lastName: " Be\u0301liveau ",
      address: " 125 Avenue Le\u0301o-Lacombe ",
      city: " Deux-Montagnes ",
    }));

    expect(corrected).toMatchObject({
      firstName: "Simon Pierre",
      lastName: "Béliveau",
      address: "125 Avenue Léo-Lacombe",
      city: "Deux-Montagnes",
    });
  });

  it("prend automatiquement l'adresse importée lorsqu'elle manque au doublon existant", () => {
    const existing = draft({ firstName: "Simon Pierre", lastName: "Béliveau", email: "simon@example.ca" });
    const incoming = draft({
      firstName: "Simon Pierre",
      lastName: "Béliveau",
      email: "simon@example.ca",
      civicNumber: "150",
      address: "125 Avenue Léo-Lacombe",
      city: "Deux-Montagnes",
      province: "QC",
      postalCode: "J7R 3W7",
    });
    const sources = getDefaultDraftMergeSources(existing);
    const merged = mergeContactDraftFields(existing, incoming, sources);

    expect(merged).toMatchObject({
      civicNumber: "150",
      address: "125 Avenue Léo-Lacombe",
      city: "Deux-Montagnes",
      province: "QC",
      postalCode: "J7R 3W7",
    });
  });

  it("fusionne une date manquante et conserve un choix humain en cas de conflit", () => {
    const incoming = draft({ birthDate: "1975-10-06" });
    const missing = draft();
    expect(mergeContactDraftFields(missing, incoming, getDefaultDraftMergeSources(missing)).birthDate).toBe("1975-10-06");

    const identical = draft({ birthDate: "1975-10-06" });
    expect(mergeContactDraftFields(identical, incoming, getDefaultDraftMergeSources(identical)).birthDate).toBe("1975-10-06");

    const different = draft({ birthDate: "1976-10-06" });
    const sources = getDefaultDraftMergeSources(different);
    expect(sources.birthDate).toBe("existing");
    expect(mergeContactDraftFields(different, incoming, sources).birthDate).toBe("1976-10-06");
    expect(mergeContactDraftFields(different, incoming, { ...sources, birthDate: "incoming" }).birthDate).toBe("1975-10-06");
  });
});
