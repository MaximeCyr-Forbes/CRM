import { CONTACT_DRAFT_FIELDS, type Contact, type ContactDraft } from "../data/contact-types";
import {
  findDuplicateMatches,
  getDuplicateReasons,
  hasMinimumContactIdentity,
} from "./contact-normalization";
import { normalizeBirthDate } from "./birth-date";
export {
  analyzeCSVContacts,
  parseCSVContacts,
  parseCSVContactsWithMapping,
  updateCSVMapping,
  type CSVColumnMatch,
  type CSVImportAnalysis,
  type CSVImportColumn,
  type CSVImportField,
  type CSVImportMapping,
} from "./contact-import-csv";

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

export function normalizeContactDraft(draft: ContactDraft): ContactDraft {
  return Object.fromEntries(
    CONTACT_DRAFT_FIELDS.map((field) => [field, field === "birthDate" ? normalizeBirthDate(draft[field]) : normalizeImportedValue(draft[field])]),
  ) as ContactDraft;
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
    let birthDate = "";
    let civicNumber = "";
    let address = "";
    let apartment = "";
    let city = "";
    let province = "";
    let postalCode = "";
    let country = "";

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
      } else if (property.key === "BDAY" && !birthDate) {
        birthDate = normalizeBirthDate(unescapeVCardValue(property.value));
      } else if (property.key === "ADR" && !address) {
        const parts = splitVCardComponents(property.value).map(unescapeVCardValue);
        address = [parts[2], parts[0]].filter(Boolean).join(", ");
        apartment = parts[1] ?? "";
        city = parts[3] ?? "";
        province = parts[4] ?? "";
        postalCode = parts[5] ?? "";
        country = parts[6] ?? "";
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
      birthDate,
      civicNumber: normalizeImportedValue(civicNumber),
      address: normalizeImportedValue(address),
      apartment: normalizeImportedValue(apartment),
      city: normalizeImportedValue(city),
      province: normalizeImportedValue(province),
      postalCode: normalizeImportedValue(postalCode),
      country: normalizeImportedValue(country),
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

export function getBirthdayImportAction(candidate: ImportCandidate) {
  const match = candidate.duplicateMatches.find((item) => item.reasons.includes("email") || item.reasons.includes("phone"));
  if (!match || !candidate.draft.birthDate) return { action: "none" as const, contact: null };
  if (!match.contact.birthDate) return { action: "enrich" as const, contact: match.contact };
  if (match.contact.birthDate === candidate.draft.birthDate) return { action: "same" as const, contact: match.contact };
  return { action: "conflict" as const, contact: match.contact };
}

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
