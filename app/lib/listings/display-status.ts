import { LISTING_STATUS_LABELS, type Listing } from "../../data/listing-types";

type DisplayStatusInput = Pick<Listing, "status"> & Partial<Pick<Listing,
  "purpose" | "centrisStandardStatus" | "centrisMlsStatus">>;

/** Commercial presentation only. Never use this status to finalize a CRM dossier. */
export function getListingDisplayStatus(listing: DisplayStatusInput) {
  if (listing.status !== "sold" && listing.status !== "rented"
    && listing.purpose === "sale"
    && listing.centrisStandardStatus === "Closed" && listing.centrisMlsStatus === "Sold") {
    return { status: "sold" as const, source: "centris" as const, label: "Vendu — Centris" };
  }
  return { status: listing.status, source: "crm" as const, label: LISTING_STATUS_LABELS[listing.status] };
}
