"use client";

import { useEffect, useState } from "react";
import { BROKER_LABELS } from "../data/contact-types";
import type { Listing } from "../data/listing-types";
import { listingBrokerPhoto } from "../lib/listings/broker-photos";
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
  const brokerLabel = BROKER_LABELS[listing.broker];
  const photo = listingBrokerPhoto(listing);
  const variantClassName = variant === "detail" ? " listing-detail-media-content" : "";

  useEffect(() => setHasImageError(false), [photo]);

  if (hasImageError) {
    return (
      <div
        aria-label={`Photo de ${brokerLabel} indisponible pour le Listing ${address}`}
        className={`listing-broker-photo-fallback${variantClassName}`}
        role="img"
      >
        <strong>{brokerLabel}</strong>
        <span>Photo indisponible</span>
      </div>
    );
  }

  return (
    <img
      alt={`${brokerLabel} — courtier responsable du Listing ${address}`}
      className={`listing-card-image listing-broker-photo listing-broker-photo-${listing.broker}${variantClassName}`}
      loading={variant === "detail" ? "eager" : "lazy"}
      onError={() => setHasImageError(true)}
      src={photo}
    />
  );
}
