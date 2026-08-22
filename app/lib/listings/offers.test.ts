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
  linkedOfferId = offerId;
  transactionCreations = 0;
  offerCreations = 0;
  failTransactionOnce = false;
  purpose: "sale" | "rental" = "sale";
  listOfferRows = async () => this.rows;
  async createOfferRow(_listingId: string, values: ListingOfferDraft, actor: ListingBroker | null) {
    this.offerCreations += 1;
    const row: ListingOfferRow = {
      id: this.offerCreations === 1 ? offerId : `20000000-0000-4000-8000-${this.offerCreations.toString().padStart(12, "0")}`,
      listing_id: listingId, purpose: this.purpose, offer_date: values.offerDate,
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
  async getListingPurpose() { return this.purpose; }
  async getLinkRow() { return this.linked ? { listing_id: listingId, offer_id: this.linkedOfferId, transaction_id: transactionId, created_at: now } : null; }
  async getTransactionRow() { return this.linked ? { id: transactionId, status: "pa_accepted", price: 725000, promise_date: "2026-08-19", broker: "maxime" as const } : null; }
  async createTransactionLink(_listingId: string, selectedOfferId: string) {
    if (this.failTransactionOnce) {
      this.failTransactionOnce = false;
      throw new Error("Panne temporaire");
    }
    if (!this.linked) this.transactionCreations += 1;
    this.linkedOfferId = selectedOfferId;
    this.linked = true;
    return transactionId;
  }
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

  it("crée une offre acceptée puis la Transaction avec les données PA", async () => {
    const repository = new MemoryOffersRepository();
    const service = createListingOffersService(repository);
    const link = await service.acceptListingPurchaseAgreement(listingId, {
      offerId: null,
      amount: 550000,
      offerDate: "2026-08-22",
      buyerNames: "Jean Tremblay",
    }, "maxime");
    expect(repository.rows).toHaveLength(1);
    expect(repository.rows[0]).toMatchObject({
      purpose: "sale",
      status: "accepted",
      amount: 550000,
      offer_date: "2026-08-22",
      buyer_names: "Jean Tremblay",
      collaborating_broker_name: "",
      collaborating_broker_agency: "",
      notes: "",
    });
    expect(link).toMatchObject({ transactionId, offerId });
  });

  it("réutilise l’offre acceptée après un échec partiel sans en créer une deuxième", async () => {
    const repository = new MemoryOffersRepository();
    repository.failTransactionOnce = true;
    const service = createListingOffersService(repository);
    const values = { offerId: null, amount: 550000, offerDate: "2026-08-22", buyerNames: "Jean" };
    await expect(service.acceptListingPurchaseAgreement(listingId, values, "maxime"))
      .rejects.toThrow("Panne temporaire");
    expect(repository.rows).toHaveLength(1);
    const link = await service.acceptListingPurchaseAgreement(listingId, values, "maxime");
    expect(repository.rows).toHaveLength(1);
    expect(repository.offerCreations).toBe(1);
    expect(link.transactionId).toBe(transactionId);
  });

  it("retourne immédiatement la Transaction déjà liée", async () => {
    const repository = new MemoryOffersRepository();
    repository.linked = true;
    const service = createListingOffersService(repository);
    const link = await service.acceptListingPurchaseAgreement(listingId, {
      offerId: null, amount: 550000, offerDate: "2026-08-22", buyerNames: "",
    }, "maxime");
    expect(link.transactionId).toBe(transactionId);
    expect(repository.offerCreations).toBe(0);
    expect(repository.transactionCreations).toBe(0);
  });

  it("exige un choix lorsque plusieurs offres de vente sont acceptées", async () => {
    const repository = new MemoryOffersRepository();
    await repository.createOfferRow(listingId, { ...draft, status: "accepted" }, "maxime");
    await repository.createOfferRow(listingId, { ...draft, status: "accepted", amount: 700000 }, "maxime");
    const service = createListingOffersService(repository);
    const values = { offerId: null, amount: 550000, offerDate: "2026-08-22", buyerNames: "" };
    await expect(service.acceptListingPurchaseAgreement(listingId, values, "maxime"))
      .rejects.toMatchObject({ code: "multiple_accepted_offers" });
    const selected = await service.acceptListingPurchaseAgreement(
      listingId,
      { ...values, offerId: repository.rows[1].id },
      "maxime",
    );
    expect(selected.offerId).toBe(repository.rows[1].id);
    expect(repository.offerCreations).toBe(2);
  });

  it("refuse PA ACCEPTÉE pour un Listing de location avant toute création", async () => {
    const repository = new MemoryOffersRepository();
    repository.purpose = "rental";
    const service = createListingOffersService(repository);
    await expect(service.acceptListingPurchaseAgreement(listingId, {
      offerId: null, amount: 2500, offerDate: "2026-08-22", buyerNames: "",
    }, "maxime")).rejects.toMatchObject({ code: "invalid_purpose" });
    expect(repository.offerCreations).toBe(0);
  });
});
