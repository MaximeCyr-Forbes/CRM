import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("fiche détaillée Listings", () => {
  const detail = source("app/listings/[listingId]/page.tsx");
  const inventory = source("app/listings/page.tsx");
  const media = source("app/components/listing-media.tsx");
  const confirmation = source("app/components/listing-delete-confirmation-modal.tsx");
  const soldModal = source("app/components/sale-completion-modal.tsx");
  const context = source("app/listings-context.tsx");

  it("ouvre la même route depuis l’adresse et le bouton Ouvrir", () => {
    expect(inventory).toContain("router.push(`/listings/${listingId}`)");
    expect(inventory.match(/openListing\(listing\.id\)/g)).toHaveLength(2);
    expect(inventory).toContain("listing-card-address-link");
    expect(inventory).toContain("listing-card-open");
    expect(inventory).toContain("setEditingListing(listing)");
  });

  it("affiche l’entête, l’information, le prix adapté, les liens sûrs et les notes", () => {
    expect(detail).toContain("LISTING_PURPOSE_LABELS[listing.purpose]");
    expect(detail).toContain("BROKER_LABELS[listing.broker]");
    expect(detail).toContain("LISTING_STATUS_LABELS[listing.status]");
    expect(detail).toContain("LISTING_PROPERTY_TYPE_LABELS[listing.propertyType]");
    expect(detail).toContain("listingPriceLabel(listing)");
    expect(detail).toContain('listing.purpose === "sale" ? "Prix demandé" : "Loyer mensuel"');
    expect(detail).toContain('rel="noopener noreferrer"');
    expect(detail).toContain('target="_blank"');
    expect(detail).toContain("Aucune note interne pour le moment.");
  });

  it("réutilise le même média et le même fallback sur la carte et la fiche", () => {
    expect(inventory).toContain("<ListingMedia listing={listing} />");
    expect(detail).toContain('<ListingMedia listing={listing} variant="detail" />');
    expect(media).toContain("Photo indisponible");
    expect(media).toContain("listingBrokerPhoto(listing)");
    expect(media).toContain("hasImageError");
  });

  it("résout zéro, un ou plusieurs propriétaires sans retirer les relations manquantes", () => {
    expect(detail).toContain("resolveListingOwners(listing, contacts)");
    expect(detail).toContain("Aucun propriétaire lié à ce Listing.");
    expect(detail).toContain("Contact lié temporairement indisponible");
    expect(detail).toContain("La relation est conservée dans le Listing.");
    expect(detail.match(/router\.push\(`\/contacts\/\$\{contact\.id\}`\)/g)).toHaveLength(2);
  });

  it("réutilise l’éditeur existant et conserve l’identifiant à la modification", () => {
    expect(detail).toContain("ListingEditorModal");
    expect(detail).toContain("listingDraftFromListing(listing)");
    expect(detail).toContain("await updateListing(listing.id, draft)");
  });

  it("confirme puis supprime uniquement via le contexte Listings", () => {
    expect(detail).toContain("ListingDeleteConfirmationModal");
    expect(detail).toContain("await deleteListing(listing.id)");
    expect(detail).not.toContain("getSupabaseAdmin");
    expect(detail).not.toContain("/api/listings/");
    expect(confirmation).toContain("Les propriétaires liés resteront dans Contacts.");
    expect(confirmation).toContain("useDialogLifecycle(true, onClose)");
    expect(inventory).toContain('window.sessionStorage.getItem("listingNotice")');
  });

  it("distingue chargement, panne avec reprise et Listing introuvable", () => {
    expect(detail).toContain("Chargement de la fiche Listing…");
    expect(detail).toContain("Listing temporairement indisponible.");
    expect(detail).toContain("retry()");
    expect(detail).toContain("LISTING INTROUVABLE");
  });

  it("retire le déclencheur VENDU de la fiche tout en conservant le résultat et son infrastructure", () => {
    expect(detail).not.toContain("canMarkListingSold(listing)");
    expect(detail).not.toContain('className="listing-sold-button"');
    expect(detail).not.toContain("<SaleCompletionModal");
    expect(detail).not.toContain("markListingSold");
    expect(detail).toContain("RÉSULTAT DE LA VENTE");
    expect(detail).toContain("listing.soldPrice");
    expect(detail).toContain("listing.notaryDate");
    expect(detail).toContain("listing.collaboratingBrokerName");
    expect(context).toContain("markListingSold:");
    expect(context).toContain("/complete-sale");
    expect(context).toContain("return replaceListing(listing)");
  });

  it("rend la modal compacte, accessible, explicite et protégée contre le double clic", () => {
    expect(soldModal).toContain('role="dialog"');
    expect(soldModal).toContain('aria-modal="true"');
    expect(soldModal).toContain('aria-labelledby="sale-completion-title"');
    expect(soldModal).toContain("useDialogLifecycle(true, closeIfIdle)");
    expect(soldModal).toContain("acquireSaleSubmissionLock(submittingRef)");
    expect(soldModal).toContain('aria-busy={busy}');
    expect(soldModal).toContain("Aucun courtier collaborateur");
    expect(soldModal).toContain("Confirmer la vente");
  });

  it("conserve la finalisation VENDU hors de la fiche Listing", () => {
    expect(detail).toContain("ListingPaAcceptedAction");
    expect(soldModal).toContain("Prix de la Transaction");
    expect(context).not.toContain("/api/transactions");
  });

  it("retourne à l’historique seulement lorsque la provenance est l’inventaire", () => {
    expect(inventory).toContain('window.sessionStorage.setItem("listingOriginId", listingId)');
    expect(detail).toContain("originId === listingId");
    expect(detail).toContain('previous.pathname === "/listings"');
    expect(detail).toContain("router.back()");
    expect(detail).toContain('router.push("/listings")');
  });
});
