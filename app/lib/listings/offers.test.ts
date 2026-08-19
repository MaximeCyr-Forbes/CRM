import { describe, expect, it } from "vitest";
import type { ListingBroker, ListingOfferDraft } from "../../data/listing-types";
import {
  createListingOffersService,
  parseListingOfferDraft,
  type ListingOfferRow,
  type ListingOffersRepository,
} from "./offers";

const listingId = "10000000-0000-4000-8000-000000000001";
const offerId = "20000000-0000-4000-8000-000000000001";
const transactionId = "30000000-0000-4000-8000-000000000001";
const now = "2026-08-19T20:00:00.000Z";
const draft = {
  offerDate: "2026-08-19", amount: 725000, status: "received",
  buyerNames: "Jean et Marie", collaboratingBrokerName: "Julie Roy",
  collaboratingBrokerAgency: "Agence Exemple", notes: "Financement confirmé",
} satisfies ListingOfferDraft;

class MemoryOffersRepository implements ListingOffersRepository {
  rows: ListingOfferRow[] = [];
  linked = false;
  transactionCreations = 0;
  purpose: "sale" | "rental" = "sale";
  listOfferRows = async () => this.rows;
  async createOfferRow(_listingId: string, values: ListingOfferDraft, actor: ListingBroker | null) {
    const row: ListingOfferRow = {
      id: offerId, listing_id: listingId, purpose: this.purpose, offer_date: values.offerDate,
      amount: values.amount, status: values.status, buyer_names: values.buyerNames,
      collaborating_broker_name: values.collaboratingBrokerName,
      collaborating_broker_agency: values.collaboratingBrokerAgency, notes: values.notes,
      accepted_at: values.status === "accepted" ? now : null, created_by: actor,
      created_at: now, updated_at: now,
    };
    this.rows.push(row); return row;
  }
  async updateOfferRow(_listingId: string, id: string, values: ListingOfferDraft) {
    const row = this.rows.find((item) => item.id === id)!;
    Object.assign(row, {
      offer_date: values.offerDate, amount: values.amount, status: values.status,
      buyer_names: values.buyerNames, collaborating_broker_name: values.collaboratingBrokerName,
      collaborating_broker_agency: values.collaboratingBrokerAgency, notes: values.notes,
      accepted_at: row.accepted_at ?? (values.status === "accepted" ? now : null), updated_at: now,
    });
    return row;
  }
  async deleteOfferRow(_listingId: string, id: string) { this.rows = this.rows.filter((row) => row.id !== id); }
  async getLinkRow() { return this.linked ? { listing_id: listingId, offer_id: offerId, transaction_id: transactionId, created_at: now } : null; }
  async getTransactionRow() { return this.linked ? { id: transactionId, status: "pa_accepted", price: 725000, promise_date: "2026-08-19", broker: "maxime" as const } : null; }
  async createTransactionLink() { if (!this.linked) this.transactionCreations += 1; this.linked = true; return transactionId; }
}

describe("validation des offres Listings", () => {
  it("accepte tous les champs métier d’une offre", () => {
    expect(parseListingOfferDraft(draft)).toEqual(draft);
  });

  it.each(["received", "negotiating", "countered", "accepted", "rejected", "withdrawn", "expired"] as const)("accepte le statut %s", (status) => {
    expect(parseListingOfferDraft({ ...draft, status })?.status).toBe(status);
  });

  it.each([
    [{ ...draft, amount: -1 }, "montant négatif"],
    [{ ...draft, amount: Number.NaN }, "montant invalide"],
    [{ ...draft, offerDate: "19-08-2026" }, "date invalide"],
    [{ ...draft, status: "unknown" }, "statut inconnu"],
  ])("refuse %s", (value) => expect(parseListingOfferDraft(value)).toBeNull());
});

describe("service des offres Listings", () => {
  it("retourne une liste vide avant la première offre", async () => {
    expect(await createListingOffersService(new MemoryOffersRepository()).listListingOffers(listingId)).toEqual([]);
  });

  it.each(["sale", "rental"] as const)("conserve automatiquement le purpose %s fourni par le Listing", async (purpose) => {
    const repository = new MemoryOffersRepository(); repository.purpose = purpose;
    const offer = await createListingOffersService(repository).createListingOffer(listingId, draft, "maxime");
    expect(offer).toMatchObject({ purpose, amount: 725000, offerDate: "2026-08-19", buyerNames: "Jean et Marie", collaboratingBrokerName: "Julie Roy", collaboratingBrokerAgency: "Agence Exemple", notes: "Financement confirmé", createdBy: "maxime" });
  });

  it("modifie l’offre sans changer son UUID et conserve acceptedAt", async () => {
    const repository = new MemoryOffersRepository(); const service = createListingOffersService(repository);
    const added = await service.createListingOffer(listingId, { ...draft, status: "accepted" }, "france");
    const updated = await service.updateListingOffer(listingId, added.id, { ...draft, status: "rejected", amount: 710000 }, "france");
    expect(updated).toMatchObject({ id: added.id, status: "rejected", amount: 710000, acceptedAt: now });
  });

  it("supprime l’offre sans toucher au Listing", async () => {
    const repository = new MemoryOffersRepository(); const service = createListingOffersService(repository);
    await service.createListingOffer(listingId, draft, null);
    await service.deleteListingOffer(listingId, offerId, null);
    expect(await service.listListingOffers(listingId)).toEqual([]);
  });

  it("crée et retourne le lien Transaction avec les données utiles", async () => {
    const repository = new MemoryOffersRepository(); const service = createListingOffersService(repository);
    const link = await service.createTransactionFromListingOffer(listingId, offerId, "maxime");
    expect(link).toMatchObject({ listingId, offerId, transactionId, transaction: { status: "pa_accepted", price: 725000, promiseDate: "2026-08-19", broker: "maxime" } });
  });

  it("rend la création idempotente lors d’un double clic", async () => {
    const repository = new MemoryOffersRepository(); const service = createListingOffersService(repository);
    const first = await service.createTransactionFromListingOffer(listingId, offerId, "maxime");
    const second = await service.createTransactionFromListingOffer(listingId, offerId, "maxime");
    expect(first.transactionId).toBe(second.transactionId);
    expect(repository.transactionCreations).toBe(1);
  });
});
