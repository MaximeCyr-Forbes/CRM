import { describe, expect, it } from "vitest";
import type { Contact } from "../data/contact-types";
import {
  decodeContactImportBuffer,
  findPotentialDuplicateIndexes,
  parseCSVContacts,
  parseVCardContacts,
} from "./contact-import";

const frenchNames = [
  "Béliveau",
  "François",
  "Hélène",
  "André",
  "Côté",
  "Noël",
  "Maïté",
  "Jean-François",
  "Marie-Ève",
  "Côte-des-Neiges",
] as const;
const frenchCharacters = "é è ê ë à â ç î ï ô ù û ü É È À Ç";
const emptyAddress = { civicNumber: "", address: "", apartment: "", city: "", province: "", postalCode: "", country: "" };

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function encodeWindows1252(value: string) {
  const specialCharacters = new Map<string, number>([
    ["’", 0x92],
    ["–", 0x96],
    ["—", 0x97],
    ["“", 0x93],
    ["”", 0x94],
  ]);

  return Uint8Array.from([...value].map((character) => {
    const specialByte = specialCharacters.get(character);
    if (specialByte !== undefined) return specialByte;
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0xff) return codePoint;
    throw new Error(`Caractère absent de Windows-1252 dans le test: ${character}`);
  }));
}

function expectCleanUnicode(values: ReadonlyArray<string>) {
  for (const value of values) {
    expect(value).toBe(value.normalize("NFC"));
    expect(value).not.toMatch(/�|Ã[\u0080-\u00bf]/);
  }
}

describe("decodeContactImportBuffer et import CSV", () => {
  it("préserve les noms français en UTF-8 avec BOM", () => {
    const csv = `Prénom\r\n${frenchNames.join("\r\n")}`;
    const encoded = new TextEncoder().encode(csv);
    const bytes = new Uint8Array(encoded.length + 3);
    bytes.set([0xef, 0xbb, 0xbf]);
    bytes.set(encoded, 3);

    const text = decodeContactImportBuffer(exactArrayBuffer(bytes));
    const contacts = parseCSVContacts(text);

    expect(contacts.map((contact) => contact.firstName)).toEqual(frenchNames);
    expectCleanUnicode(contacts.map((contact) => contact.firstName));
  });

  it("utilise automatiquement Windows-1252 pour un CSV ANSI", () => {
    const csv = `Prénom;Nom;Courriel\r\n${[...frenchNames, frenchCharacters]
      .map((name, index) => `${name};L’Heureux;client${index}@exemple.ca`)
      .join("\r\n")}`;

    const text = decodeContactImportBuffer(exactArrayBuffer(encodeWindows1252(csv)));
    const contacts = parseCSVContacts(text);

    expect(contacts.map((contact) => contact.firstName)).toEqual([...frenchNames, frenchCharacters]);
    expect(contacts.every((contact) => contact.lastName === "L’Heureux")).toBe(true);
    expectCleanUnicode(contacts.flatMap((contact) => [contact.firstName, contact.lastName, contact.email]));
  });

  it("normalise les valeurs décomposées en Unicode NFC sans retirer les accents", () => {
    const decomposedCsv = "Prénom,Nom,Email\nHe\u0301le\u0300ne,Co\u0302te\u0301-des-Neiges,he\u0301lene@example.ca";
    const text = decodeContactImportBuffer(exactArrayBuffer(new TextEncoder().encode(decomposedCsv)));

    expect(parseCSVContacts(text)).toEqual([{
      ...emptyAddress,
      firstName: "Hélène",
      lastName: "Côté-des-Neiges",
      phone: "",
      email: "hélene@example.ca",
    }]);
  });
});

