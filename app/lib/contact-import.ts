import type { Contact, ContactDraft } from "../data/contact-types";
import {
  findDuplicateMatches,
  getDuplicateReasons,
  hasMinimumContactIdentity,
} from "./contact-normalization";

function normalizeImportedValue(value: string) {
  return value.trim().normalize("NFC");
}

function decodeBytes(bytes: Uint8Array, charset?: string) {
  const normalizedCharset = charset
    ?.trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase()
    .replace(/_/g, "-");

  if (
    normalizedCharset === "windows-1252"
    || normalizedCharset === "cp1252"
    || normalizedCharset === "ansi"
    || normalizedCharset === "iso-8859-1"
    || normalizedCharset === "iso8859-1"
    || normalizedCharset === "latin1"
    || normalizedCharset === "latin-1"
  ) {
    return new TextDecoder("windows-1252").decode(bytes);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function decodeContactImportBuffer(buffer: ArrayBuffer) {
  return decodeBytes(new Uint8Array(buffer)).normalize("NFC");
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;

  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index];
    if (character === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && character === ",") {
      commas += 1;
    } else if (!inQuotes && character === ";") {
      semicolons += 1;
    }
  }

  return semicolons > commas ? ";" : ",";
}

function parseDelimitedRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && character === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

function findColumn(headers: string[], candidates: ReadonlyArray<string>) {
  return headers.findIndex((header) => candidates.includes(header));
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] ?? "", lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function parseCSVContacts(text: string): ContactDraft[] {
  const rows = parseDelimitedRows(text.replace(/^\uFEFF/, ""), detectDelimiter(text));
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map(normalizeHeader);
  const firstNameIndex = findColumn(headers, ["prenom", "firstname", "givenname"]);
  const lastNameIndex = findColumn(headers, ["nom", "lastname", "surname", "familyname"]);
  const fullNameIndex = findColumn(headers, ["nomcomplet", "fullname", "displayname", "name"]);
  const phoneIndex = findColumn(headers, [
    "telephone",
    "telephoneprincipal",
    "phone",
    "cellulaire",
    "mobile",
    "cellphone",
  ]);
  const emailIndex = findColumn(headers, ["email", "courriel", "mail", "emailaddress"]);

  return rows.slice(1).flatMap<ContactDraft>((row) => {
    const fullName = fullNameIndex >= 0 ? row[fullNameIndex] ?? "" : "";
    const splitName = splitFullName(fullName);
    const draft = {
      firstName: (firstNameIndex >= 0 ? row[firstNameIndex] : "") || splitName.firstName,
      lastName: (lastNameIndex >= 0 ? row[lastNameIndex] : "") || splitName.lastName,
      phone: phoneIndex >= 0 ? row[phoneIndex] ?? "" : "",
      email: emailIndex >= 0 ? row[emailIndex] ?? "" : "",
    };

    return [{
      firstName: normalizeImportedValue(draft.firstName),
      lastName: normalizeImportedValue(draft.lastName),
      phone: normalizeImportedValue(draft.phone),
      email: normalizeImportedValue(draft.email),
    }];
  });
}

function unescapeVCardValue(value: string) {
  return normalizeImportedValue(value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\"));
}

function isQuotedPrintableLine(line: string) {
  const separatorIndex = line.indexOf(":");
  const descriptor = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
  return /(?:^|;)ENCODING=(?:QUOTED-PRINTABLE|QP)(?:;|$)/i.test(descriptor);
}

function unfoldVCardLines(text: string) {
  const logicalLines: string[] = [];
  const physicalLines = text.replace(/\r\n?/g, "\n").split("\n");

  for (const physicalLine of physicalLines) {
    const previousIndex = logicalLines.length - 1;
    const previousLine = logicalLines[previousIndex];

    if (previousLine?.endsWith("=") && isQuotedPrintableLine(previousLine)) {
      logicalLines[previousIndex] = `${previousLine.slice(0, -1)}${physicalLine.replace(/^[ \t]/, "")}`;
    } else if (previousLine !== undefined && /^[ \t]/.test(physicalLine)) {
      logicalLines[previousIndex] += physicalLine.slice(1);
    } else {
      logicalLines.push(physicalLine);
    }
  }

  return logicalLines;
}

function decodeQuotedPrintable(value: string, charset?: string) {
  let decoded = "";
  let encodedBytes: number[] = [];

  function flushBytes() {
    if (encodedBytes.length === 0) return;
    decoded += decodeBytes(new Uint8Array(encodedBytes), charset);
    encodedBytes = [];
  }

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const hexadecimal = value.slice(index + 1, index + 3);

    if (character === "=" && /^[0-9a-f]{2}$/i.test(hexadecimal)) {
      encodedBytes.push(Number.parseInt(hexadecimal, 16));
      index += 2;
    } else if (character.charCodeAt(0) <= 0x7f) {
      encodedBytes.push(character.charCodeAt(0));
    } else {
      flushBytes();
      decoded += character;
    }
  }

  flushBytes();
  return decoded.normalize("NFC");
}

