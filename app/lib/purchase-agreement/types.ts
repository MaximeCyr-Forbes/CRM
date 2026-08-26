import type { PositionedPDFText } from "../pdf/extract-positioned-text";

export type PurchaseAgreementAddress = {
  fullAddress: string;
  civicNumber: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
};

export type PurchaseAgreementParseResult = {
  recognized: boolean;
  buyers: string[];
  sellers: string[];
  propertyAddress: PurchaseAgreementAddress;
  amount: number | null;
  warnings: string[];
};

export type PurchaseAgreementTextFixture = PositionedPDFText;
