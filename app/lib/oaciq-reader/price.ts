import { cleanSpaces, latest, norm, parseVisibleSignatureDate } from "./dates";
import {
  documentKind,
  extractActualClause,
  extractResponseAction,
  formNumber,
  pagesText,
  parseCounterProposal,
  wordMatchesClause,
} from "./forms";
import { resolveCounterProposalPath } from "./chain";
import type { OaciqAnalysis, OaciqExtractedDocument as Doc } from "./types";

type PriceResult = Pick<
  OaciqAnalysis,
  | "finalPrice"
  | "priceSourceForm"
  | "priceSourceDocument"
  | "priceSourceSection"
  | "priceConfidence"
  | "priceWarnings"
>;
/** Read the visible field in its clause, including positioned PDF annotations.
 * Never choose a global/first/largest amount from the document. */
export function priceClause(doc: Doc, clause: string, next: string): string {
  for (const [pageIndex, page] of doc.pages.entries()) {
    const anchors = page.words.filter(
      (w) => wordMatchesClause(w.text, clause) && w.x0 < 95,
    );
    for (const anchor of anchors) {
      const end = Math.min(
        anchor.top + 110,
        ...page.words
          .filter(
            (w) =>
              wordMatchesClause(w.text, next) &&
              w.x0 < 95 &&
              w.top > anchor.top,
          )
          .map((w) => w.top),
      );
      const words = [
        ...page.words.filter((w) => w.top >= anchor.top - 4 && w.top < end),
        ...doc.annotations.filter(
          (a) =>
            a.pageIndex === pageIndex && a.top >= anchor.top - 4 && a.top < end,
        ),
      ];
      return cleanSpaces(
        words
          .sort((a, b) => a.top - b.top || a.x0 - b.x0)
          .map((w) => w.text)
          .join(" "),
      );
    }
  }
  return extractActualClause(pagesText(doc), clause, [next]);
}
export function clauseAmount(text: string): number | null {
  const values = [
    ...text
      .normalize("NFKC")
      .matchAll(
        /(?<![\d.,])((?:\d{1,3}(?:[ ,]\d{3})+|\d{4,})(?:[.,]\d{2})?)[\s(_]*(?:\$|CAD\b)/gi,
      ),
  ]
    .map((m) => {
      let n = m[1].replaceAll(" ", "");
      if (/[,\.]\d{2}$/.test(n)) {
        const cents = n.slice(-2);
        n = n.slice(0, -3).replace(/[,.]/g, "") + "." + cents;
      } else n = n.replace(/[,.]/g, "");
      return Number(n);
    })
    .filter((n) => Number.isFinite(n) && n > 0 && n < 1e12);
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : null;
}
export function parseBonification(doc: Doc) {
  const identification = priceClause(doc, "B1.", "B2.");
  const identifiers = [
    ...identification
      .split(/portant|immeuble|property/i)[0]
      .matchAll(/\b\d{5,6}\b/g),
  ].map((m) => m[0]);
  const target =
    /\b(?:PAD|PA|PP)\s*(?:[-_() ]\s*)*(\d{5,6})\b/i.exec(identification)?.[1] ??
    (new Set(identifiers).size === 1 ? identifiers[0] : "");
  const section = priceClause(doc, "B2.1", "B2.2");
  const signedAt = latest([
    ...doc.signatures.map((s) => s.signedAt),
    ...pagesText(doc).map(parseVisibleSignatureDate),
  ]);
  return {
    number: formNumber(doc.name, pagesText(doc)),
    target,
    amount: clauseAmount(section),
    signedAt,
  };
}

export function resolveFinalPrice(
  documents: Doc[],
  main: Doc,
  acceptedAt: string | null,
): PriceResult {
  const result: PriceResult = {
    finalPrice: null,
    priceSourceForm: null,
    priceSourceDocument: null,
    priceSourceSection: null,
    priceConfidence: "low",
    priceWarnings: [],
  };
  function apply(
    doc: Doc,
    form: string,
    section: string,
    amount: number | null,
  ) {
    if (amount === null) return;
    result.finalPrice = amount;
    result.priceSourceForm = form;
    result.priceSourceDocument = doc.name;
    result.priceSourceSection = section;
    result.priceConfidence = "high";
  }
  const mainNumber = formNumber(main.name, pagesText(main));
  apply(main, "PA", "4.1", clauseAmount(priceClause(main, "4.1", "4.2")));
  const allBO = documents
    .filter((d) => documentKind(pagesText(d)) === "bonification")
    .map((doc) => ({ doc, ...parseBonification(doc) }));
  const related = allBO.filter(
    (b) =>
      b.target &&
      b.target === mainNumber &&
      (!b.signedAt ||
        !acceptedAt ||
        Date.parse(b.signedAt) <= Date.parse(acceptedAt)),
  );
  if (
    allBO.some(
      (b) =>
        !b.target ||
        (b.target === mainNumber &&
          b.signedAt &&
          acceptedAt &&
          Date.parse(b.signedAt) > Date.parse(acceptedAt)),
    )
  )
    result.priceWarnings.push(
      "PRIX À CONFIRMER : une BO ne peut pas être reliée avec certitude à la PA avant son acceptation.",
    );
  let chosen = related[0];
  let ambiguous = false;
  if (related.length > 1) {
    const dated = [...related].sort(
      (a, b) => Date.parse(b.signedAt ?? "") - Date.parse(a.signedAt ?? ""),
    );
    if (
      dated.every((b) => b.signedAt) &&
      dated[0].signedAt !== dated[1].signedAt
    )
      chosen = dated[0];
    else {
      // An explicit newer BO may declare the previous BO null and void.
      const superseded = new Set(
        related.flatMap((b) => {
          const text = norm(pagesText(b.doc).join("\n"));
          return /null[es]* et non avenu|annul/.test(text)
            ? [...text.matchAll(/\bbo\s*[- ]?\s*(\d{5,6})\b/g)]
                .map((m) => m[1])
                .filter((n) => n !== b.number)
            : [];
        }),
      );
      const leaves = related.filter((b) => !superseded.has(b.number));
      if (leaves.length === 1) chosen = leaves[0];
      else ambiguous = true;
    }
  }
  if (!ambiguous && chosen) apply(chosen.doc, "BO", "B2.1", chosen.amount);
  const counters = documents
    .filter((d) => documentKind(pagesText(d)) === "counter_proposal")
    .map(parseCounterProposal);
  const path = resolveCounterProposalPath(
    mainNumber,
    extractResponseAction(main),
    counters,
  );
  for (const counter of path) {
    // A price from an earlier CP must not overwrite a later applicable BO.
    // The final accepted CP still applies at its actual response date.
    const counterDate = counter.responseSignedAt || counter.proposerSignedAt;
    if (
      !ambiguous &&
      chosen?.amount !== null &&
      chosen?.signedAt &&
      counterDate &&
      Date.parse(counterDate) < Date.parse(chosen.signedAt)
    )
      continue;
    const doc = documents.find((d) => d.name === counter.fileName)!;
    const amount = clauseAmount(priceClause(doc, "P2.3.1", "P2.3.2"));
    if (amount !== null) {
      apply(doc, "CP", "P2.3.1", amount);
      ambiguous = false;
    }
  }
  if (ambiguous) {
    result.finalPrice = null;
    result.priceSourceForm = null;
    result.priceSourceDocument = null;
    result.priceSourceSection = null;
    result.priceConfidence = "low";
    result.priceWarnings.push(
      "PRIX À CONFIRMER : plusieurs BO sans ordre documentaire fiable. Aucun prix choisi selon l’ordre d’upload.",
    );
  }
  if (!result.finalPrice && !result.priceWarnings.length)
    result.priceWarnings.push(
      "PRIX À CONFIRMER : aucun montant unique dans les clauses de prix applicables.",
    );
  return result;
}
