import type { Contact } from "../../data/contact-types";
import type { TransactionDraft } from "../../data/transaction-types";
import type { OaciqParty } from "../oaciq-reader/transaction-details";
import { isAgendaDate, type OaciqTransactionPreview } from "./oaciq-agenda";

export type OaciqPrefillField = "address" | "centrisNumber" | "price" | "promiseDate";
export type OaciqPrefillConflict = { field: OaciqPrefillField; value: string };
export const OACIQ_PREFILL_LABELS: Record<OaciqPrefillField, string> = { address: "Adresse", centrisNumber: "Numéro Centris", price: "Prix", promiseDate: "Date de la PA" };
export const normalizedPartyName = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’‘]/g, "'").replace(/[-–—\s]+/g, " ").trim();
const phoneKey = (phone: string) => { const n = phone.replace(/\D/g, ""); return n.length === 11 && n.startsWith("1") ? n.slice(1) : n; };
type ContactIdentity = Pick<Contact, "id" | "firstName" | "lastName" | "email" | "phone">;

export function matchOaciqParty(party: OaciqParty, contacts: ReadonlyArray<ContactIdentity>) {
  const email = party.email.trim().toLowerCase(), phone = phoneKey(party.phone);
  const emailMatches = email ? contacts.filter((c) => c.email.trim().toLowerCase() === email) : [];
  const phoneMatches = phone.length >= 10 ? contacts.filter((c) => phoneKey(c.phone) === phone) : [];
  // Strong identifiers pointing at different people are a conflict, not precedence.
  if (emailMatches.length && phoneMatches.length && !emailMatches.some((e) => phoneMatches.some((p) => p.id === e.id))) return { contactId: null, ambiguous: true };
  const strong = emailMatches.length && phoneMatches.length ? emailMatches.filter((e) => phoneMatches.some((p) => p.id === e.id)) : emailMatches.length ? emailMatches : phoneMatches;
  if (strong.length) return { contactId: strong.length === 1 ? strong[0].id : null, ambiguous: strong.length > 1 };
  const names = party.firstName && party.lastName ? contacts.filter((c) => c.firstName && c.lastName && normalizedPartyName(`${c.firstName} ${c.lastName}`) === normalizedPartyName(party.fullName)) : [];
  // A supplied but different identifier prevents a name-only association.
  const plausible = names.filter((c) => !(email && c.email && c.email.trim().toLowerCase() !== email) && !(phone.length >= 10 && c.phone && phoneKey(c.phone) !== phone));
  return { contactId: names.length === 1 && plausible.length === 1 ? names[0].id : null, ambiguous: names.length > 0 && !(names.length === 1 && plausible.length === 1) };
}

export function validOaciqPrice(analysis: Pick<OaciqTransactionPreview, "finalPrice" | "priceConfidence">) {
  return typeof analysis.finalPrice === "number" && Number.isFinite(analysis.finalPrice) && analysis.finalPrice > 0 && analysis.finalPrice <= 1e12 && analysis.priceConfidence !== "low";
}

export function prefillOaciqTransaction(
  values: TransactionDraft, price: string, analysis: OaciqTransactionPreview,
  contacts: ReadonlyArray<ContactIdentity>, dirty: ReadonlySet<OaciqPrefillField>,
  previous: Partial<Record<OaciqPrefillField, string>> = {},
) {
  const next = { ...values, contactIds: [...values.contactIds] };
  let nextPrice = price;
  const applied = { ...previous };
  const conflicts: OaciqPrefillConflict[] = [];
  const suggestions: Partial<Record<OaciqPrefillField, string>> = {};
  if (analysis.fieldSources.propertyAddress?.confidence === "high" && /^\d/.test(analysis.propertyAddress)) suggestions.address = analysis.propertyAddress;
  if (analysis.fieldSources.centrisNumber?.confidence === "high" && /^\d{5,10}$/.test(analysis.centrisNumber)) suggestions.centrisNumber = analysis.centrisNumber;
  if (analysis.fieldSources.paDate?.confidence === "high" && isAgendaDate(analysis.paDate)) suggestions.promiseDate = analysis.paDate;
  if (validOaciqPrice(analysis)) suggestions.price = String(analysis.finalPrice);
  for (const field of Object.keys(suggestions) as OaciqPrefillField[]) {
    const value = suggestions[field]!;
    const current = field === "price" ? price : values[field] ?? "";
    if (current === value) continue;
    if (dirty.has(field) || (field !== "price" && current.trim() && current !== previous[field])) { conflicts.push({ field, value }); continue; }
    if (field === "price") nextPrice = value;
    else next[field] = value;
    applied[field] = value;
  }
  const parties = [...analysis.buyers, ...analysis.sellers].map((party) => ({ party, ...matchOaciqParty(party, contacts) }));
  for (const p of parties) if (p.contactId && !next.contactIds.includes(p.contactId)) next.contactIds.push(p.contactId);
  return { values: next, price: nextPrice, applied, conflicts, parties };
}

/** Centris asking price must never replace a known OACIQ transaction price
 * (including a manual correction made after that analysis). */
export function preserveOaciqPrice(next: TransactionDraft, currentPrice: string, hasOaciqPrice: boolean) {
  return hasOaciqPrice ? { ...next, price: currentPrice ? Number(currentPrice) : null } : next;
}
