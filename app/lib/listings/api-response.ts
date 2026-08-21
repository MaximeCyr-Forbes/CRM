import { ListingServiceError } from "./server-service";

export function listingApiError(error: unknown, fallbackMessage: string) {
  console.error(
    `Erreur Listings — ${fallbackMessage}`,
    error,
  );
  if (error instanceof ListingServiceError) {
    if (error.code === "duplicate_centris") {
      return Response.json({ error: "Un Listing avec ce numéro Centris existe déjà." }, { status: 409 });
    }
    if (error.code === "invalid_owner") {
      return Response.json({ error: "Propriétaire invalide." }, { status: 400 });
    }
    if (error.code === "not_found") {
      return Response.json({ error: "Listing introuvable." }, { status: 404 });
    }
    if (error.code === "invalid_listing") {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error.code === "invalid_sale_completion" || error.code === "invalid_purpose") {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error.code === "already_sold") {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error.code === "invalid_offer") {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error.code === "offer_linked" || error.code === "listing_already_linked") {
      return Response.json({ error: error.message }, { status: 409 });
    }
  }
  return Response.json({ error: fallbackMessage }, { status: 502 });
}
