import type { Contact, ContactDraft } from "../data/contact-types";
import {
  findDuplicateMatches,
  getDuplicateReasons,
  hasMinimumContactIdentity,
} from "./contact-normalization";

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

    return [draft];
  });
}

function unescapeVCardValue(value: string) {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

export function parseVCardContacts(text: string): ContactDraft[] {
  const unfoldedText = text.replace(/\r?\n[ \t]/g, "");
  const cards = unfoldedText.match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) ?? [];

  return cards.flatMap<ContactDraft>((card) => {
    let firstName = "";
    let lastName = "";
    let fullName = "";
    let phone = "";
    let email = "";

    for (const line of card.split(/\r?\n/)) {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex < 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).split(";", 1)[0].toUpperCase();
      const value = unescapeVCardValue(line.slice(separatorIndex + 1));

      if (key === "N") {
        const parts = value.split(";");
        lastName = parts[0] ?? "";
        firstName = parts[1] ?? "";
      } else if (key === "FN") {
        fullName = value;
      } else if (key === "TEL" && !phone) {
        phone = value;
      } else if (key === "EMAIL" && !email) {
        email = value;
      }
    }

    if (!firstName && !lastName && fullName) {
      const splitName = splitFullName(fullName);
      firstName = splitName.firstName;
      lastName = splitName.lastName;
    }

    const draft = { firstName, lastName, phone, email };
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
