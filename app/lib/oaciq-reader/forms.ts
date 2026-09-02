// Port of the current Python reader's textual and positioned-field rules.
import {
  cleanAddress,
  cleanSpaces,
  extractTimeText,
  latest,
  norm,
  parseFrenchDate,
  torontoDateTime,
} from "./dates";
import type {
  OaciqAnnotation,
  OaciqCounterProposal,
  OaciqExtractedDocument as Doc,
  OaciqFormKind,
  OaciqResponse,
  OaciqSignature,
  OaciqWord as Word,
} from "./types";

export const pagesText = (d: Doc) =>
  d.ocrPages?.length ? d.ocrPages : d.pages.map((p) => p.text);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function markerPattern(marker: string): string {
  const m = /^\s*(\d+)\.(\d+)\s*$/.exec(marker);
  return m
    ? `^\\s*[\\[\\(|]?\\s*${m[1]}\\s*[\\.,]?\\s*${m[2]}\\b`
    : `^\\s*${escape(marker)}`;
}
export function markerIndex(text: string, marker: string, start = 0): number {
  const m = new RegExp(markerPattern(marker), "im").exec(text.slice(start));
  if (m) return start + m.index;
  const i = norm(text.slice(start)).indexOf(norm(marker));
  return i < 0 ? -1 : start + i;
}
function truncateMarkers(chunk: string, ends: string[]): string {
  const indexes = ends
    .map((e) => markerIndex(chunk, e, 5))
    .filter((i) => i >= 0);
  return cleanSpaces(
    indexes.length ? chunk.slice(0, Math.min(...indexes)) : chunk,
  );
}
export function textBetween(
  text: string,
  marker: string,
  ends: string[],
): string {
  const i = markerIndex(text, marker);
  return i < 0 ? "" : truncateMarkers(text.slice(i), ends);
}
export function extractActualClause(
  pages: string[],
  clause: string,
  ends: string[],
): string {
  for (const p of pages) {
    const m = new RegExp(`${markerPattern(clause)}(.+)`, "ims").exec(p);
    if (m) return truncateMarkers(`${clause} ${m[1]}`, ends);
  }
  return "";
}
export function extractClause12(pages: string[]): string {
  for (const p of [
    ...pages.filter((p) =>
      /autres declarations|other declarations/.test(norm(p)),
    ),
    ...pages,
  ]) {
    const clause = extractActualClause([p], "12.1", ["13.", "SIGNATURES"]);
    if (
      clause &&
      cleanSpaces(clause.replace(new RegExp(markerPattern("12.1"), "m"), ""))
    )
      return clause;
  }
  return "";
}
export function formNumber(name: string, pages: string[]): string {
  for (const re of [
    /\[(\d{5,6})\]/,
    /^\d+\.(\d{5,6})\b/,
    /(?:PAD|PA|PP|CP|AR|AF|EAU)\d*[\s_-]+(\d{5,6})/i,
    /(?:PA|PAD|PP|CP|AR|AF|EAU)[\s_-]*(\d{5,6})/i,
    /_(\d{5,6})\b/,
  ]) {
    const m = re.exec(name);
    if (m) return m[1];
  }
  for (const type of ["PAD", "PA", "PP", "CP", "AR", "AF", "EAU"]) {
    const m = new RegExp(`\\b${type}\\s*[- ]?\\s*(\\d{5,6})\\b`, "i").exec(
      pages.join("\n"),
    );
    if (m) return m[1];
  }
  return "";
}
export function documentKind(pages: string[]): OaciqFormKind {
  const first = norm(pages[0] || "");
  if (/\bbonifications?\s+avant\s+acceptation\b/.test(first))
    return "ignored_bo";
  if (/annexe eau potable|drinking water and septic/.test(first))
    return "annex_water";
  if (/annexe r|annex r/.test(first)) return "annex_r";
  if (/annexe f|annex f/.test(first)) return "annex_f";
  if (/contre-proposition|counter-proposal/.test(first))
    return "counter_proposal";
  if (/promesse d'achat|promise to purchase/.test(first))
    return "promise_to_purchase";
  return "unknown";
}
const addressHints = new Set([
  "rue",
  "rang",
  "mtee",
  "montée",
  "montee",
  "chemin",
  "ch",
  "qc",
  "mirabel",
  "brownsburg",
  "j7n",
  "j8g",
  "cadastre",
]);
const nameSkips = [
  "identification",
  "formulaire",
  "organisme",
  "nom adresse",
  "representant",
  "ci-apres",
  "acheteur",
  "vendeur",
  "note",
  "promesse",
  "immeuble principalement",
  "societe",
  "mandatory form",
  "name address",
  "representative",
  "relationship",
  "hereinafter",
  "buyer",
  "seller",
  "promise",
  "immovable",
  "business corporation",
  "counter-proposer",
  "respondent",
  "amendment",
  "new hypothecary loan",
  "null and void",
  "date pri",
  "must be used",
];
export function candidatePartyNames(lines: string[]): string[] {
  return [
    ...new Set(
      lines.filter(
        (line) =>
          line &&
          line.length <= 55 &&
          !nameSkips.some((skip) => norm(line).includes(skip)) &&
          !norm(line)
            .split(" ")
            .some((p) => addressHints.has(p)) &&
          !/\d/.test(line) &&
          line.split(/\s+/).length >= 2 &&
          !line.split(/\s+/).some((p) => p.length < 2 || p.includes("\ufffd")),
      ),
    ),
  ].slice(0, 4);
}
// Python round uses ties-to-even. Keep the same row grouping for PDF field geometry.
const pyRound = (n: number) =>
  n % 1 === 0.5 ? 2 * Math.round(n / 2) : Math.round(n);
function groupedLines(words: Word[], tolerance: number): string[] {
  const rows = new Map<number, Word[]>();
  for (const word of words) {
    const key = pyRound(word.top / tolerance) * tolerance;
    rows.set(key, [...(rows.get(key) || []), word]);
  }
  return [...rows]
    .sort(([a], [b]) => a - b)
    .map(([, row]) =>
      cleanSpaces(
        row
          .sort((a, b) => a.x0 - b.x0)
          .map((w) => w.text)
          .join(" "),
      ),
    )
    .filter(Boolean);
}
export function extractParties(doc: Doc): [string[], string[]] {
  const page = doc.pages[0];
  if (!page) return [[], []];
  const ends = page.words
    .filter(
      (w) =>
        (["objet", "purpose"].includes(norm(w.text)) ||
          /^p?2[.]?$/.test(norm(w.text))) &&
        w.x0 < 100 &&
        w.top > 130,
    )
    .map((w) => w.top);
  const end = ends.length ? Math.min(...ends) : Infinity;
  const side = (left: boolean) =>
    candidatePartyNames(
      groupedLines(
        page.words.filter(
          (w) =>
            (left ? w.x0 < page.width * 0.48 : w.x0 > page.width * 0.5) &&
            w.top >= 110 &&
            w.top < end,
        ),
        4,
      ),
    );
  const buyers = side(true),
    sellers = side(false);
  if (buyers.length || sellers.length) return [buyers, sellers];
  const lines =
    pagesText(doc)[0]
      ?.split("\n")
      .map((l) => l.trim())
      .filter(Boolean) || [];
  const start = lines.findIndex((l) =>
    norm(l).includes("identification des parties"),
  );
  if (start >= 0)
    for (const line of lines.slice(start + 1, start + 10)) {
      const parts = line.split(/\s+(?:[_|]+|-{2,})\s+|\s{3,}/);
      if (parts.length !== 2) continue;
      const names = parts.map((p) =>
        candidatePartyNames([p.replace(/^[ _|.\-]+|[ _|.\-]+$/g, "")]),
      );
      if (names[0].length && names[1].length) return [names[0], names[1]];
    }
  return [[], []];
}
export function extractPropertyAddress(doc: Doc): string {
  for (const page of doc.pages.slice(0, 2))
    for (const a of page.words.filter((w) => w.text === "3.1" && w.x0 < 80)) {
      const address = cleanAddress(
        page.words
          .filter(
            (w) =>
              w.top >= a.top + 5 &&
              w.top <= a.top + 22 &&
              w.x0 < page.width - 30,
          )
          .sort((a, b) => a.x0 - b.x0)
          .map((w) => w.text)
          .join(" "),
      );
      if (
        /\d/.test(address) &&
        norm(address)
          .split(" ")
          .some((s) =>
            [
              "rue",
              "rang",
              "chemin",
              "avenue",
              "boulevard",
              "street",
              "road",
            ].includes(s),
          )
      )
        return address;
    }
  const lines = pagesText(doc)
    .slice(0, 3)
    .join("\n")
    .split("\n")
    .map(cleanSpaces);
  for (let i = 0; i < lines.length; i++)
    if (
      /immeuble avec|immeuble detenu|the immovable, with|the immovable held/.test(
        norm(lines[i]),
      )
    ) {
      for (const line of lines.slice(i + 1, i + 5))
        if (
          line &&
          ![
            "numero",
            "ville",
            "province",
            "code postal",
            "designation cadastrale",
            "number",
            "street",
            "city",
            "postal code",
            "cadastral description",
          ].some((s) => norm(line).includes(s))
        )
          return cleanAddress(line);
    }
  return "";
}
export const wordMatchesClause = (word: string, clause: string) => {
  const token = norm(word).replace(/\s+/g, "").replace(/\.+$/, ""),
    c = norm(clause).replace(/\s+/g, "").replace(/\.+$/, "");
  return [c, ...(c.startsWith("p") ? [c.slice(1)] : [])].some(
    (v) => token === v || token.endsWith(v),
  );
};
export const annexClauseIsChecked = (words: Word[], clause: string) =>
  words
    .filter((w) => wordMatchesClause(w.text, clause) && w.x0 < 90)
    .some((a) =>
      words.some(
        (w) =>
          ["8", "x", "✓", "☒"].includes(norm(w.text)) &&
          w.x0 <= a.x0 + 15 &&
          Math.abs(w.top - a.top) <= 6,
      ),
    );
const isDay = (w: Word) =>
  ["jour", "jours", "day", "days"].includes(norm(w.text));
function precedingDayNumber(
  words: Word[],
  day: Word,
  span: number,
  top: number,
  tolerance: number,
): number | null {
  const candidates = words.filter(
    (w) =>
      /^\d{1,3}$/.test(w.text) &&
      w.x0 >= day.x0 - span &&
      w.x0 < day.x0 &&
      Math.abs(w.top - top) <= tolerance,
  );
  return candidates.length
    ? +candidates.sort((a, b) => b.x0 - a.x0)[0].text
    : null;
}
export function extractAnnexDaysWords(
  words: Word[],
  clause: string,
): [number | null, boolean] {
  for (const a of words.filter(
    (w) => wordMatchesClause(w.text, clause) && w.x0 < 90,
  )) {
    for (const day of words.filter(
      (w) => isDay(w) && w.top - a.top >= 8 && w.top - a.top <= 45,
    )) {
      const n = precedingDayNumber(words, day, 80, day.top, 5);
      if (n !== null) return [n, annexClauseIsChecked(words, clause)];
    }
  }
  return [null, false];
}
export function extractClauseDaysWords(
  doc: Doc,
  clause: string,
  mode: "line" | "inspection" | "following" = "line",
): number | null {
  for (const p of doc.pages)
    for (const a of p.words.filter((w) => w.text === clause && w.x0 < 80)) {
      const days = p.words.filter(
        (w) =>
          isDay(w) &&
          (mode === "line"
            ? Math.abs(w.top - a.top) <= 3 && w.x0 > a.x0
            : mode === "inspection"
              ? w.top >= a.top - 3 && w.top <= a.top + 30 && w.x0 > a.x0
              : w.top > a.top && w.x0 > p.width * 0.55),
      );
      if (mode !== "line") days.sort((a, b) => a.top - b.top);
      for (const day of mode === "following" ? days.slice(0, 1) : days) {
        const n = precedingDayNumber(
          p.words,
          day,
          mode === "inspection" ? 90 : 80,
          mode === "line" ? a.top : day.top,
          mode === "line" ? 8 : 5,
        );
        if (n !== null || mode === "following") return n;
      }
    }
  return null;
}
export function extractClauseDateTimeWords(
  doc: Doc,
  clause: string,
  next: string,
  span = 80,
): [string | null, string] {
  for (const p of doc.pages)
    for (const a of p.words.filter(
      (w) => wordMatchesClause(w.text, clause) && w.x0 < 90,
    )) {
      const ends = p.words
        .filter(
          (w) => wordMatchesClause(w.text, next) && w.x0 < 80 && w.top > a.top,
        )
        .map((w) => w.top);
      const end = Math.min(a.top + span, ...ends);
      const text = cleanSpaces(
        p.words
          .filter(
            (w) => w.top >= a.top - 4 && w.top < end && w.x0 < p.width - 20,
          )
          .sort((a, b) => a.top - b.top || a.x0 - b.x0)
          .map((w) => w.text)
          .join(" "),
      );
      const date = parseFrenchDate(text);
      if (date) return [date, extractTimeText(text)];
    }
  return [null, ""];
}
export function extractClause12Words(doc: Doc): string {
  for (const p of doc.pages) {
    if (!/autres declarations|other declarations/.test(norm(p.text))) continue;
    const words = p.wordsLoose || p.words,
      anchors = words.filter((w) => w.text === "12.1" && w.x0 < 80);
    if (!anchors.length) continue;
    const top = Math.min(...anchors.map((w) => w.top));
    const ends = words
      .filter((w) => /^13[.]?$/.test(w.text) && w.x0 < 80 && w.top > top)
      .map((w) => w.top);
    const end = ends.length ? Math.min(...ends) : p.height - 70;
    const text = cleanSpaces(
      groupedLines(
        words.filter(
          (w) => w.x0 <= p.width - 15 && w.top >= top && w.top < end,
        ),
        5,
      ).join("\n"),
    );
    if (text) return text;
  }
  return "";
}
export function extractPadInspectionScope(doc: Doc): string {
  const text = norm(pagesText(doc).join("\n"));
  if (!/copropriete divise|divided co-ownership|\bpad\s*\d/.test(text))
    return "standard";
  if (text.includes("clause 8.1 option renonciation initialee"))
    return "waived";
  if (text.includes("clause 8.1 option partie privative initialee"))
    return "private";
  for (const [pageIndex, p] of doc.pages.entries())
    for (const a of p.words.filter((w) => w.text === "8.1" && w.x0 < 80)) {
      const ends = p.words
        .filter((w) => /^9[.]?$/.test(w.text) && w.x0 < 80 && w.top > a.top)
        .map((w) => w.top);
      const end = ends.length ? Math.min(...ends) : p.height - 50;
      const tops = [
        ...new Set(
          p.words
            .filter(
              (w) =>
                norm(w.text) === "apposant" &&
                w.x0 >= 85 &&
                w.x0 <= 180 &&
                w.top > a.top &&
                w.top < end,
            )
            .map((w) => Math.round(w.top * 10) / 10),
        ),
      ]
        .sort((a, b) => a - b)
        .slice(0, 2);
      if (tops.length < 2) continue;
      const selected = new Set<number>();
      for (const w of doc.signatureWidgets.filter(
        (w) => w.pageIndex === pageIndex && w.x0 <= 130,
      )) {
        const center = (w.top + w.bottom) / 2,
          nearest =
            Math.abs(center - tops[0]) <= Math.abs(center - tops[1]) ? 0 : 1;
        if (Math.abs(center - tops[nearest]) <= 30) selected.add(nearest);
      }
      tops.forEach((t, i) => {
        if (
          p.words.some(
            (w) =>
              /^[A-Za-zÀ-ÖØ-öø-ÿ]{2,5}$/.test(w.text) &&
              w.text === w.text.toUpperCase() &&
              !["en", "ou"].includes(norm(w.text)) &&
              w.x0 < 100 &&
              w.top >= t - 10 &&
              w.top <= t + 30,
          )
        )
          selected.add(i);
      });
      if (selected.has(1)) return "waived";
      if (selected.has(0)) return "private";
    }
  return "building";
}
export const inspectionLabels = (scope: string): [string, string] =>
  scope === "private"
    ? [
        "Délai pour faire une inspection de la partie privative uniquement",
        "Délai pour la lecture du rapport d'inspection de la partie privative",
      ]
    : scope === "building"
      ? [
          "Délai pour faire une inspection du bâtiment, incluant les parties communes",
          "Délai pour la lecture du rapport d'inspection du bâtiment",
        ]
      : [
          "Délai pour faire une inspection",
          "Délai pour la lecture du rapport d'inspection",
        ];
export function acceptanceFromSignatures(
  signatures: OaciqSignature[],
  sellers: string[],
  buyers: string[],
): string | null {
  const matched = signatures.filter((s) =>
    sellers.some(
      (name) =>
        name && norm(`${s.name} ${s.contact} ${s.reason}`).includes(norm(name)),
    ),
  );
  const date = latest(matched.map((s) => s.signedAt));
  if (date) return date;
  if (sellers.length || buyers.length) return null;
  return latest(
    signatures
      .filter(
        (s) =>
          s.name &&
          !norm(`${s.name} ${s.contact} ${s.reason}`).includes("maxime cyr"),
      )
      .map((s) => s.signedAt),
  );
}
const responseMarkers = [
  "reponse du vendeur",
  "seller response",
  "seller's response",
  "reponse du repondant",
  "respondent response",
  "respondent's response",
];
export function acceptanceFromResponseText(pages: string[]): string | null {
  const dates: string[] = [];
  for (const page of pages) {
    const text = norm(page),
      starts = responseMarkers
        .map((s) => text.indexOf(s))
        .filter((i) => i >= 0);
    if (!starts.length) continue;
    let section = text.slice(Math.min(...starts));
    for (const end of ["accuse de reception", "acknowledgment of receipt"]) {
      const i = section.indexOf(end);
      if (i >= 0) section = section.slice(0, i);
    }
    for (const m of section.matchAll(
      /(?:s(?:i|h)?gne|signed)\s+(?:le|on)?\s*(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/gi,
    ))
      dates.push(
        torontoDateTime(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)),
      );
  }
  return latest(dates);
}
export function extractResponseAction(
  doc: Doc,
  counter = false,
): OaciqResponse {
  const index = pagesText(doc).findIndex((p) =>
    (counter ? responseMarkers.slice(3) : responseMarkers.slice(0, 3)).some(
      (m) => norm(p).includes(m),
    ),
  );
  if (index < 0) return { action: "unknown", counterProposalNumber: "" };
  const annotations = doc.annotations.filter((a) => a.pageIndex === index);
  for (const a of annotations) {
    const text = norm(a.text);
    if (text.includes("accepter") || text === "accept")
      return { action: "accept", counterProposalNumber: "" };
    if (text.includes("refuser") || text === "refuse")
      return { action: "refuse", counterProposalNumber: "" };
  }
  const page = doc.pages[index];
  for (const w of page.words.filter(
    (w) =>
      /contre-proposition|counter-proposal/.test(norm(w.text)) &&
      (counter ? w.x0 >= page.width / 2 : w.x0 < page.width / 2),
  )) {
    if (
      annotations.some(
        (a) =>
          ["x", "8", "✓", "☒"].includes(norm(a.text)) &&
          (counter ? a.x0 >= page.width / 2 : a.x0 < page.width / 2) &&
          Math.abs(a.top - w.top) <= 20,
      )
    )
      return {
        action: "counter",
        counterProposalNumber:
          /\b(\d{5,6})\b/.exec(annotations.map((a) => a.text).join(" "))?.[1] ||
          "",
      };
  }
  return { action: "unknown", counterProposalNumber: "" };
}
function counterTarget(doc: Doc): string {
  const words = doc.pages[0].words,
    starts = words
      .filter((w) => wordMatchesClause(w.text, "P2.1") && w.x0 < 90)
      .map((w) => w.top),
    ends = words
      .filter((w) => wordMatchesClause(w.text, "P2.2") && w.x0 < 90)
      .map((w) => w.top);
  if (starts.length) {
    const start = Math.min(...starts),
      after = ends.filter((t) => t > start),
      end = after.length ? Math.min(...after) : start + 100;
    const rows = new Map<number, Word[]>();
    for (const w of words.filter(
      (w) => w.top >= start && w.top < end && /^\d$/.test(w.text),
    )) {
      const key = pyRound(w.top);
      rows.set(key, [...(rows.get(key) || []), w]);
    }
    for (const row of rows.values()) {
      const digits = row
        .sort((a, b) => a.x0 - b.x0)
        .map((w) => w.text)
        .join("");
      if (digits.length >= 5 && digits.length <= 6) return digits;
    }
  }
  return (
    /(?:promesse\s+d.?achat|contre-proposition)[\s\S]*?(?:PA|PAD|PP|CP)?\s*[- ]?\s*(\d{5,6})/i.exec(
      pagesText(doc).join("\n"),
    )?.[1] || ""
  );
}
function signatureTime(
  signatures: OaciqSignature[],
  names: string[],
  pageIndex: number,
  left: boolean,
  width: number,
  end = Infinity,
): string | null {
  return latest(
    signatures
      .filter(
        (s) =>
          s.pageIndex === pageIndex &&
          s.x0 !== undefined &&
          (left ? s.x0 < width / 2 : s.x0 >= width / 2) &&
          (s.top === undefined || s.top < end) &&
          (!names.length ||
            names.some((n) =>
              norm(`${s.name} ${s.contact} ${s.text || ""}`).includes(norm(n)),
            )),
      )
      .map((s) => s.signedAt),
  );
}
export function parseCounterProposal(doc: Doc): OaciqCounterProposal {
  const pages = pagesText(doc),
    [counterProposers, respondents] = extractParties(doc),
    response = extractResponseAction(doc, true);
  const index = pages.findIndex((p) =>
    responseMarkers.slice(3).some((m) => norm(p).includes(m)),
  );
  let responseSignedAt: string | null = null,
    proposerSignedAt: string | null = null;
  if (index >= 0) {
    const page = doc.pages[index],
      tops = page.words
        .filter(
          (w) => norm(w.text).startsWith("accuse") && w.x0 < page.width / 2,
        )
        .map((w) => w.top);
    responseSignedAt = signatureTime(
      doc.signatures,
      respondents,
      index,
      false,
      page.width,
    );
    proposerSignedAt = signatureTime(
      doc.signatures,
      counterProposers,
      index,
      true,
      page.width,
      tops.length ? Math.min(...tops) : Infinity,
    );
  }
  if (response.action === "unknown" && responseSignedAt)
    response.action = "accept";
  const [notaryDate] = extractClauseDateTimeWords(doc, "P2.3.2", "P2.3.3"),
    [occupationDate, occupationTime] = extractClauseDateTimeWords(
      doc,
      "P2.3.3",
      "P2.3.4",
    );
  return {
    fileName: doc.name,
    formNumber: formNumber(doc.name, pages),
    targetFormNumber: counterTarget(doc),
    responseAction: response.action,
    nextCounterProposalNumber: response.counterProposalNumber,
    acceptedAt: response.action === "accept" ? responseSignedAt : null,
    responseSignedAt,
    proposerSignedAt,
    notaryDate,
    occupationDate,
    occupationTime,
    allDeadlinesDeferred: doc.pages.some((p) =>
      annexClauseIsChecked(p.words, "P2.4"),
    ),
    annexNumbers: [
      ...new Set(
        [
          ...pages
            .join("\n")
            .matchAll(/\b(?:AR|AF|EAU)\s*[- ]?\s*(\d{5,6})\b/gi),
        ].map((m) => m[1]),
      ),
    ],
    counterProposers,
    respondents,
  };
}
