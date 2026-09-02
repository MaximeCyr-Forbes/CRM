/** Current multi-form correction from source commit e6d5302. */
import { addDays } from "./dates";
import { formNumber, pagesText } from "./forms";
import type {
  OaciqAnnexR,
  OaciqCounterProposal as Counter,
  OaciqExtractedDocument as Doc,
  OaciqResponse,
} from "./types";
function compareCounter(a: Counter, b: Counter): number {
  const at = a.proposerSignedAt || a.responseSignedAt,
    bt = b.proposerSignedAt || b.responseSignedAt;
  const difference =
    (at ? Date.parse(at) : Infinity) - (bt ? Date.parse(bt) : Infinity);
  return (
    difference ||
    (a.formNumber < b.formNumber
      ? -1
      : a.formNumber > b.formNumber
        ? 1
        : a.fileName < b.fileName
          ? -1
          : a.fileName > b.fileName
            ? 1
            : 0)
  );
}
export function resolveCounterProposalChain(
  main: string,
  response: OaciqResponse,
  counters: Counter[],
): Counter | null {
  if (!counters.length || !["counter", "unknown"].includes(response.action))
    return null;
  const byNumber = new Map(
    counters.filter((c) => c.formNumber).map((c) => [c.formNumber, c]),
  );
  let current = byNumber.get(response.counterProposalNumber);
  if (current?.targetFormNumber && current.targetFormNumber !== main)
    current = undefined;
  if (!current) {
    const candidates = counters.filter(
      (c) => !c.targetFormNumber || c.targetFormNumber === main,
    );
    if (!candidates.length) return null;
    const referenced = new Set(
      candidates.map((c) => c.nextCounterProposalNumber).filter(Boolean),
    );
    const roots = candidates.filter((c) => !referenced.has(c.formNumber));
    current = (roots.length ? roots : candidates).sort(compareCounter)[0];
  }
  const visited = new Set<string>();
  while (current) {
    const identity = current.formNumber || current.fileName;
    if (visited.has(identity))
      throw new Error(
        "La chaîne de contre-propositions contient une référence circulaire.",
      );
    visited.add(identity);
    if (current.responseAction === "accept" && current.acceptedAt)
      return current;
    if (current.responseAction !== "counter") return null;
    let next = byNumber.get(current.nextCounterProposalNumber);
    if (
      next?.targetFormNumber &&
      ![main, current.formNumber].includes(next.targetFormNumber)
    )
      next = undefined;
    if (!next) {
      const from: Counter = current;
      next = counters
        .filter(
          (c) =>
            !visited.has(c.formNumber || c.fileName) &&
            (!c.targetFormNumber ||
              [main, from.formNumber].includes(c.targetFormNumber)) &&
            (!from.responseSignedAt ||
              !c.proposerSignedAt ||
              Date.parse(c.proposerSignedAt) >=
                Date.parse(from.responseSignedAt)),
        )
        .sort(compareCounter)[0];
    }
    current = next;
  }
  return null;
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
    base && n !== null ? addDays(base, n) : null;
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
      acceptedDay && otherDays != null ? addDays(acceptedDay, otherDays) : null,
    deed_of_sale_date: counter?.notaryDate || notaryDate,
    occupancy_date: counter?.occupationDate || occupationDate,
    occupancy_time: counter?.occupationDate
      ? counter.occupationTime
      : occupationTime,
  };
}
