import { describe, expect, it, vi } from "vitest";
import type { ListingDraft, ListingSaleCompletion } from "../../data/listing-types";
import {
  LISTING_OWNER_BATCH_SIZE,
  ListingServiceError,
  loadListingOwnerRowsInBatches,
  type ListingFilters,
  type ListingOwnerRow,
  type ListingRepository,
  type ListingRow,
  type ListingUpdate,
} from "./persistence";
import { createListingsService, mapListing } from "./server-service";

const owner1 = "00000000-0000-4000-8000-000000000001";
const owner2 = "00000000-0000-4000-8000-000000000002";
const owner3 = "00000000-0000-4000-8000-000000000003";
const missingOwner = "00000000-0000-4000-8000-000000000099";

function listingDraft(values: Partial<ListingDraft> = {}): ListingDraft {
  return {
    civicNumber: "150",
    address: "avenue Léo-Lacombe",
    apartment: "",
    city: "Deux-Montagnes",
    province: "QC",
    postalCode: "J7R 3W7",
    country: "Canada",
    centrisNumber: "",
    broker: "maxime",
    status: "preparation",
    purpose: "sale",
    askingPrice: null,
    monthlyRent: null,
    propertyType: "residential",
    listingDate: null,
    expirationDate: null,
    centrisUrl: "",
    publicUrl: "",
    primaryImageUrl: "",
    generalNotes: "",
    ownerContactIds: [],
    ...values,
  };
}

function rowFromDraft(id: string, draft: ListingDraft): ListingRow {
  return {
    id,
    civic_number: draft.civicNumber,
    address: draft.address,
    apartment: draft.apartment,
    city: draft.city,
    province: draft.province,
    postal_code: draft.postalCode,
    country: draft.country,
    centris_number: draft.centrisNumber,
    broker: draft.broker,
    status: draft.status,
    purpose: draft.purpose,
    asking_price: draft.askingPrice,
    monthly_rent: draft.monthlyRent,
    sold_price: null,
    notary_date: null,
    collaborating_broker_name: "",
    property_type: draft.propertyType,
    listing_date: draft.listingDate,
    expiration_date: draft.expirationDate,
    centris_url: draft.centrisUrl,
    public_url: draft.publicUrl,
    primary_image_url: draft.primaryImageUrl,
    general_notes: draft.generalNotes,
    created_at: "2026-08-19T20:00:00.000Z",
    updated_at: "2026-08-19T20:00:00.000Z",
  };
}

class MemoryListingRepository implements ListingRepository {
  rows: ListingRow[] = [];
  owners: ListingOwnerRow[] = [];
  readonly contacts = new Set([owner1, owner2, owner3]);
  ownerLoadCalls = 0;
  nextId = 1;
  activity: Array<{ eventType: string; listingId: string }> = [];

  async listRows(filters: ListingFilters) {
    return this.rows.filter((row) =>
      (!filters.broker || row.broker === filters.broker)
      && (!filters.status || row.status === filters.status)
      && (!filters.purpose || row.purpose === filters.purpose));
  }

  async getRow(listingId: string) {
    return this.rows.find((row) => row.id === listingId) ?? null;
  }

  async listOwnerRows(listingIds: ReadonlyArray<string>) {
    this.ownerLoadCalls += 1;
    const ids = new Set(listingIds);
    return this.owners.filter((owner) => ids.has(owner.listing_id));
  }

  private validateOwners(ownerContactIds: ReadonlyArray<string>) {
    if (ownerContactIds.some((contactId) => !this.contacts.has(contactId))) {
      throw new ListingServiceError("invalid_owner", "Propriétaire invalide.");
    }
  }

  async createWithOwners(draft: ListingDraft) {
    this.validateOwners(draft.ownerContactIds);
    const normalizedCentris = draft.centrisNumber.replace(/\s+/g, "").toUpperCase();
    if (normalizedCentris && this.rows.some((row) => row.centris_number.replace(/\s+/g, "").toUpperCase() === normalizedCentris)) {
      throw new ListingServiceError("duplicate_centris", "Un Listing avec ce numéro Centris existe déjà.");
    }
    const id = `10000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`;
    const row = rowFromDraft(id, draft);
    this.rows.push(row);
    this.owners.push(...[...new Set(draft.ownerContactIds)].map((contactId) => ({ listing_id: id, contact_id: contactId, role: "owner" as const })));
    return row;
  }

