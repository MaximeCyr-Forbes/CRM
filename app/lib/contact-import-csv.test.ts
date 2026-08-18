import { describe, expect, it } from "vitest";
import {
  analyzeCSVContacts,
  decodeContactImportBuffer,
  parseCSVContacts,
  parseCSVContactsWithMapping,
  updateCSVMapping,
} from "./contact-import";

const requiredNames = [
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

const requiredPhones = [
  "514-835-5524",
  "(450) 472-7808",
  "+1 (514) 709-6348",
  "+15146076748",
] as const;

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function encodeWindows1252(value: string) {
  const specialCharacters = new Map<string, number>([["’", 0x92]]);
  return Uint8Array.from([...value].map((character) => {
    const specialByte = specialCharacters.get(character);
    if (specialByte !== undefined) return specialByte;
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0xff) return codePoint;
    throw new Error(`Caractère absent de Windows-1252 dans le test: ${character}`);
  }));
}

describe("détection autonome de la structure CSV", () => {
  it("reconnaît des headers français et le délimiteur point-virgule", () => {
    const csv = [
      "Courriel;Nom;Prénom;Téléphone;Date;Code postal",
      "francois@example.ca;Béliveau;François;514-835-5524;2026-08-18;J7R 3W7",
      "helene@example.ca;Côté;Hélène;(450) 472-7808;2025-01-09;H7N 3Y2",
    ].join("\r\n");

    const analysis = analyzeCSVContacts(csv);

    expect(analysis.mapping).toMatchObject({
      delimiter: ";",
      hasHeader: true,
      requiresConfirmation: false,
      email: { index: 0, source: "header" },
      lastName: { index: 1, source: "header" },
      firstName: { index: 2, source: "header" },
      phone: { index: 3, source: "header" },
    });
    expect(analysis.drafts).toEqual([
      { firstName: "François", lastName: "Béliveau", phone: "514-835-5524", email: "francois@example.ca" },
      { firstName: "Hélène", lastName: "Côté", phone: "(450) 472-7808", email: "helene@example.ca" },
    ]);
  });

  it("reconnaît des headers anglais, le délimiteur virgule et un ordre différent", () => {
    const csv = [
      "Email Address,Last Name,First Name,Mobile Phone,Notes",
      "andre@example.ca,Noël,André,+15146076748,Client actif",
      "maite@example.ca,Côte-des-Neiges,Maïté,+1 (514) 709-6348,À rappeler",
    ].join("\n");

    const analysis = analyzeCSVContacts(csv);

    expect(analysis.mapping).toMatchObject({
      delimiter: ",",
      hasHeader: true,
      email: { index: 0 },
      lastName: { index: 1 },
      firstName: { index: 2 },
      phone: { index: 3 },
    });
    expect(analysis.drafts[1]).toEqual({
      firstName: "Maïté",
      lastName: "Côte-des-Neiges",
      phone: "+1 (514) 709-6348",
      email: "maite@example.ca",
    });
  });

  it("conserve exactement 100 contacts sans headers et reconnaît le profil email-nom-prénom", () => {
    const lastNames = ["Béliveau", "Côté", "Noël", "Côte-des-Neiges"];
    const firstNames = ["François", "Hélène", "André", "Maïté", "Jean-François", "Marie-Ève"];
    const rows = Array.from({ length: 100 }, (_, index) => {
      const columns = Array<string>(65).fill("");
      columns[0] = `contact${index}@example.ca`;
      columns[1] = lastNames[index % lastNames.length];
      columns[2] = firstNames[index % firstNames.length];
      columns[10] = `2026-08-${String(index % 28 + 1).padStart(2, "0")}`;
      columns[11] = index % 2 === 0 ? "J7R 3W7" : "H7N 3Y2";
      columns[12] = `${100 + index} Avenue Léo-Lacombe`;
      columns[13] = "Deux-Montagnes";
      columns[14] = "Québec";
      columns[20] = "Français";
      if (index % 2 === 0) columns[61] = requiredPhones[index % requiredPhones.length];
      if (index % 2 === 1) columns[63] = requiredPhones[index % requiredPhones.length];
      return columns.join(";");
    });

    const analysis = analyzeCSVContacts(rows.join("\r\n"));

    expect(analysis.drafts).toHaveLength(100);
    expect(analysis.mapping).toMatchObject({
      hasHeader: false,
      profileId: "email-last-first",
      email: { index: 0 },
      lastName: { index: 1, source: "profile" },
      firstName: { index: 2, source: "profile" },
      phone: { index: 61 },
      requiresConfirmation: false,
    });
    expect(analysis.mapping.phoneFallbacks.map((match) => match.index)).toContain(63);
    expect(analysis.drafts[0]).toMatchObject({ firstName: "François", lastName: "Béliveau", phone: "514-835-5524" });
    expect(analysis.drafts[1]).toMatchObject({ firstName: "Hélène", lastName: "Côté", phone: "(450) 472-7808" });
    expect(analysis.drafts.every((contact) => Boolean(contact.phone))).toBe(true);
    expect(analysis.drafts.some((contact) => contact.phone === "J7R 3W7" || contact.phone.startsWith("2026-"))).toBe(false);
    const importedNames = analysis.drafts.flatMap((contact) => [contact.firstName, contact.lastName]);
    expect(requiredNames.every((name) => importedNames.includes(name))).toBe(true);
  });

  it("utilise les téléphones secondaires lorsqu'un téléphone principal est vide", () => {
    const csv = [
      "First Name,Last Name,Email,Primary Phone,Mobile Phone,Date,Postal Code",
      "Jean-François,Béliveau,jf@example.ca,,+1 (514) 709-6348,2026-08-18,J7R 3W7",
      "Marie-Ève,Noël,marie@example.ca,+15146076748,(450) 472-7808,2026-09-20,H7N 3Y2",
    ].join("\n");

    const analysis = analyzeCSVContacts(csv);

    expect(analysis.mapping.phone?.index).toBe(3);
    expect(analysis.mapping.phoneFallbacks.map((match) => match.index)).toContain(4);
    expect(analysis.drafts.map((contact) => contact.phone)).toEqual(["+1 (514) 709-6348", "+15146076748"]);
  });

  it("ne confond jamais les dates et codes postaux avec des téléphones", () => {
    const csv = [
      "Email;Nom;Prénom;Date;Code postal;Ville",
      "francois@example.ca;Béliveau;François;2026-08-18;J7R 3W7;Deux-Montagnes",
      "helene@example.ca;Côté;Hélène;17/08/2026;H7N 3Y2;Laval",
    ].join("\n");

    const analysis = analyzeCSVContacts(csv);

    expect(analysis.mapping.phone).toBeNull();
    expect(analysis.mapping.phoneFallbacks).toEqual([]);
    expect(analysis.drafts.every((contact) => contact.phone === "")).toBe(true);
  });

  it("demande une confirmation seulement lorsque deux colonnes de noms sont ambiguës", () => {
    const csv = [
      "François;Béliveau",
      "Hélène;Côté",
      "André;Noël",
      "Maïté;Côte-des-Neiges",
    ].join("\n");
    const analysis = analyzeCSVContacts(csv);

    expect(analysis.mapping.hasHeader).toBe(false);
    expect(analysis.mapping.requiresConfirmation).toBe(true);

    const firstNameMapping = updateCSVMapping(analysis.mapping, "firstName", 0);
    const confirmedMapping = updateCSVMapping(firstNameMapping, "lastName", 1);
    expect(parseCSVContactsWithMapping(csv, confirmedMapping)[0]).toMatchObject({
      firstName: "François",
      lastName: "Béliveau",
    });
  });
});

