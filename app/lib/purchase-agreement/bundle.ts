import { analyzeOaciqTransaction } from "../transactions/oaciq-analysis";
import type { OaciqPdfInput } from "../oaciq-reader/types";
import type { OaciqTransactionPreview } from "../transactions/oaciq-agenda";
import type { PurchaseAgreementParseResult } from "./types";

/** One contractual engine for transaction and listing previews. No persistence. */
export function purchaseAgreementFromAnalysis(data: OaciqTransactionPreview): PurchaseAgreementParseResult {
  return {
    recognized: !!data.mainDocument && data.forms.some(f => f.document === data.mainDocument && f.kind === "promise_to_purchase"),
    buyers: data.buyerNames,
    sellers: data.sellerNames,
    propertyAddress: {
      fullAddress: data.propertyAddress || "",
      civicNumber: data.propertyCivicNumber || "",
      street: data.propertyStreet || "",
      city: data.propertyCity || "",
      province: data.propertyProvince || "",
      postalCode: data.propertyPostalCode || "",
    },
    amount: data.finalPrice,
    warnings: [...data.warnings],
  };
}
export async function analyzePurchaseAgreementBundle(inputs: OaciqPdfInput[]) {
  return purchaseAgreementFromAnalysis(await analyzeOaciqTransaction(inputs));
}
