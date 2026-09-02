import { cleanSpaces, inToronto, norm, parseFrenchDate } from "./dates";
import { documentKind, pagesText } from "./forms";
import type { OaciqExtractedDocument, OaciqWord } from "./types";

export type OaciqFieldSource = { sourceDocument: string; sourceForm: string; sourceSection: string; confidence: "high" | "medium" | "low" };
export type OaciqParty = {
  firstName: string; lastName: string; fullName: string; role: "buyer" | "seller";
  email: string; phone: string; source: OaciqFieldSource;
};
export type OaciqTransactionDetails = {
  propertyAddress: string; centrisNumber: string; paDate: string | null;
  buyers: OaciqParty[]; sellers: OaciqParty[];
  fieldSources: { propertyAddress: OaciqFieldSource | null; centrisNumber: OaciqFieldSource | null; paDate: OaciqFieldSource | null };
};

function lines(words: OaciqWord[]) {
  const rows: { top: number; words: OaciqWord[] }[] = [];
  for (const word of [...words].sort((a, b) => a.top - b.top || a.x0 - b.x0)) {
    const row = rows.find((r) => Math.abs(r.top - word.top) < 3);
    if (row) row.words.push(word); else rows.push({ top: word.top, words: [word] });
  }
  return rows.map((r) => ({ top: r.top, text: cleanSpaces(r.words.sort((a, b) => a.x0 - b.x0).map((w) => w.text).join(" ")) }));
}

function dateIn(text: string): string | null {
  const iso = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text)?.[1];
  try {
    const date = iso || parseFrenchDate(text);
    return date && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date ? date : null;
  } catch { return null; }
}

