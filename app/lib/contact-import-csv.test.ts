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
const emptyAddress = { civicNumber: "", address: "", apartment: "", city: "", province: "", postalCode: "", country: "" };

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
  it("importe une adresse résidentielle répartie sur plusieurs colonnes", () => {
    const csv = [
      "Courriel;Nom;Prénom;Numéro civique;Rue;Appartement;Ville;Province;Code postal;Pays",
      "simon@example.ca;Béliveau;Simon Pierre;150;Avenue Léo-Lacombe;App 4;Deux-Montagnes;QC;J7R 3W7;Canada",
    ].join("\r\n");

    const analysis = analyzeCSVContacts(csv);

    expect(analysis.mapping).toMatchObject({
      hasHeader: true,
      civicNumber: { index: 3 },
      address: { index: 4 },
      apartment: { index: 5 },
      city: { index: 6 },
      province: { index: 7 },
      postalCode: { index: 8 },
      country: { index: 9 },
    });
    expect(analysis.drafts[0]).toEqual({
      firstName: "Simon Pierre",
      lastName: "Béliveau",
      phone: "",
      email: "simon@example.ca",
      civicNumber: "150",
      address: "Avenue Léo-Lacombe",
      apartment: "App 4",
      city: "Deux-Montagnes",
      province: "QC",
      postalCode: "J7R 3W7",
      country: "Canada",
    });

    const withoutCivic = updateCSVMapping(analysis.mapping, "civicNumber", null);
    const remapped = updateCSVMapping(withoutCivic, "civicNumber", 3);
    expect(remapped.civicNumber).toMatchObject({ index: 3, source: "manual" });
    expect(parseCSVContactsWithMapping(csv, remapped)[0].civicNumber).toBe("150");
  });

  it("conserve une adresse complète provenant d'une seule colonne", () => {
    const csv = [
      "First Name,Last Name,Email,Full Address,External ID",
      'Hélène,Côté,helene@example.ca,"125 Avenue Léo-Lacombe, Deux-Montagnes, QC J7R 3W7",46213',
      'André,Noël,andre@example.ca,"820 25e Avenue, Deux-Montagnes, QC J7R 3W7",46214',
    ].join("\n");

    const analysis = analyzeCSVContacts(csv);
    expect(analysis.mapping.address?.index).toBe(3);
    expect(analysis.mapping.civicNumber).toBeNull();
    expect(analysis.mapping.requiresConfirmation).toBe(false);
    expect(analysis.drafts[0].address).toBe("125 Avenue Léo-Lacombe, Deux-Montagnes, QC J7R 3W7");
  });

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
      { ...emptyAddress, postalCode: "J7R 3W7", firstName: "François", lastName: "Béliveau", phone: "514-835-5524", email: "francois@example.ca" },
      { ...emptyAddress, postalCode: "H7N 3Y2", firstName: "Hélène", lastName: "Côté", phone: "(450) 472-7808", email: "helene@example.ca" },
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
      ...emptyAddress,
      firstName: "Maïté",
      lastName: "Côte-des-Neiges",
      phone: "+1 (514) 709-6348",
      email: "maite@example.ca",
    });
  });

  it("conserve exactement 100 contacts sans headers et reconnaît le profil email-nom-prénom", () => {
    const lastNames = ["Béliveau", "Côté", "Noël", "Côte-des-Neiges"];
    const firstNames = ["François", "Hélène", "André", "Maïté", "Jean-François", "Marie-Ève"];
    const civicNumbers = ["150", "350", "358", "397", "820", "1193", "310", "574"];
    const streets = ["Avenue Léo-Lacombe", "14e Avenue", "rue des Cerisiers", "60e Avenue", "25e Avenue", "rue Ovila-Forget", "17e Avenue"];
    const rows = Array.from({ length: 100 }, (_, index) => {
      const columns = Array<string>(65).fill("");
      columns[0] = `contact${index}@example.ca`;
      columns[1] = lastNames[index % lastNames.length];
      columns[2] = firstNames[index % firstNames.length];
      columns[10] = `2026-08-${String(index % 28 + 1).padStart(2, "0")}`;
      columns[12] = String(46213 + index);
      columns[20] = "Français";
      columns[34] = index % 2 === 0 ? "J7R 3W7" : "H7N 3Y2";
      columns[48] = civicNumbers[index % civicNumbers.length];
      columns[50] = "Canada";
      columns[52] = "Québec";
      columns[54] = streets[index % streets.length];
      if (index % 2 === 0) columns[61] = requiredPhones[index % requiredPhones.length];
      if (index % 2 === 1) columns[63] = requiredPhones[index % requiredPhones.length];
      columns[64] = "Deux-Montagnes";
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
    expect(analysis.mapping).toMatchObject({
      civicNumber: { index: 48 },
      address: { index: 54 },
      apartment: null,
      city: { index: 64 },
      province: { index: 52 },
      postalCode: { index: 34 },
      country: { index: 50 },
    });
    expect(analysis.drafts[0]).toMatchObject({ firstName: "François", lastName: "Béliveau", phone: "514-835-5524" });
    expect(analysis.mapping.requiresConfirmation).toBe(false);
    expect(analysis.mapping.confirmationFields).toEqual([]);
    expect(analysis.drafts[0]).toMatchObject({ civicNumber: "150", address: "Avenue Léo-Lacombe", apartment: "", city: "Deux-Montagnes", province: "Québec", postalCode: "J7R 3W7", country: "Canada" });
    expect(analysis.drafts[1]).toMatchObject({ firstName: "Hélène", lastName: "Côté", phone: "(450) 472-7808" });
    expect(analysis.drafts.every((contact) => Boolean(contact.phone))).toBe(true);
    expect(analysis.drafts.some((contact) => contact.phone === "J7R 3W7" || contact.phone.startsWith("2026-"))).toBe(false);
    const importedNames = analysis.drafts.flatMap((contact) => [contact.firstName, contact.lastName]);
    expect(requiredNames.every((name) => importedNames.includes(name))).toBe(true);
  });

  it("écarte téléphone, date, code postal et identifiant séquentiel du numéro civique", () => {
    const civicNumbers = ["150", "820", "123A", "123-B", "1193"];
    const streets = ["Avenue Léo-Lacombe", "25e Avenue", "rue des Cerisiers", "17e Avenue", "rue Ovila-Forget"];
    const csv = civicNumbers.map((civicNumber, index) => [
      `contact${index}@example.ca`,
      ["Béliveau", "Côté", "Noël", "Bérubé", "L'Heureux"][index],
      ["Simon", "Hélène", "André", "François", "Maïté"][index],
      "5148355524",
      "2026-08-18",
      "J7R 3W7",
      String(46213 + index),
      civicNumber,
      streets[index],
    ].join(";")).join("\n");

    const analysis = analyzeCSVContacts(csv);

    expect(analysis.mapping.hasHeader).toBe(false);
    expect(analysis.mapping.civicNumber?.index).toBe(7);
    expect(analysis.mapping.civicNumber?.index).not.toBe(3);
    expect(analysis.mapping.civicNumber?.index).not.toBe(4);
    expect(analysis.mapping.civicNumber?.index).not.toBe(5);
    expect(analysis.mapping.civicNumber?.index).not.toBe(6);
    expect(analysis.drafts.map((contact) => contact.civicNumber)).toEqual(civicNumbers);
  });

  it("laisse un appartement ambigu vide sans bloquer les champs fiables", () => {
    const civicNumbers = ["150", "350", "358", "397", "820", "1193", "310", "574", "221", "905"];
    const rows = civicNumbers.map((civicNumber, index) => [
      `contact${index}@example.ca`,
      ["Béliveau", "Côté", "Noël", "Bérubé", "L'Heureux"][index % 5],
      ["Simon", "Hélène", "André", "François", "Maïté"][index % 5],
      civicNumber,
      "Avenue Léo-Lacombe",
      "Deux-Montagnes",
      "QC",
      "J7R 3W7",
      "Canada",
      index < 3 ? ["620", "201", "1204"][index] : "",
      index < 3 ? ["110", "4", "PH2"][index] : "",
    ].join(";")).join("\n");

    const analysis = analyzeCSVContacts(rows);

    expect(analysis.mapping.requiresConfirmation).toBe(false);
    expect(analysis.mapping.confirmationFields).toEqual([]);
    expect(analysis.mapping.apartment).toBeNull();
    expect(analysis.drafts.every((contact) => contact.apartment === "")).toBe(true);
    expect(analysis.drafts[0]).toMatchObject({ civicNumber: "150", address: "Avenue Léo-Lacombe", city: "Deux-Montagnes" });
  });

  it("conserve un appartement numérique rare lorsqu'il est clairement associé à l'adresse", () => {
    const civicNumbers = ["150", "350", "358", "397", "820", "1193", "310", "574", "221", "905"];
    const rows = civicNumbers.map((civicNumber, index) => [
      `contact${index}@example.ca`,
      ["Béliveau", "Côté", "Noël", "Bérubé", "L'Heureux"][index % 5],
      ["Simon", "Hélène", "André", "François", "Maïté"][index % 5],
      civicNumber,
      "Avenue Léo-Lacombe",
      "Deux-Montagnes",
      "QC",
      "J7R 3W7",
      "Canada",
      index < 3 ? ["620", "201", "1204"][index] : "",
    ].join(";")).join("\n");

    const analysis = analyzeCSVContacts(rows);

    expect(analysis.mapping.requiresConfirmation).toBe(false);
    expect(analysis.mapping.apartment?.index).toBe(9);
    expect(analysis.drafts[0].apartment).toBe("620");
    expect(analysis.drafts[3].apartment).toBe("");
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

  it("demande une petite confirmation seulement pour le nom lorsqu'il est ambigu", () => {
    const csv = [
      "Béliveau;François",
      "Côté;Hélène",
      "Noël;André",
      "Côte-des-Neiges;Maïté",
    ].join("\n");
    const analysis = analyzeCSVContacts(csv);

    expect(analysis.mapping.hasHeader).toBe(false);
    expect(analysis.mapping.requiresConfirmation).toBe(true);
    expect(analysis.mapping.confirmationFields).toEqual(["lastName"]);

    const confirmedMapping = updateCSVMapping(analysis.mapping, "lastName", 0);
    expect(parseCSVContactsWithMapping(csv, confirmedMapping)[0]).toMatchObject({
      firstName: "François",
      lastName: "Béliveau",
    });
  });
});

describe("encodages CSV avec l'inférence autonome", () => {
  it("préserve Windows-1252 et les accents français", () => {
    const source = "Courriel;Nom;Prénom;Adresse;Ville\r\nfrancois@example.ca;Béliveau;François;125 Avenue Léo-Lacombe;Deux-Montagnes\r\nmaite@example.ca;Noël;Maïté;;Laval";
    const decoded = decodeContactImportBuffer(exactArrayBuffer(encodeWindows1252(source)));
    expect(parseCSVContacts(decoded)).toEqual([
      { ...emptyAddress, address: "125 Avenue Léo-Lacombe", city: "Deux-Montagnes", firstName: "François", lastName: "Béliveau", phone: "", email: "francois@example.ca" },
      { ...emptyAddress, city: "Laval", firstName: "Maïté", lastName: "Noël", phone: "", email: "maite@example.ca" },
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
