import type { Listing, ListingBroker } from "../../data/listing-types";

export const BROKER_PHOTOS = {
  france: "/brokers/france.jpg",
  maxime: "/brokers/maxime.jpg",
  sandrine: "/brokers/sandrine.jpg",
} as const satisfies Record<ListingBroker, string>;

export const LISTING_BROKER_PHOTOS = BROKER_PHOTOS;

export function listingBrokerPhoto(listing: Pick<Listing, "broker">) {
  return BROKER_PHOTOS[listing.broker];
}