function party(fullName: string, role: OaciqParty["role"], context: string, source: OaciqFieldSource): OaciqParty | null {
  const name = cleanSpaces(fullName).normalize("NFC");
  if (!/^[\p{L}\p{M}’' .-]{3,120}$/u.test(name) || name.split(/\s+/).length < 2
    || /\b(nom|adresse|acheteur|vendeur|buyer|seller|name|address|temoin|witness|courtier|broker|mandataire|representant|represented|representative|signature|identification|societe|corporation|ci-apres|hereinafter)\b/.test(norm(name))) return null;
  const emails = [...new Set(context.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g) ?? [])];
  const phones = [...new Set(context.match(/(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g) ?? [])];
  const [firstName, ...rest] = name.split(/\s+/);
  return { firstName, lastName: rest.join(" "), fullName: name, role, email: emails.length === 1 ? emails[0] : "", phone: phones.length === 1 ? phones[0] : "", source };
}

/** Transaction-only enrichment of the ALREADY extracted main PA. No PDF read,
 * second parser, acceptance recalculation, or change to the deadline engine. */
export function extractTransactionDetails(doc: OaciqExtractedDocument | undefined): OaciqTransactionDetails {
  const result: OaciqTransactionDetails = { propertyAddress: "", centrisNumber: "", paDate: null, buyers: [], sellers: [], fieldSources: { propertyAddress: null, centrisNumber: null, paDate: null } };
  if (!doc || documentKind(pagesText(doc)) !== "promise_to_purchase") return result;
  const source = (section: string): OaciqFieldSource => ({ sourceDocument: doc.name, sourceForm: "PA", sourceSection: section, confidence: "high" });
  const text = pagesText(doc).join("\n");
  const property = /(?:^|\n)\s*3[.,]1\b([\s\S]*?)(?=\n\s*(?:3[.,][2-9]|4[.,\s]|designation cadastrale|dimensions|cadastral)|$)/i.exec(text)?.[1] ?? "";
  // This fallback is still bounded to clause 3.1, never the parties' addresses.
  const candidates = property.split("\n").map((s) => cleanSpaces(s).replace(/^adresse(?: de l['’]immeuble)?\s*:\s*/i, ""));
  for (const page of doc.pages) {
    const clause = page.words.find((w) => /^3[.,]1$/.test(w.text) && w.x0 < 100);
    if (!clause) continue;
    const end = Math.min(...page.words.filter((w) => w.top > clause.top && /^(?:3[.,][2-9]|4[.,]?)$/.test(w.text) && w.x0 < 100).map((w) => w.top), clause.top + 100);
    candidates.unshift(...lines(page.words.filter((w) => w.top > clause.top + 3 && w.top < end)).map((r) => r.text));
  }
  result.propertyAddress = candidates.find((s) => /^\d+[A-Za-z]?(?:\s*[-–]\s*\d+[A-Za-z]?)?[,\s]+/.test(s)
    && /\b(rue|rang|chemin|avenue|boulevard|boul\.?|route|montee|montée|place|terrasse|street|road|drive|lane|crescent)\b/i.test(s))?.normalize("NFC") ?? "";
  if (result.propertyAddress) result.fieldSources.propertyAddress = source("3.1");
  const numbers = [...new Set([...text.matchAll(/(?:\b(?:num[eé]ro|no\.?|n[°º]|listing)\s*Centris|\bCentris\s*(?:no\.?|n[°º]|number|#|:))\s*[:#]?\s*(\d{5,10})\b/gi)].map((m) => m[1]))];
  if (numbers.length === 1) { result.centrisNumber = numbers[0]; result.fieldSources.centrisNumber = source("Numéro Centris explicite"); }

  for (const page of doc.pages) {
    const rows = lines(page.words);
    const start = rows.find((r) => /identification (?:des parties|of the parties)/.test(norm(r.text)));
    if (!start) continue;
    const end = rows.find((r) => r.top > start.top && /^(?:2[.\s]|objet|purpose)/.test(norm(r.text)))?.top ?? page.height;
    for (const role of ["buyer", "seller"] as const) {
      const side = lines(page.words.filter((w) => w.top > start.top && w.top < end && (role === "buyer" ? w.x0 < page.width * 0.49 : w.x0 >= page.width * 0.49)));
      const roleName = role === "buyer" ? /\b(acheteur|buyer)\b/ : /\b(vendeur|seller)\b/;
      let lower = start.top;
      for (const row of side) {
        if (!roleName.test(norm(row.text)) || !/\b(nom|name)\b/.test(norm(row.text)) || /representant|mandataire/.test(norm(row.text))) continue;
        const block = side.filter((r) => r.top > lower && r.top < row.top);
        const representative = block.findIndex((r) => /represent|mandataire|temoin|witness|courtier|broker/.test(norm(r.text)));
        const safe = representative >= 0 ? block.slice(0, representative) : block;
        // Names belong to the labelled slot, not all text in the left/right column.
        const candidate = safe.map((r) => party(r.text, role, safe.map((s) => s.text).join("\n"), source("1"))).find(Boolean);
        if (candidate) result[role === "buyer" ? "buyers" : "sellers"].push(candidate);
        lower = row.top;
      }
    }
  }
  // Text-only forms: accept explicitly labelled party lines only in section 1.
  const identification = /identification (?:des parties|of the parties)([\s\S]*?)(?=\n\s*(?:2[.\s]|objet|purpose)|$)/i.exec(text)?.[1] ?? "";
  for (const role of ["buyer", "seller"] as const) {
    const key = role === "buyer" ? "buyers" : "sellers";
    if (result[key].length) continue;
    const re = role === "buyer" ? /^\s*(?:acheteur|buyer)\s*\d*\s*:\s*(.+)$/gim : /^\s*(?:vendeur|seller)\s*\d*\s*:\s*(.+)$/gim;
    result[key] = [...identification.matchAll(re)].flatMap((m) => { const value = party(m[1], role, "", source("1")); return value ? [value] : []; });
  }
  // Date de PA = buyer's main-PA signature, NOT seller response, CP or validity.
  const signatureBlock = /(?:^|\n)\s*(?:\d+[.\s]+SIGNATURES?|SIGNATURES? (?:DE L['’]ACHETEUR|OF THE BUYER))([\s\S]*?)(?=\n\s*(?:\d{1,2}[.\s]+[A-ZÀ-Ü]|r[eé]ponse du vendeur|seller.s response|accus[eé] de r[eé]ception)|$)/i.exec(text)?.[1] ?? "";
  const explicit = [...text.matchAll(/\bDATE (?:DE LA PA|DE LA PROMESSE D['’]ACHAT)\s*:\s*([^\n]+)/gi)].map((m) => dateIn(m[1])).filter((d): d is string => !!d);
  const signed: string[] = [];
  const zones: { pageIndex: number; start: number; end: number }[] = [];
  let signatureSection = "Signatures acheteur";
  let active = false;
  for (const [pageIndex, page] of doc.pages.entries()) {
    const rows = lines(page.words);
    const heading = rows.find((r) => /^\d+[.\s]+signatures?\b/.test(norm(r.text)));
    if (heading) { active = true; signatureSection = heading.text; }
    if (!active) continue;
    const start = heading?.top ?? -1;
    const end = rows.find((r) => r.top > start && /^(?:\d{1,2}[.\s]+[a-z]|reponse du vendeur|seller.?s response|accuse de reception|acknowledg)/.test(norm(r.text)))?.top ?? page.height;
    zones.push({ pageIndex, start, end });
    for (const left of [true, false]) {
      const side = lines(page.words.filter((w) => w.top > start && w.top < end && (left ? w.x0 < page.width * 0.49 : w.x0 >= page.width * 0.49)));
      let lower = start;
      for (const row of side) {
        if (!/signature|temoin|witness/.test(norm(row.text))) continue;
        if (/signature.*(?:acheteur|buyer)/.test(norm(row.text)) && !/temoin|witness/.test(norm(row.text))) {
          // Dates belong to this buyer's slot ABOVE its signature caption.
          // A witness slot below the caption must not change the PA date.
          for (const r of side.filter((r) => r.top > Math.max(lower, row.top - 90) && r.top < row.top)) {
            const date = dateIn(r.text);
            if (date) signed.push(date);
          }
        }
        lower = row.top;
      }
    }
    if (end < page.height) active = false;
  }
  // Simplified/text-only forms with no labelled signature slots. Do not guess
  // amongst witnesses: their presence requires positioned buyer identification.
  if (!/signature.*(?:acheteur|buyer)|temoin|witness/.test(norm(signatureBlock))) {
    signed.push(...[...signatureBlock.matchAll(/(?:sign[eé](?:e)?(?:\s+(?:le|à|a))?|signed(?:\s+on)?)\s+([^\n]+)/gi)].map((m) => dateIn(m[1])).filter((d): d is string => !!d));
  }
  for (const s of doc.signatures) {
    if (!s.signedAt || !result.buyers.some((b) => norm(s.name) === norm(b.fullName)) || /temoin|witness|mandataire|representant/.test(norm(`${s.field} ${s.reason}`))) continue;
    // Exclude acknowledgements/response signatures even by the same buyer.
    if (s.top == null || !zones.some((z) => s.pageIndex === z.pageIndex && s.top! > z.start && s.top! < z.end)) continue;
    try { signed.push(inToronto(new Date(s.signedAt)).slice(0, 10)); } catch { /* Invalid signature metadata is not a date. */ }
  }
  result.paDate = explicit.length === 1 ? explicit[0] : explicit.length ? null : signed.sort().at(-1) ?? null;
  if (result.paDate) result.fieldSources.paDate = source(explicit.length === 1 ? "Date PA explicite" : signatureSection);
  return result;
}
