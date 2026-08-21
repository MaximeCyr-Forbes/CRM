import type { Listing, ListingBroker } from "../../data/listing-types";

export const LISTING_BROKER_PHOTOS = {
  france: "/brokers/france.jpg",
  maxime: "/brokers/maxime.jpg",
  sandrine: "/brokers/sandrine.jpg",
} as const satisfies Record<ListingBroker, string>;

export function listingBrokerPhoto(listing: Pick<Listing, "broker">) {
  return LISTING_BROKER_PHOTOS[listing.broker];
}