type VCardProperty = {
  key: string;
  value: string;
};

function parseVCardProperty(line: string): VCardProperty | null {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex < 0) return null;

  const descriptorParts = line.slice(0, separatorIndex).split(";");
  const propertyName = descriptorParts.shift() ?? "";
  const key = propertyName.split(".").pop()?.toUpperCase() ?? "";
  const parameters = new Map<string, string>();

  for (const parameter of descriptorParts) {
    const equalsIndex = parameter.indexOf("=");
    if (equalsIndex >= 0) {
      parameters.set(
        parameter.slice(0, equalsIndex).toUpperCase(),
        parameter.slice(equalsIndex + 1),
      );
    }
  }

  const rawValue = line.slice(separatorIndex + 1);
  const encoding = parameters.get("ENCODING")?.toUpperCase();
  const decodedValue = encoding === "QUOTED-PRINTABLE" || encoding === "QP"
    ? decodeQuotedPrintable(rawValue, parameters.get("CHARSET"))
    : rawValue;

  return { key, value: decodedValue };
}

function splitVCardComponents(value: string) {
  const components: string[] = [];
  let component = "";
  let escaped = false;

  for (const character of value) {
    if (character === ";" && !escaped) {
      components.push(component);
      component = "";
      continue;
    }
    component += character;
    escaped = character === "\\" && !escaped;
    if (character !== "\\") escaped = false;
  }

  components.push(component);
  return components;
}

export function parseVCardContacts(text: string): ContactDraft[] {
  const unfoldedText = unfoldVCardLines(text).join("\n");
  const cards = unfoldedText.match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) ?? [];

  return cards.flatMap<ContactDraft>((card) => {
    let firstName = "";
    let lastName = "";
    let fullName = "";
    let phone = "";
    let email = "";

    for (const line of card.split("\n")) {
      const property = parseVCardProperty(line);
      if (!property) continue;

      if (property.key === "N") {
        const parts = splitVCardComponents(property.value);
        lastName = unescapeVCardValue(parts[0] ?? "");
        firstName = unescapeVCardValue(parts[1] ?? "");
      } else if (property.key === "FN") {
        fullName = unescapeVCardValue(property.value);
      } else if (property.key === "TEL" && !phone) {
        phone = unescapeVCardValue(property.value);
      } else if (property.key === "EMAIL" && !email) {
        email = unescapeVCardValue(property.value);
      }
    }

    if (!firstName && !lastName && fullName) {
      const splitName = splitFullName(fullName);
      firstName = splitName.firstName;
      lastName = splitName.lastName;
    }

    const draft = {
      firstName: normalizeImportedValue(firstName),
      lastName: normalizeImportedValue(lastName),
      phone: normalizeImportedValue(phone),
      email: normalizeImportedValue(email),
    };
    return [draft];
  });
}

export function findPotentialDuplicateIndexes(
  drafts: ReadonlyArray<ContactDraft>,
  existingContacts: ReadonlyArray<Contact>,
) {
  const duplicateIndexes = new Set<number>();
  drafts.forEach((draft, index) => {
    if (findDuplicateMatches(draft, existingContacts).length > 0) {
      duplicateIndexes.add(index);
    }
    if (drafts.slice(0, index).some((other) => getDuplicateReasons(draft, other).length > 0)) {
      duplicateIndexes.add(index);
    }
  });
  return duplicateIndexes;
}

export type ImportCandidateStatus = "new" | "duplicate" | "incomplete";

export type ImportCandidate = {
  id: string;
  draft: ContactDraft;
  status: ImportCandidateStatus;
  duplicateMatches: ReturnType<typeof findDuplicateMatches>;
  duplicateDraftIndex: number | null;
};

export function analyzeImportDrafts(
  drafts: ReadonlyArray<ContactDraft>,
  existingContacts: ReadonlyArray<Contact>,
): ImportCandidate[] {
  return drafts.map((draft, index) => {
    const duplicateMatches = findDuplicateMatches(draft, existingContacts);
    const duplicateDraftIndex = drafts
      .slice(0, index)
      .findIndex((other) => getDuplicateReasons(draft, other).length > 0);
    const batchDuplicateIndex = duplicateDraftIndex >= 0 ? duplicateDraftIndex : null;
    return {
      id: `import-${index}-${crypto.randomUUID()}`,
      draft,
      status: !hasMinimumContactIdentity(draft)
        ? "incomplete"
        : duplicateMatches.length > 0 || batchDuplicateIndex !== null
          ? "duplicate"
          : "new",
      duplicateMatches,
      duplicateDraftIndex: batchDuplicateIndex,
    };
  });
}
