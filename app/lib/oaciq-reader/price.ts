import { parseBonification, resolveBonifications } from './bonifications';
export { parseBonification } from './bonifications';
import { cleanSpaces, norm } from "./dates";
import {
  documentKind,
  extractActualClause,
  extractResponseAction,
  extractParties,
  formNumber,
  pagesText,
  parseCounterProposal,
  wordMatchesClause,
} from "./forms";
import { counterClauses } from "./counter-clauses";
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

export function resolveFinalPrice(
  documents: Doc[],
  main: Doc,
  acceptedAt: string | null,
  acceptedPath?: ReturnType<typeof resolveCounterProposalPath>,
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
  const sellers = extractParties(main)[1];
  const laterBO = allBO.filter(b=>b.target===mainNumber && acceptedAt && b.signedAt && Date.parse(b.signedAt)>Date.parse(acceptedAt)
    && extractResponseAction(b.doc).action==="accept" && b.doc.signatures.some(s=>s.signedAt)
    && sellers.every(person=>b.doc.signatures.some(s=>s.signedAt && norm(`${s.name} ${s.contact}`).includes(norm(person)))));
  const resolved=resolveBonifications(documents,main,acceptedAt);
  result.priceWarnings.push(...resolved.warnings);
  let chosen: (typeof allBO)[number] | undefined;
  let ambiguous=resolved.forms.some(b=>b.warnings.some(w=>w.includes('ordre')) && b.amount!==null);
  for(const b of resolved.active) {
    const item=allBO.find(item=>item.doc.name===b.document)!;
    const freePrice=b.modifications.filter(m=>m.section==='4.1'&&m.amount!==undefined).at(-1);
    const amount=freePrice?.amount??b.amount;
    if(amount!==null){ apply(item.doc,'BO',freePrice?'B2.2':'B2.1',amount); chosen={...item,amount}; }
  }
  const counters = documents
    .filter((d) => documentKind(pagesText(d)) === "counter_proposal")
    .map(parseCounterProposal);
  const path = acceptedPath ?? resolveCounterProposalPath(
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
    const amount = clauseAmount(priceClause(doc, "P2.3.1", "P2.3.2")) ?? clauseAmount(counterClauses(pagesText(doc))["P2.3.1"] || "");
    if (amount !== null) {
      apply(doc, "CP", "P2.3.1", amount);
      ambiguous = false;
    }
  }
  // Source 1474422: a later explicitly accepted/signed amendment may replace
  // the accepted contract. Preserve the CRM's pre-acceptance BO path above.
  if (laterBO.length) {
    laterBO.sort((a,b)=>Date.parse(a.signedAt!) - Date.parse(b.signedAt!));
    if (new Set(laterBO.map(b=>b.signedAt)).size === laterBO.length) {
      for (const b of laterBO) if (b.amount !== null) { apply(b.doc,"BO","B2.1",b.amount); ambiguous=false; }
    } else ambiguous=true;
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
