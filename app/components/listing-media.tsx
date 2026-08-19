"use client";

import { useState } from "react";
import type { Listing } from "../data/listing-types";
import { listingAddressLines } from "../lib/listings/presentation";

export function ListingMedia({
  listing,
  variant = "card",
}: {
  listing: Listing;
  variant?: "card" | "detail";
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const address = listingAddressLines(listing)[0];
  const variantClassName = variant === "detail" ? " listing-detail-media-content" : "";

  if (!listing.primaryImageUrl || hasImageError) {
    return (
      <div
        aria-label={`Aucune image disponible pour ${address}`}
        className={`listing-card-placeholder${variantClassName}`}
        role="img"
      >
        <span>ÉQUIPE FORBES</span>
        <strong>IMMOBILIER</strong>
      </div>
    );
  }

  return (
    <img
      alt={address}
      className={`listing-card-image${variantClassName}`}
      loading="lazy"
      onError={() => setHasImageError(true)}
      src={listing.primaryImageUrl}
    />
  );
}
