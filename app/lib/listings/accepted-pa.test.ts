import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseListingAcceptedPaInput } from "./accepted-pa";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("validation PA acceptée", () => {
  const valid = {
    offerId: null,
    amount: 550000,
    offerDate: "2026-08-22",
    buyerNames: " Jean Tremblay ",
  };

  it("valide le prix, la date et normalise les acheteurs", () => {
    expect(parseListingAcceptedPaInput(valid)).toEqual({ ...valid, buyerNames: "Jean Tremblay" });
  });

  it("refuse les prix et dates invalides", () => {
    expect(parseListingAcceptedPaInput({ ...valid, amount: 0 })).toBeNull();
    expect(parseListingAcceptedPaInput({ ...valid, amount: Number.NaN })).toBeNull();
    expect(parseListingAcceptedPaInput({ ...valid, offerDate: "2026-02-30" })).toBeNull();
    expect(parseListingAcceptedPaInput({ ...valid, offerDate: "" })).toBeNull();
  });
});

describe("interface PA acceptée", () => {
  const action = source("app/components/listing-pa-accepted-action.tsx");
  const detail = source("app/listings/[listingId]/page.tsx");
  const route = source("app/api/listings/[listingId]/accept-pa/route.ts");

  it("place l’action verte entre Modifier et Supprimer", () => {
    const modifier = detail.indexOf("setIsEditing(true)");
    const accepted = detail.indexOf("<ListingPaAcceptedAction");
    const remove = detail.indexOf("setIsDeleting(true)");
    expect(modifier).toBeGreaterThan(-1);
    expect(accepted).toBeGreaterThan(modifier);
    expect(remove).toBeGreaterThan(accepted);
    expect(action).toContain("listing-accepted-pa-button");
    expect(action).toContain("PA ACCEPTÉE");
  });

  it("masque l’action pour la location et ouvre une Transaction déjà liée", () => {
    expect(action).toContain('listing.purpose !== "sale"');
    expect(action).toContain("offers.transactionLink");
    expect(action).toContain("OUVRIR LA TRANSACTION");
    expect(action).toContain("/transactions/${offers.transactionLink!.transactionId}");
  });

  it("affiche les champs requis et protège la création contre le double clic", () => {
    for (const label of ["Prix accepté *", "Date de la PA *", "Acheteur(s)", "CRÉER LA TRANSACTION", "CRÉATION…"]) {
      expect(action).toContain(label);
    }
    expect(action).toContain("submissionLock.current");
    expect(action).toContain("acceptedOffers.length > 1");
    expect(action).toContain("Choisissez l’offre acceptée à utiliser.");
  });

  it("réutilise le hook existant et recharge les Transactions avant la navigation", () => {
    expect(action).toContain("useListingOffers(listing.id, onListingChanged)");
    expect(action).toContain("await offers.acceptPa(values)");
    expect(action).toContain("await retryTransactions()");
    expect(action).toContain("router.push(`/transactions/${link.transactionId}`)");
  });

  it("protège la route orchestratrice sans dupliquer le SQL métier", () => {
    expect(route).toContain("requireApiAccess()");
    expect(route).toContain("isSameOriginRequest(request)");
    expect(route).toContain("isUuid(listingId)");
    expect(route).toContain("acceptListingPurchaseAgreement(listingId, values, actor)");
    expect(route).not.toContain("getSupabaseAdmin");
    expect(route).not.toContain("create_transaction_from_listing_offer");
  });

  it("conserve le RPC existant pour les données, propriétaires, lien et statut conditionnel", () => {
    const sql = source("supabase/migrations/20260819234500_add_listing_offers_and_transaction_links.sql");
    expect(sql).toContain("create_transaction_from_listing_offer");
    expect(sql).toContain("v_listing.centris_number, 'sale', v_listing.broker, v_offer.amount");
    expect(sql).toContain("v_offer.offer_date, 'pa_accepted'");
    expect(sql).toContain("insert into public.transaction_contacts");
    expect(sql).toContain("where listing_id = p_listing_id and role = 'owner'");
    expect(sql).toContain("insert into public.listing_transaction_links");
    expect(sql).toContain("update public.listings set status = 'conditional'");
    expect(sql).not.toContain("delete from public.listings");
  });
});