describe("import vCard", () => {
  it("importe l'adresse résidentielle structurée d'une vCard", () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Béliveau;Simon Pierre;;;",
      "FN:Simon Pierre Béliveau",
      "ADR;TYPE=HOME:;App 4;125 Avenue Léo-Lacombe;Deux-Montagnes;QC;J7R 3W7;Canada",
      "END:VCARD",
    ].join("\r\n");

    expect(parseVCardContacts(vcard)[0]).toMatchObject({
      firstName: "Simon Pierre",
      lastName: "Béliveau",
      address: "125 Avenue Léo-Lacombe",
      apartment: "App 4",
      city: "Deux-Montagnes",
      province: "QC",
      postalCode: "J7R 3W7",
      country: "Canada",
    });
  });

  it("décode les valeurs QUOTED-PRINTABLE UTF-8, y compris les lignes repliées", () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:B=C3=A9liveau;Fran=C3=A7ois;;;",
      "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Fran=C3=A7ois=20B=C3=A9li=",
      " veau",
      "EMAIL:francois.beliveau@example.ca",
      "END:VCARD",
    ].join("\r\n");

    expect(parseVCardContacts(vcard)).toEqual([{
      ...emptyAddress,
      firstName: "François",
      lastName: "Béliveau",
      phone: "",
      email: "francois.beliveau@example.ca",
    }]);
  });

  it("décode QUOTED-PRINTABLE en ISO-8859-1 et Windows-1252", () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N;CHARSET=ISO-8859-1;ENCODING=QUOTED-PRINTABLE:C=F4t=E9;Andr=E9;;;",
      "FN;CHARSET=ISO-8859-1;ENCODING=QUOTED-PRINTABLE:Andr=E9=20C=F4t=E9",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N;CHARSET=WINDOWS-1252;ENCODING=QUOTED-PRINTABLE:L=92Heureux;Marie-=C8ve;;;",
      "FN;CHARSET=WINDOWS-1252;ENCODING=QUOTED-PRINTABLE:Marie-=C8ve=20L=92Heureux",
      "END:VCARD",
    ].join("\r\n");

    const contacts = parseVCardContacts(vcard);
    expect(contacts[0]).toMatchObject({ firstName: "André", lastName: "Côté" });
    expect(contacts[1]).toMatchObject({ firstName: "Marie-Ève", lastName: "L’Heureux" });
    expectCleanUnicode(contacts.flatMap((contact) => [contact.firstName, contact.lastName]));
  });

  it("préserve une vCard entière encodée en ISO-8859-1", () => {
    const source = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N;CHARSET=ISO-8859-1:Noël;Maïté;;;",
      "FN;CHARSET=ISO-8859-1:Maïté Noël",
      "END:VCARD",
    ].join("\r\n");
    const text = decodeContactImportBuffer(exactArrayBuffer(encodeWindows1252(source)));

    expect(parseVCardContacts(text)).toEqual([{
      firstName: "Maïté",
      lastName: "Noël",
      phone: "",
      email: "",
      civicNumber: "",
      address: "",
      apartment: "",
      city: "",
      province: "",
      postalCode: "",
      country: "",
    }]);
  });
});

describe("compatibilité de la détection des doublons", () => {
  it("continue à détecter un doublon même si les accents diffèrent", () => {
    const drafts = parseCSVContacts("Prénom;Nom\nFrancois;Beliveau");
    const existingContact: Contact = {
      id: "contact-1",
      firstName: "François",
      lastName: "Béliveau",
      phone: "",
      email: "",
      civicNumber: "",
      address: "",
      apartment: "",
      city: "",
      province: "",
      postalCode: "",
      country: "",
      broker: "france",
      clientType: null,
      priority: null,
      status: "active",
      source: "manual",
      lastContactDate: null,
      nextFollowUpDate: null,
      googleCalendarEventId: null,
      googleCalendarEventBroker: null,
      googleCalendarSyncStatus: "synced",
      googleCalendarLastError: null,
      buyerPipelineStage: "new",
      sellerPipelineStage: "new",
      addresses: [],
      createdAt: "2026-08-18T12:00:00.000Z",
      updatedAt: "2026-08-18T12:00:00.000Z",
    };

    expect([...findPotentialDuplicateIndexes(drafts, [existingContact])]).toEqual([0]);
  });
});
