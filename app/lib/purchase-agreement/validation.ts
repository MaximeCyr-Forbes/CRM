import type { Listing } from "../../data/listing-types";
import { listingAddressLines } from "../listings/presentation";
import { normalizeAddressPart, normalizeCivicNumber, normalizePersonName, normalizePostalCode } from "./normalize";
import type { PurchaseAgreementParseResult } from "./types";

export type PurchaseAgreementListingValidation = {
  addressMatch: boolean;
  sellerMatch: boolean | null;
  canImport: boolean;
  missingFields: string[];
  listingAddress: string;
};

export function validatePurchaseAgreementForListing(
  result: PurchaseAgreementParseResult,
  listing: Listing,
  ownerNames: ReadonlyArray<string>,
): PurchaseAgreementListingValidation {
  const address = result.propertyAddress;
  const civicMatch = Boolean(address.civicNumber && listing.civicNumber)
    && normalizeCivicNumber(address.civicNumber) === normalizeCivicNumber(listing.civicNumber);
  const listingStreet = listing.address.replace(listing.civicNumber, "").trim();
  const streetMatch = Boolean(address.street && listingStreet)
    && normalizeAddressPart(address.street) === normalizeAddressPart(listingStreet);
  const cityMatch = Boolean(address.city && listing.city)
    && normalizeAddressPart(address.city) === normalizeAddressPart(listing.city);
  const postalMatch = Boolean(address.postalCode && listing.postalCode)
    && normalizePostalCode(address.postalCode) === normalizePostalCode(listing.postalCode);
  const addressMatch = civicMatch && streetMatch && (cityMatch || postalMatch);

  const normalizedOwners = ownerNames.map(normalizePersonName).filter(Boolean);
  const sellerMatch = result.sellers.length === 0 || normalizedOwners.length === 0
    ? null
    : result.sellers.every((seller) => normalizedOwners.includes(normalizePersonName(seller)));
  const missingFields = [
    result.buyers.length === 0 ? "Acheteurs (section 1)" : "",
    !address.fullAddress ? "Adresse de l’immeuble (clause 3.1)" : "",
    result.amount === null ? "Prix offert (clause 4.1)" : "",
  ].filter(Boolean);

  return {
    addressMatch,
    sellerMatch,
    canImport: result.recognized && missingFields.length === 0 && addressMatch,
    missingFields,
    listingAddress: listingAddressLines(listing).join(", "),
  };
}
