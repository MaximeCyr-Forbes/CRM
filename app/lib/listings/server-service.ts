import type { Listing, ListingBroker, ListingDraft, ListingSaleCompletion } from "../../data/listing-types";
import {
  createSupabaseListingRepository,
  ListingServiceError,
  parseListingDraft,
  parseListingSaleCompletion,
  parseListingUpdate,
  type ListingFilters,
  type ListingOwnerRow,
  type ListingRepository,
  type ListingRow,
  type ListingUpdate,
} from "./persistence";

export type { ListingFilters, ListingRow, ListingUpdate } from "./persistence";
export { ListingServiceError } from "./persistence";

export function mapListing(row: ListingRow, ownerRows: ReadonlyArray<ListingOwnerRow>): Listing {
  return {
    id: row.id,
    civicNumber: row.civic_number ?? "",
    address: row.address ?? "",
    apartment: row.apartment ?? "",
    city: row.city ?? "",
    province: row.province ?? "",
    postalCode: row.postal_code ?? "",
    country: row.country ?? "",
    centrisNumber: row.centris_number ?? "",
    broker: row.broker,
    status: row.status,
    purpose: row.purpose,
    askingPrice: row.asking_price === null ? null : Number(row.asking_price),
    monthlyRent: row.monthly_rent === null ? null : Number(row.monthly_rent),
    soldPrice: row.sold_price == null ? null : Number(row.sold_price),
    notaryDate: row.notary_date ?? null,
    collaboratingBrokerName: row.collaborating_broker_name ?? "",
    propertyType: row.property_type,
    listingDate: row.listing_date,
    expirationDate: row.expiration_date,
    centrisUrl: row.centris_url ?? "",
    publicUrl: row.public_url ?? "",
    primaryImageUrl: row.primary_image_url ?? "",
    generalNotes: row.general_notes ?? "",
    ownerContactIds: [...new Set(ownerRows
      .filter((owner) => owner.listing_id === row.id && owner.role === "owner")
      .map((owner) => owner.contact_id))],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ownerRows(listingId: string, ownerContactIds: ReadonlyArray<string>): ListingOwnerRow[] {
  return [...new Set(ownerContactIds)].map((contactId) => ({
    listing_id: listingId,
    contact_id: contactId,
    role: "owner",
  }));
}

export function createListingsService(repository: ListingRepository) {
  return {
    async listListings(filters: ListingFilters = {}) {
      const rows = await repository.listRows(filters);
      if (rows.length === 0) return [];
      const owners = await repository.listOwnerRows(rows.map((row) => row.id));
      return rows.map((row) => mapListing(row, owners));
    },

    async getListing(listingId: string) {
      const row = await repository.getRow(listingId);
      if (!row) throw new ListingServiceError("not_found", "Listing introuvable.");
      const owners = await repository.listOwnerRows([listingId]);
      return mapListing(row, owners);
    },

    async createListing(input: ListingDraft, actor: ListingBroker | null = null) {
      const draft = parseListingDraft(input);
      if (!draft) throw new ListingServiceError("invalid_listing", "Listing invalide.");
      const row = await repository.createWithOwners(draft, actor);
      return mapListing(row, ownerRows(row.id, draft.ownerContactIds));
    },

    async updateListing(listingId: string, input: ListingUpdate, actor: ListingBroker | null = null) {
      const values = parseListingUpdate(input);
      if (!values) throw new ListingServiceError("invalid_listing", "Modification du Listing invalide.");
      if (values.status === "sold") {
        const current = await repository.getRow(listingId);
        if (!current) throw new ListingServiceError("not_found", "Listing introuvable.");
        if (current.status !== "sold") {
          throw new ListingServiceError(
            "invalid_listing",
            "Utilisez le bouton VENDU sur la fiche pour finaliser une vente.",
          );
        }
      }
      const row = await repository.updateWithOwners(listingId, values, actor);
      const owners = values.ownerContactIds === undefined
        ? await repository.listOwnerRows([listingId])
        : ownerRows(listingId, values.ownerContactIds);
      return mapListing(row, owners);
    },

    async completeListingSale(listingId: string, input: ListingSaleCompletion, actor: ListingBroker | null = null) {
      const values = parseListingSaleCompletion(input);
      if (!values) throw new ListingServiceError("invalid_sale_completion", "Finalisation de la vente invalide.");
      const current = await repository.getRow(listingId);
      if (!current) throw new ListingServiceError("not_found", "Listing introuvable.");
      if (current.purpose !== "sale") {
        throw new ListingServiceError("invalid_purpose", "Seul un Listing en vente peut être marqué comme vendu.");
      }
      if (current.status === "sold") {
        throw new ListingServiceError("already_sold", "Ce Listing est déjà marqué comme vendu.");
      }
      const row = await repository.completeSale(listingId, values, actor);
      const owners = await repository.listOwnerRows([listingId]);
      return mapListing(row, owners);
    },

    async deleteListing(listingId: string) {
      const deleted = await repository.deleteRow(listingId);
      if (!deleted) throw new ListingServiceError("not_found", "Listing introuvable.");
    },
  };
}

const defaultService = createListingsService(createSupabaseListingRepository());

export const listListings = (filters: ListingFilters = {}) => defaultService.listListings(filters);
export const getListing = (listingId: string) => defaultService.getListing(listingId);
export const createListing = (draft: ListingDraft, actor: ListingBroker | null = null) => defaultService.createListing(draft, actor);
export const updateListing = (listingId: string, values: ListingUpdate, actor: ListingBroker | null = null) => defaultService.updateListing(listingId, values, actor);
export const completeListingSale = (listingId: string, values: ListingSaleCompletion, actor: ListingBroker | null = null) => defaultService.completeListingSale(listingId, values, actor);
export const deleteListing = (listingId: string) => defaultService.deleteListing(listingId);
