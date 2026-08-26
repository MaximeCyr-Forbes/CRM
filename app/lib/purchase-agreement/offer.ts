import type { ListingOfferDraft } from "../../data/listing-types";
import { toLocalISODate } from "../follow-up";
import type { PurchaseAgreementParseResult } from "./types";

export function purchaseAgreementOfferDraft(
  result: PurchaseAgreementParseResult,
  referenceDate = new Date(),
): ListingOfferDraft | null {
  if (!result.recognized || result.buyers.length === 0 || result.amount === null) return null;
  return {
    offerDate: toLocalISODate(referenceDate),
    amount: result.amount,
    status: "received",
    buyerNames: result.buyers.join(", "),
    collaboratingBrokerName: "",
    collaboratingBrokerAgency: "",
    notes: "",
  };
}