  async updateWithOwners(listingId: string, values: ListingUpdate) {
    const index = this.rows.findIndex((row) => row.id === listingId);
    if (index < 0) throw new ListingServiceError("not_found", "Listing introuvable.");
    if (values.ownerContactIds) this.validateOwners(values.ownerContactIds);
    const current = this.rows[index];
    const fieldMap: Partial<Record<keyof ListingUpdate, keyof ListingRow>> = {
      civicNumber: "civic_number", address: "address", apartment: "apartment", city: "city",
      province: "province", postalCode: "postal_code", country: "country", centrisNumber: "centris_number",
      broker: "broker", status: "status", purpose: "purpose", askingPrice: "asking_price",
      monthlyRent: "monthly_rent", propertyType: "property_type", listingDate: "listing_date",
      expirationDate: "expiration_date", centrisUrl: "centris_url", publicUrl: "public_url",
      primaryImageUrl: "primary_image_url", generalNotes: "general_notes",
    };
    const updated = { ...current } as Record<string, unknown>;
    for (const [field, column] of Object.entries(fieldMap)) {
      if (values[field as keyof ListingUpdate] !== undefined) updated[column] = values[field as keyof ListingUpdate];
    }
    updated.updated_at = "2026-08-19T21:00:00.000Z";
    this.rows[index] = updated as ListingRow;
    if (values.ownerContactIds !== undefined) {
      this.owners = this.owners.filter((owner) => owner.listing_id !== listingId);
      this.owners.push(...[...new Set(values.ownerContactIds)].map((contactId) => ({ listing_id: listingId, contact_id: contactId, role: "owner" as const })));
    }
    return this.rows[index];
  }

  async completeSale(listingId: string, values: ListingSaleCompletion) {
    const index = this.rows.findIndex((row) => row.id === listingId);
    if (index < 0) throw new ListingServiceError("not_found", "Listing introuvable.");
    const current = this.rows[index];
    if (current.purpose !== "sale") {
      throw new ListingServiceError("invalid_purpose", "Seul un Listing en vente peut être marqué comme vendu.");
    }
    if (current.status === "sold") {
      throw new ListingServiceError("already_sold", "Ce Listing est déjà marqué comme vendu.");
    }
    this.rows[index] = {
      ...current,
      status: "sold",
      sold_price: values.soldPrice,
      notary_date: values.notaryDate,
      collaborating_broker_name: values.collaboratingBrokerName,
      updated_at: "2026-08-21T15:00:00.000Z",
    };
    this.activity.push(
      { eventType: "sale_completed", listingId },
      { eventType: "status_changed", listingId },
    );
    return this.rows[index];
  }

  async deleteRow(listingId: string) {
    const existed = this.rows.some((row) => row.id === listingId);
    this.rows = this.rows.filter((row) => row.id !== listingId);
    this.owners = this.owners.filter((owner) => owner.listing_id !== listingId);
    return existed;
  }
}

describe("mapping et propriétaires Listings", () => {
  it.each([
    ["aucun", []],
    ["un", [owner1]],
    ["deux", [owner1, owner2]],
  ])("mappe un Listing avec %s propriétaire", (_label, ownerContactIds) => {
    const draft = listingDraft();
    const row = rowFromDraft("listing-1", draft);
    const owners = [...ownerContactIds, ...ownerContactIds].map((contactId) => ({ listing_id: row.id, contact_id: contactId, role: "owner" as const }));
    expect(mapListing(row, owners).ownerContactIds).toEqual(ownerContactIds);
  });

  it("convertit les montants SQL texte en nombres TypeScript", () => {
    const row = rowFromDraft("listing-1", listingDraft());
    row.asking_price = "799000.00";
    row.monthly_rent = "2450.00";
    row.sold_price = "775000.00";
    row.notary_date = "2026-09-15";
    row.collaborating_broker_name = "Jean Tremblay";
    expect(mapListing(row, [])).toMatchObject({
      askingPrice: 799000,
      monthlyRent: 2450,
      soldPrice: 775000,
      notaryDate: "2026-09-15",
      collaboratingBrokerName: "Jean Tremblay",
    });
  });
});