describe("encodages CSV avec l'inférence autonome", () => {
  it("préserve Windows-1252 et les accents français", () => {
    const source = "Courriel;Nom;Prénom\r\nfrancois@example.ca;Béliveau;François\r\nmaite@example.ca;Noël;Maïté";
    const decoded = decodeContactImportBuffer(exactArrayBuffer(encodeWindows1252(source)));
    expect(parseCSVContacts(decoded)).toEqual([
      { firstName: "François", lastName: "Béliveau", phone: "", email: "francois@example.ca" },
      { firstName: "Maïté", lastName: "Noël", phone: "", email: "maite@example.ca" },
    ]);
  });

  it("préserve UTF-8 avec et sans BOM", () => {
    const source = "Email,Last Name,First Name\nhelene@example.ca,Côté,Hélène\nmarie@example.ca,Côte-des-Neiges,Marie-Ève";
    const utf8 = new TextEncoder().encode(source);
    const withBom = new Uint8Array(utf8.length + 3);
    withBom.set([0xef, 0xbb, 0xbf]);
    withBom.set(utf8, 3);

    const withoutBomContacts = parseCSVContacts(decodeContactImportBuffer(exactArrayBuffer(utf8)));
    const withBomContacts = parseCSVContacts(decodeContactImportBuffer(exactArrayBuffer(withBom)));

    expect(withBomContacts).toEqual(withoutBomContacts);
    expect(withBomContacts.map((contact) => `${contact.firstName} ${contact.lastName}`)).toEqual([
      "Hélène Côté",
      "Marie-Ève Côte-des-Neiges",
    ]);
  });
});
