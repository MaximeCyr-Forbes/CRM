import type { ListingReportData } from "../../data/listing-types";
import { getSupabaseAdmin } from "../supabase/server";
import { getListingTransactionLink, listListingOffers } from "./offers";
import { getListing } from "./server-service";
import { getListingTracking } from "./tracking";

type OwnerNameRow = { id: string; first_name: string; last_name: string };

export async function getListingReportData(listingId: string): Promise<ListingReportData> {
  const listing = await getListing(listingId);
  const [trackingResult, offersResult, linkResult, ownersResult] = await Promise.allSettled([
    getListingTracking(listingId),
    listListingOffers(listingId),
    getListingTransactionLink(listingId),
    listing.ownerContactIds.length === 0
      ? Promise.resolve([] as OwnerNameRow[])
      : getSupabaseAdmin().from("contacts").select("id, first_name, last_name").in("id", listing.ownerContactIds)
        .then(({ data, error }) => { if (error) throw error; return (data ?? []) as OwnerNameRow[]; }),
  ]);

  if (trackingResult.status === "rejected") console.error("Données de suivi du rapport Listing indisponibles", trackingResult.reason);
  if (offersResult.status === "rejected") console.error("Offres du rapport Listing indisponibles", offersResult.reason);
  if (linkResult.status === "rejected") console.error("Lien Transaction du rapport Listing indisponible", linkResult.reason);
  if (ownersResult.status === "rejected") console.error("Propriétaires du rapport Listing indisponibles", ownersResult.reason);

  const owners = ownersResult.status === "fulfilled" ? ownersResult.value : [];
  const namesById = new Map(owners.map((owner) => [owner.id, [owner.first_name, owner.last_name].filter(Boolean).join(" ") || "Propriétaire"]));
  const tracking = trackingResult.status === "fulfilled" ? {
    ...trackingResult.value,
    activity: [],
    visits: trackingResult.value.visits.map((visit) => ({
      ...visit, buyerNames: "", visitingBrokerName: "", visitingBrokerAgency: "",
    })),
  } : null;
  const offers = offersResult.status === "fulfilled" ? offersResult.value.map((offer) => ({
    ...offer, buyerNames: "", collaboratingBrokerName: "", collaboratingBrokerAgency: "", notes: "",
  })) : null;

  return {
    listing: { ...listing, generalNotes: "" },
    ownerNames: listing.ownerContactIds.map((id) => namesById.get(id)).filter((name): name is string => Boolean(name)),
    tracking,
    offers,
    transactionLink: linkResult.status === "fulfilled" ? linkResult.value : null,
    trackingAvailable: tracking !== null,
    offersAvailable: offers !== null,
  };
}