describe("CRUD Listings", () => {
  it("crée et récupère une Vente active avec propriétaires dédupliqués", async () => {
    const repository = new MemoryListingRepository();
    const service = createListingsService(repository);
    const created = await service.createListing(listingDraft({
      purpose: "sale",
      askingPrice: 799000,
      monthlyRent: null,
      status: "active",
      ownerContactIds: [owner1, owner2, owner1],
    }));

    expect(created).toMatchObject({ purpose: "sale", askingPrice: 799000, monthlyRent: null, status: "active" });
    expect(created.ownerContactIds).toEqual([owner1, owner2]);
    expect(await service.getListing(created.id)).toEqual(created);
  });

  it("crée une Location, modifie ses propriétaires puis la marque Louée", async () => {
    const repository = new MemoryListingRepository();
    const service = createListingsService(repository);
    const created = await service.createListing(listingDraft({
      purpose: "rental",
      askingPrice: null,
      monthlyRent: 2450,
      status: "active",
      ownerContactIds: [owner1, owner2],
    }));
    const updated = await service.updateListing(created.id, {
      status: "rented",
      ownerContactIds: [owner1, owner3],
    });

    expect(updated).toMatchObject({ purpose: "rental", monthlyRent: 2450, status: "rented" });
    expect(updated.ownerContactIds).toEqual([owner1, owner3]);
    expect(repository.contacts).toEqual(new Set([owner1, owner2, owner3]));
  });

  it("refuse atomiquement un propriétaire inexistant", async () => {
    const repository = new MemoryListingRepository();
    const service = createListingsService(repository);
    await expect(service.createListing(listingDraft({ ownerContactIds: [missingOwner] }))).rejects.toMatchObject({ code: "invalid_owner" });
    expect(repository.rows).toEqual([]);
    expect(repository.owners).toEqual([]);
  });

  it("refuse atomiquement une modification avec un propriétaire inexistant", async () => {
    const repository = new MemoryListingRepository();
    const service = createListingsService(repository);
    const created = await service.createListing(listingDraft({
      status: "active",
      ownerContactIds: [owner1, owner2],
    }));

    await expect(service.updateListing(created.id, {
      ownerContactIds: [owner1, missingOwner],
    })).rejects.toMatchObject({ code: "invalid_owner" });

    expect(await service.getListing(created.id)).toMatchObject({
      status: "active",
      ownerContactIds: [owner1, owner2],
    });
  });

  it("finalise atomiquement une vente et conserve le prix demandé", async () => {
    const repository = new MemoryListingRepository();
    const service = createListingsService(repository);
    const created = await service.createListing(listingDraft({
      status: "active",
      askingPrice: 569000,
      ownerContactIds: [owner1],
    }));
    const sold = await service.completeListingSale(created.id, {
      soldPrice: 550000,
      notaryDate: "2026-09-15",
      collaboratingBrokerName: "Jean Tremblay",
      noCollaboratingBroker: false,
    }, "maxime");

    expect(sold).toMatchObject({
      status: "sold",
      askingPrice: 569000,
      soldPrice: 550000,
      notaryDate: "2026-09-15",
      collaboratingBrokerName: "Jean Tremblay",
    });
    expect(sold.ownerContactIds).toEqual([owner1]);
    expect(repository.activity.map((entry) => entry.eventType)).toEqual(["sale_completed", "status_changed"]);
  });

  it("accepte une date future et l’absence explicite de courtier collaborateur", async () => {
    const repository = new MemoryListingRepository();
    const service = createListingsService(repository);
    const created = await service.createListing(listingDraft({ status: "conditional" }));
    const sold = await service.completeListingSale(created.id, {
      soldPrice: 500000,
      notaryDate: "2030-01-15",
      collaboratingBrokerName: "Texte ignoré",
      noCollaboratingBroker: true,
    });
    expect(sold).toMatchObject({ notaryDate: "2030-01-15", collaboratingBrokerName: "" });
  });

  it("refuse la finalisation d’une Location et une seconde finalisation", async () => {
    const repository = new MemoryListingRepository();
    const service = createListingsService(repository);
    const rental = await service.createListing(listingDraft({ purpose: "rental", status: "active" }));
    const completion = {
      soldPrice: 500000,
      notaryDate: "2026-09-15",
      collaboratingBrokerName: "Jean Tremblay",
      noCollaboratingBroker: false,
    };
    await expect(service.completeListingSale(rental.id, completion)).rejects.toMatchObject({ code: "invalid_purpose" });

    const sale = await service.createListing(listingDraft({ status: "active" }));
    await service.completeListingSale(sale.id, completion);
    await expect(service.completeListingSale(sale.id, completion)).rejects.toMatchObject({ code: "already_sold" });
  });

  it("refuse prix nul, négatif, non numérique, date invalide et collaborateur implicite", async () => {
    const repository = new MemoryListingRepository();
    const service = createListingsService(repository);
    const created = await service.createListing(listingDraft({ status: "active" }));
    const base = {
      soldPrice: 550000,
      notaryDate: "2026-09-15",
      collaboratingBrokerName: "Jean Tremblay",
      noCollaboratingBroker: false,
    };
    for (const invalid of [
      { ...base, soldPrice: 0 },
      { ...base, soldPrice: -1 },
      { ...base, soldPrice: Number.NaN },
      { ...base, notaryDate: "2026-02-30" },
      { ...base, collaboratingBrokerName: "" },
    ]) {
      await expect(service.completeListingSale(created.id, invalid)).rejects.toMatchObject({ code: "invalid_sale_completion" });
    }
    expect((await service.getListing(created.id)).status).toBe("active");
  });

  it("refuse le contournement générique vers sold mais autorise la création historique", async () => {
    const repository = new MemoryListingRepository();
    const service = createListingsService(repository);
    const active = await service.createListing(listingDraft({ status: "active" }));
    await expect(service.updateListing(active.id, { status: "sold" }))
      .rejects.toMatchObject({ code: "invalid_listing" });
    expect((await service.getListing(active.id)).status).toBe("active");
    expect((await service.createListing(listingDraft({ status: "sold" }))).status).toBe("sold");
  });

  it("refuse un numéro Centris déjà utilisé avec une erreur métier", async () => {
    const repository = new MemoryListingRepository();
    const service = createListingsService(repository);
    await service.createListing(listingDraft({ centrisNumber: "12 345 678" }));

    await expect(service.createListing(listingDraft({ centrisNumber: "12345678" })))
      .rejects.toMatchObject({ code: "duplicate_centris" });
    expect(repository.rows).toHaveLength(1);
  });

  it("supprime le Listing et ses relations sans supprimer les contacts", async () => {
    const repository = new MemoryListingRepository();
    const service = createListingsService(repository);
    const created = await service.createListing(listingDraft({ ownerContactIds: [owner1, owner2] }));
    await service.deleteListing(created.id);
    expect(repository.rows).toEqual([]);
    expect(repository.owners).toEqual([]);
    expect(repository.contacts).toEqual(new Set([owner1, owner2, owner3]));
  });
});

