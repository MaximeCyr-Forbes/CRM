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
      address: "125 Avenue Léo-Lacombe",
      apartment: "4",
      city: "Deux-Montagnes",
      province: "QC",
      postalCode: "J7R 3W7",
    });

    expect(getContactAddressLines(contact)).toEqual([
      "125 Avenue Léo-Lacombe, app. 4",
      "Deux-Montagnes, QC J7R 3W7",
    ]);
    expect(getContactFullAddress(contact)).toBe("125 Avenue Léo-Lacombe, app. 4, Deux-Montagnes, QC J7R 3W7");
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
      address: "125 Avenue Léo-Lacombe",
      city: "Deux-Montagnes",
      province: "QC",
      postalCode: "J7R 3W7",
    });
    const sources = getDefaultDraftMergeSources(existing);
    const merged = mergeContactDraftFields(existing, incoming, sources);

    expect(merged).toMatchObject({
      address: "125 Avenue Léo-Lacombe",
      city: "Deux-Montagnes",
      province: "QC",
      postalCode: "J7R 3W7",
    });
  });
});
