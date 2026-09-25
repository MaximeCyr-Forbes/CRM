/** Current multi-form correction from source commit e6d5302. */
import { addAcceptanceDeadline } from "./acceptance-deadlines";
import { formNumber, pagesText } from "./forms";
import { torontoDateTime } from "./dates";
import type {
  OaciqAnnexR,
  OaciqCounterProposal as Counter,
  OaciqExtractedDocument as Doc,
  OaciqResponse,
} from "./types";
/** Contractual traversal ported from transaction_bundle.contractual_chain,
 * 1474422. Only accepted, fully signed, unexpired CPs enter the contract. */
export function acceptedCounter(counter: Counter): boolean {
  if (counter.responseAction !== "accept" || !counter.acceptedAt || counter.signaturesComplete === false) return false;
  if (!counter.expiresAt) return true;
  if (counter.expiresAt.length === 10) return counter.acceptedAt.slice(0,10) <= counter.expiresAt;
  const [y,m,d,h,min] = counter.expiresAt.match(/\d+/g)!.map(Number);
  return Date.parse(counter.acceptedAt) <= Date.parse(torontoDateTime(y,m,d,h,min));
}
export function resolveContractualChain(main: string, response: OaciqResponse, counters: Counter[], mainAcceptedAt: string | null = null) {
  const path: Counter[] = [], warnings: string[] = [];
  let current: Counter | null = null;
  let number = main, action = response.action, nextNumber = response.counterProposalNumber;
  let terminalDate = mainAcceptedAt;
  const seen = new Set<string>();
  while (true) {
    if (seen.has(number)) throw new Error("La chaîne de contre-propositions contient une référence circulaire.");
    seen.add(number);
    const accepted = current ? acceptedCounter(current) : !!mainAcceptedAt;
    if (accepted && current) {
      if (terminalDate && Date.parse(current.acceptedAt!) < Date.parse(terminalDate)) {
        warnings.push("Chronologie des CP acceptées incohérente; contrat précédent conservé."); break;
      }
      terminalDate = current.acceptedAt;
      path.push(current);
    } else if (!accepted && ["refuse", "accept"].includes(action)) {
      if (!terminalDate) warnings.push("Acceptation complète et valide non établie.");
      break;
    }
    let children = counters.filter(c => !seen.has(c.formNumber) && (nextNumber ? c.formNumber === nextNumber : c.targetFormNumber === number));
    if (!children.length && accepted && terminalDate) children = counters.filter(c => !seen.has(c.formNumber) && c.targetFormNumber === main && acceptedCounter(c) && Date.parse(c.acceptedAt!) > Date.parse(terminalDate!));
    if (!children.length && terminalDate) break;
    if (children.length > 1 && children.every(acceptedCounter)) {
      children.sort((a,b) => Date.parse(a.acceptedAt!) - Date.parse(b.acceptedAt!));
      if (new Set(children.map(c => Date.parse(c.acceptedAt!))).size === children.length) children = children.slice(0,1);
    }
    if (children.length !== 1) {
      if (nextNumber && seen.has(nextNumber)) throw new Error("La chaîne de contre-propositions contient une référence circulaire.");
      if (children.length || nextNumber) warnings.push("Chaîne de CP manquante ou ambiguë; contrat établi conservé.");
      break;
    }
    current = children[0];
    if (current.targetFormNumber && ![main,number].includes(current.targetFormNumber)) {
      warnings.push("La cible de la CP ne correspond pas à la chaîne contractuelle."); break;
    }
    number = current.formNumber; action = current.responseAction; nextNumber = current.nextCounterProposalNumber;
  }
  return {path, warnings};
}
export function resolveCounterProposalPath(main: string, response: OaciqResponse, counters: Counter[], mainAcceptedAt: string | null = null): Counter[] {
  return resolveContractualChain(main,response,counters,mainAcceptedAt).path;
}
export function resolveCounterProposalChain(main: string, response: OaciqResponse, counters: Counter[], mainAcceptedAt: string | null = null): Counter | null {
  return resolveCounterProposalPath(main,response,counters,mainAcceptedAt).at(-1) ?? null;
}
export function selectMainPromise(
  candidates: Doc[],
  counters: Counter[],
  annexes: OaciqAnnexR[],
): Doc {
  if (candidates.length === 1) return candidates[0];
  const references = new Set(
    [...counters, ...annexes].map((c) => c.targetFormNumber).filter(Boolean),
  );
  const linked = candidates.filter((d) =>
    references.has(formNumber(d.name, pagesText(d))),
  );
  if (linked.length === 1) return linked[0];
  throw new Error(
    "Plusieurs promesses d'achat ont été déposées et leurs références ne permettent pas d'identifier une transaction unique.",
  );
}
export function calculateTransactionDates(
  acceptedAt: string | null,
  financingDays: number | null,
  inspectionDays: number | null,
  documentsDays: number | null,
  annex: OaciqAnnexR | null = null,
  notaryDate: string | null = null,
  occupationDate: string | null = null,
  occupationTime = "",
  counter: Counter | null = null,
): Record<string, string | null> {
  const acceptedDay = acceptedAt?.slice(0, 10) || null;
  const base =
    annex?.allDeadlinesDeferred || counter?.allDeadlinesDeferred
      ? null
      : acceptedDay;
  const after = (n: number | null) =>
    n !== null ? addAcceptanceDeadline(base, n, "").dueDate : null;
  const otherDays = annex?.otherOfferCancellationDays;
  return {
    effective_acceptance_date: acceptedDay,
    inspection_deadline: after(inspectionDays),
    inspection_report_deadline: after(
      inspectionDays === null ? null : inspectionDays + 4,
    ),
    documents_delivery_deadline: after(documentsDays),
    documents_review_deadline: after(
      documentsDays === null ? null : documentsDays + 7,
    ),
    financing_deadline: after(financingDays),
    other_offer_cancellation_deadline:
      otherDays != null ? addAcceptanceDeadline(acceptedDay, otherDays, "").dueDate : null,
    deed_of_sale_date: counter?.notaryDate || notaryDate,
    occupancy_date: counter?.occupationDate || occupationDate,
    occupancy_time: counter?.occupationDate
      ? counter.occupationTime
      : occupationTime,
  };
}