describe("filtres et protection N+1", () => {
  it("combine courtier, statut et finalité dans toutes les combinaisons demandées", async () => {
    const repository = new MemoryListingRepository();
    repository.rows = [
      rowFromDraft("listing-1", listingDraft({ broker: "maxime", status: "active", purpose: "rental" })),
      rowFromDraft("listing-2", listingDraft({ broker: "maxime", status: "sold", purpose: "sale" })),
      rowFromDraft("listing-3", listingDraft({ broker: "france", status: "active", purpose: "sale" })),
      rowFromDraft("listing-4", listingDraft({ broker: "sandrine", status: "rented", purpose: "rental" })),
    ];
    const service = createListingsService(repository);
    const ids = async (filters: ListingFilters) => (await service.listListings(filters)).map((listing) => listing.id);

    expect(await ids({ broker: "maxime" })).toEqual(["listing-1", "listing-2"]);
    expect(await ids({ status: "active" })).toEqual(["listing-1", "listing-3"]);
    expect(await ids({ purpose: "rental" })).toEqual(["listing-1", "listing-4"]);
    expect(await ids({ broker: "maxime", status: "active" })).toEqual(["listing-1"]);
    expect(await ids({ broker: "maxime", purpose: "rental" })).toEqual(["listing-1"]);
    expect(await ids({ status: "active", purpose: "rental" })).toEqual(["listing-1"]);
    expect(await ids({ broker: "maxime", status: "active", purpose: "rental" })).toEqual(["listing-1"]);
  });

  it("charge 100 propriétaires en une seule requête et borne les lots plus volumineux", async () => {
    for (const [count, expectedCalls] of [[100, 1], [500, 4], [1000, 7]] as const) {
      const loadBatch = vi.fn(async (ids: ReadonlyArray<string>) => ids.map((id) => ({ listing_id: id, contact_id: owner1, role: "owner" as const })));
      const ids = Array.from({ length: count }, (_, index) => `listing-${index}`);
      const rows = await loadListingOwnerRowsInBatches(ids, loadBatch);
      expect(rows).toHaveLength(count);
      expect(loadBatch).toHaveBeenCalledTimes(expectedCalls);
      expect(Math.max(...loadBatch.mock.calls.map(([batch]) => batch.length))).toBeLessThanOrEqual(LISTING_OWNER_BATCH_SIZE);
    }
  });
});
