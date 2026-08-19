import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const modal = readFileSync(resolve(root, "app/components/listing-editor-modal.tsx"), "utf8");
const page = readFileSync(resolve(root, "app/listings/page.tsx"), "utf8");
const context = readFileSync(resolve(root, "app/listings-context.tsx"), "utf8");

describe("interface de création et modification Listings", () => {
  it("ouvre une modal accessible avec fermeture Escape et boutons Annuler", () => {
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('aria-labelledby="listing-editor-title"');
    expect(modal).toContain("useDialogLifecycle(true, onClose)");
    expect(modal).toContain("Annuler");
  });

  it("utilise createListing et updateListing sans accès Supabase direct", () => {
    expect(page).toContain("createListing(draft)");
    expect(page).toContain("updateListing(editingListing.id, draft)");
    expect(modal).not.toContain("getSupabaseAdmin");
    expect(modal).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("affiche les erreurs backend dans la modal sans la fermer", () => {
    expect(modal).toContain("caughtError.message");
    expect(modal).toContain('role="alert"');
    expect(context).not.toContain("setError(caughtError instanceof Error");
  });

  it("réutilise la recherche, les doublons et la création permanente des Contacts", () => {
    expect(modal).toContain("filterTransactionContacts");
    expect(modal).toContain("findStrongTransactionContactDuplicate");
    expect(modal).toContain("createAndLinkTransactionContact");
    expect(modal).toContain("addManualContact");
    expect(modal).toContain("CONTACT POSSIBLE DÉJÀ EXISTANT");
    expect(modal).toContain("Utiliser ce contact");
    expect(modal).toContain("Créer quand même");
    expect(modal).toContain("Enregistrer et lier");
  });

  it("prévoit les champs complets et laisse la suppression à la fiche détaillée", () => {
    for (const field of [
      "purpose", "civicNumber", "address", "apartment", "city", "province", "postalCode", "country",
      "propertyType", "centrisNumber", "broker", "status", "listingDate", "expirationDate", "ownerContactIds",
      "centrisUrl", "publicUrl", "primaryImageUrl", "generalNotes",
    ]) expect(modal).toContain(field);
    expect(page).toContain("Modifier");
    expect(page).not.toContain("Supprimer le Listing");
    expect(page).toContain("/listings/${listingId}");
    expect(modal).not.toContain("Supprimer le Listing");
  });

  it("met immédiatement le contexte et la carte à jour avec le même UUID", () => {
    expect(context).toContain("[listing, ...current.filter((item) => item.id !== listing.id)]");
    expect(page).toContain("setConfirmation(`Listing créé · statut");
    expect(page).toContain("setConfirmation(`Listing modifié · statut");
  });
});
