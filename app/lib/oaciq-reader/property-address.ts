import { cleanSpaces, norm } from "./dates";
import type { OaciqExtractedDocument, OaciqWord } from "./types";

export type OaciqPropertyAddress = {
  propertyAddress: string;
  propertyCivicNumber: string;
  propertyStreet: string;
  propertyCity: string;
  propertyProvince: string;
  propertyPostalCode: string;
};
const civic = /^(\d+[A-Za-z]*(?:\s*[-–—]\s*\d+[A-Za-z]*)*)[,\s]+(.+)$/;
const postal = /\b([A-Za-z]\d[A-Za-z])\s*(\d[A-Za-z]\d)\b/;
const province = /^(?:QC|QU[EÉ]BEC|ON|ONTARIO|NB|NS|PE|NL|MB|SK|AB|BC|YT|NT|NU)$/i;
const heading = /^(?:3[.\s]+)?(?:description sommaire de l.?immeuble|brief description of the immovable)/;
const stop = /^(?:3[.,][2-9]\b|4[.\s]|designation cadastrale|cadastral (?:description|designation)|dimensions|superficie|ci.apres)/;
const caption = /^(?:numero\b.*\brue\b|number\b.*\bstreet\b)/;

function rows(words: OaciqWord[]) {
  const result: { top: number; words: OaciqWord[]; text: string }[] = [];
  for (const word of [...words].sort((a, b) => a.top - b.top || a.x0 - b.x0)) {
    let row = result.find(row => Math.abs(row.top - word.top) < 3);
    if (!row) { row = { top: word.top, words: [], text: "" }; result.push(row); }
    row.words.push(word);
  }
  for (const row of result) row.text = cleanSpaces(row.words.sort((a, b) => a.x0 - b.x0).map(word => word.text).join(" "));
  return result;
}

/** Receives only the bounded 3.1 address slot, never the full document. */
function parseAddress(value: string): OaciqPropertyAddress | null {
  const text = cleanSpaces(value).normalize("NFC").replace(/\s*,\s*/g, ", ").replace(/,+\s*$/, "");
  const match = civic.exec(text);
  if (!match) return null;
  const propertyCivicNumber = match[1].replace(/\s/g, "").replace(/[–—]/g, "-");
  const parts = match[2].split(",").map(part => part.trim()).filter(Boolean);
  const propertyStreet = parts.shift() ?? "";
  if (!/[\p{L}]/u.test(propertyStreet) || /\b(?:cadastral|cadastre|lot|metres|pieds)\b/.test(norm(propertyStreet))) return null;
  const postalMatch = postal.exec(text);
  const propertyPostalCode = postalMatch ? `${postalMatch[1]} ${postalMatch[2]}`.toUpperCase() : "";
  const provincePart = parts.find(part => province.test(part)) ?? "";
  const propertyProvince = /qu[eé]bec/i.test(provincePart) ? "QC" : provincePart.toUpperCase();
  const propertyCity = parts.find(part => !province.test(part) && !postal.test(part) && !/^canada$/i.test(part)) ?? "";
  // A street-only value is allowed inside the verified slot. Without separators,
  // require a street designator rather than mistaking cadastral digits for a civic.
  if (!propertyCity && !/\b(rue|rang|chemin|avenue|av\.?|boulevard|boul\.?|route|montee|place|terrasse|street|road|drive|lane|crescent)\b/.test(norm(propertyStreet))) return null;
  return { propertyAddress: text.replace(match[1], propertyCivicNumber), propertyCivicNumber, propertyStreet, propertyCity, propertyProvince, propertyPostalCode };
}

function fromLines(input: string[]) {
  const content = input.map(line => cleanSpaces(line).replace(/^3[.,]1\s*/, "").replace(/^adresse(?: de l['’]immeuble)?\s*:\s*/i, ""))
    .filter(line => line && !caption.test(norm(line)) && !/^(?:l.?immeuble|the immovable|numero$|rue$|ville$|province$|code postal$|pays$)/.test(norm(line)));
  const start = content.findIndex(line => civic.test(line));
  if (start < 0) return null;
  const addressLines = content.slice(start, start + 4);
  // Retain a complete address on one row; never append cadastral values below it.
  const first = parseAddress(addressLines[0]);
  if (first?.propertyPostalCode) return first;
  const continuation: string[] = [addressLines[0]];
  for (const line of addressLines.slice(1)) {
    if (/^[\d\s.,xX-]+$/.test(line) || civic.test(line) || stop.test(norm(line))) break;
    continuation.push(line);
    if (postal.test(line)) break;
  }
  return parseAddress(continuation.join(", ").replace(/,\s*,/g, ",")) ?? first;
}

/** Canonical PA property source: section 3, clause 3.1. No global address fallback. */
export function extractPAPropertyAddress(doc: OaciqExtractedDocument): OaciqPropertyAddress | null {
  const candidates: OaciqPropertyAddress[] = [];
  for (const [pageIndex, page] of doc.pages.entries()) {
    const positioned = rows(page.words);
    const section = positioned.findIndex(row => heading.test(norm(row.text)));
    const clause = positioned.findIndex((row, index) => index >= Math.max(0, section) && /^3[.,]1\b/.test(row.text));
    let found: OaciqPropertyAddress | null = null;
    if (section >= 0 && clause >= 0) {
      const end = positioned.findIndex((row, index) => index > clause && stop.test(norm(row.text)));
      const slot = positioned.slice(clause, end < 0 ? clause + 12 : end);
      const labels = slot.find(row => caption.test(norm(row.text)));
      // When separate column values have no commas, use their printed labels.
      const fieldNames = ["numero", "rue", "ville", "province", "code", "pays"];
      const columns = labels?.words.flatMap(word => {
        const index = fieldNames.indexOf(norm(word.text));
        return index >= 0 ? [{ name: fieldNames[index], x: word.x0 }] : [];
      }).sort((a, b) => a.x - b.x) ?? [];
      const valueRows = slot.filter(row => row !== labels && !/^3[.,]1\b/.test(row.text));
      const firstCivic = valueRows.find(row => civic.test(row.text));
      if (columns.length >= 5 && firstCivic && !firstCivic.text.includes(",")) {
        const fields = Object.fromEntries(columns.map((column, index) => [column.name,
          cleanSpaces(firstCivic.words.filter(word => word.x0 >= column.x - 3 && word.x0 < (columns[index + 1]?.x ?? Infinity) - 3).map(word => word.text).join(" "))]));
        if (fields.numero && fields.rue && fields.ville) found = parseAddress([`${fields.numero} ${fields.rue}`, fields.ville, fields.code, fields.province, fields.pays].filter(Boolean).join(", "));
      }
      found ??= fromLines(slot.map(row => row.text));
    }
    if (!found) {
      const text = doc.ocrPages?.[pageIndex] || page.text;
      const textRows = text.split("\n").map(cleanSpaces);
      const section = textRows.findIndex(line => heading.test(norm(line)));
      const clause = textRows.findIndex((line, index) => index >= Math.max(0, section) && /^3[.,]1\b/.test(line));
      if (section >= 0 && clause >= 0) {
        const end = textRows.findIndex((line, index) => index > clause && stop.test(norm(line)));
        found = fromLines(textRows.slice(clause, end < 0 ? clause + 12 : end));
      }
    }
    if (found) candidates.push(found);
  }
  const unique = [...new Map(candidates.map(candidate => [norm(candidate.propertyAddress), candidate])).values()];
  // A merged PDF containing different properties is ambiguous, never first-wins.
  return unique.length === 1 ? unique[0] : null;
}
