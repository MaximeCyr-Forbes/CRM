import type {
  Listing,
  ListingBroker,
  ListingDraft,
  ListingPropertyType,
  ListingPurpose,
  ListingSaleCompletion,
  ListingStatus,
} from "../../data/listing-types";
import {
  LISTING_BROKERS,
  LISTING_PROPERTY_TYPES,
  LISTING_PURPOSES,
  LISTING_STATUSES,
} from "../../data/listing-types";
import { getSupabaseAdmin } from "../supabase/server";

export type ListingRow = {
  id: string;
  civic_number: string;
  address: string;
  apartment: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  centris_number: string;
  broker: ListingBroker;
  status: ListingStatus;
  purpose: ListingPurpose;
  asking_price: number | string | null;
  monthly_rent: number | string | null;
  sold_price: number | string | null;
  notary_date: string | null;
  collaborating_broker_name: string;
  property_type: ListingPropertyType;
  listing_date: string | null;
  expiration_date: string | null;
  centris_url: string;
  public_url: string;
  primary_image_url: string;
  general_notes: string;
  created_at: string;
  updated_at: string;
};

export type ListingOwnerRow = {
  listing_id: string;
  contact_id: string;
  role: "owner";
};

export type ListingFilters = Partial<Pick<Listing, "broker" | "status" | "purpose">>;
export type ListingUpdate = Partial<ListingDraft>;

export type ListingRepository = {
  listRows: (filters: ListingFilters) => Promise<ListingRow[]>;
  getRow: (listingId: string) => Promise<ListingRow | null>;
  listOwnerRows: (listingIds: ReadonlyArray<string>) => Promise<ListingOwnerRow[]>;
  createWithOwners: (draft: ListingDraft, actor: ListingBroker | null) => Promise<ListingRow>;
  updateWithOwners: (listingId: string, values: ListingUpdate, actor: ListingBroker | null) => Promise<ListingRow>;
  completeSale: (listingId: string, values: ListingSaleCompletion, actor: ListingBroker | null) => Promise<ListingRow>;
  deleteRow: (listingId: string) => Promise<boolean>;
};

export type ListingServiceErrorCode =
  | "duplicate_centris"
  | "invalid_owner"
  | "invalid_listing"
  | "invalid_sale_completion"
  | "invalid_purpose"
  | "already_sold"
  | "invalid_offer"
  | "multiple_accepted_offers"
  | "offer_linked"
  | "listing_already_linked"
  | "not_found";

export class ListingServiceError extends Error {
  constructor(
    public readonly code: ListingServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ListingServiceError";
  }
}

export const LISTING_OWNER_BATCH_SIZE = 150;

export function isListingBroker(value: unknown): value is ListingBroker {
  return typeof value === "string" && LISTING_BROKERS.includes(value as ListingBroker);
}

export function isListingStatus(value: unknown): value is ListingStatus {
  return typeof value === "string" && LISTING_STATUSES.includes(value as ListingStatus);
}

export function isListingPurpose(value: unknown): value is ListingPurpose {
  return typeof value === "string" && LISTING_PURPOSES.includes(value as ListingPurpose);
}

export function isListingPropertyType(value: unknown): value is ListingPropertyType {
  return typeof value === "string" && LISTING_PROPERTY_TYPES.includes(value as ListingPropertyType);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isNullableAmount(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isNullableDate(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function parseListingSaleCompletion(value: unknown): ListingSaleCompletion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.soldPrice !== "number"
    || !Number.isFinite(data.soldPrice)
    || data.soldPrice <= 0
    || !isValidDate(data.notaryDate)
    || typeof data.collaboratingBrokerName !== "string"
    || typeof data.noCollaboratingBroker !== "boolean"
  ) return null;
  const collaboratingBrokerName = data.collaboratingBrokerName.trim();
  if (!data.noCollaboratingBroker && !collaboratingBrokerName) return null;
  if (collaboratingBrokerName.length > 240) return null;
  return {
    soldPrice: data.soldPrice,
    notaryDate: data.notaryDate,
    collaboratingBrokerName: data.noCollaboratingBroker ? "" : collaboratingBrokerName,
    noCollaboratingBroker: data.noCollaboratingBroker,
  };
}

function uniqueOwnerIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(isUuid)) return null;
  return [...new Set(value)];
}

const listingTextFields = [
  "civicNumber",
  "address",
  "apartment",
  "city",
  "province",
  "postalCode",
  "country",
  "centrisNumber",
  "centrisUrl",
  "publicUrl",
  "primaryImageUrl",
  "generalNotes",
] as const;

function hasValidDateRange(listingDate: string | null | undefined, expirationDate: string | null | undefined) {
  return !listingDate || !expirationDate || expirationDate >= listingDate;
}

export function parseListingDraft(value: unknown): ListingDraft | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (
    !listingTextFields.every((field) => typeof data[field] === "string")
    || !isListingBroker(data.broker)
    || !isListingStatus(data.status)
    || !isListingPurpose(data.purpose)
    || !isListingPropertyType(data.propertyType)
    || !isNullableAmount(data.askingPrice)
    || !isNullableAmount(data.monthlyRent)
    || !isNullableDate(data.listingDate)
    || !isNullableDate(data.expirationDate)
  ) return null;
  const ownerContactIds = uniqueOwnerIds(data.ownerContactIds);
  if (!ownerContactIds || !hasValidDateRange(data.listingDate, data.expirationDate)) return null;

  const text = (field: (typeof listingTextFields)[number]) => (data[field] as string).trim();

  return {
    civicNumber: text("civicNumber"),
    address: text("address"),
    apartment: text("apartment"),
    city: text("city"),
    province: text("province"),
    postalCode: text("postalCode"),
    country: text("country"),
    centrisNumber: text("centrisNumber"),
    broker: data.broker,
    status: data.status,
    purpose: data.purpose,
    askingPrice: data.askingPrice,
    monthlyRent: data.monthlyRent,
    propertyType: data.propertyType,
    listingDate: data.listingDate,
    expirationDate: data.expirationDate,
    centrisUrl: text("centrisUrl"),
    publicUrl: text("publicUrl"),
    primaryImageUrl: text("primaryImageUrl"),
    generalNotes: text("generalNotes"),
    ownerContactIds,
  };
}

export function parseListingUpdate(value: unknown): ListingUpdate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const allowed = new Set<string>([
    ...listingTextFields,
    "broker",
    "status",
    "purpose",
    "askingPrice",
    "monthlyRent",
    "propertyType",
    "listingDate",
    "expirationDate",
    "ownerContactIds",
  ]);
  if (Object.keys(data).length === 0 || Object.keys(data).some((key) => !allowed.has(key))) return null;

  const result: ListingUpdate = {};
  for (const field of listingTextFields) {
    const fieldValue = data[field];
    if (fieldValue !== undefined) {
      if (typeof fieldValue !== "string") return null;
      result[field] = fieldValue.trim();
    }
  }
  if (data.broker !== undefined) {
    if (!isListingBroker(data.broker)) return null;
    result.broker = data.broker;
  }
  if (data.status !== undefined) {
    if (!isListingStatus(data.status)) return null;
    result.status = data.status;
  }
  if (data.purpose !== undefined) {
    if (!isListingPurpose(data.purpose)) return null;
    result.purpose = data.purpose;
  }
  if (data.propertyType !== undefined) {
    if (!isListingPropertyType(data.propertyType)) return null;
    result.propertyType = data.propertyType;
  }
  if (data.askingPrice !== undefined) {
    if (!isNullableAmount(data.askingPrice)) return null;
    result.askingPrice = data.askingPrice;
  }
  if (data.monthlyRent !== undefined) {
    if (!isNullableAmount(data.monthlyRent)) return null;
    result.monthlyRent = data.monthlyRent;
  }
  if (data.listingDate !== undefined) {
    if (!isNullableDate(data.listingDate)) return null;
    result.listingDate = data.listingDate;
  }
  if (data.expirationDate !== undefined) {
    if (!isNullableDate(data.expirationDate)) return null;
    result.expirationDate = data.expirationDate;
  }
  if (data.ownerContactIds !== undefined) {
    const ownerContactIds = uniqueOwnerIds(data.ownerContactIds);
    if (!ownerContactIds) return null;
    result.ownerContactIds = ownerContactIds;
  }
  if (!hasValidDateRange(result.listingDate, result.expirationDate)) return null;
  return result;
}

function rpcValues(values: ListingDraft | ListingUpdate, actor: ListingBroker | null) {
  const { ownerContactIds: _ownerContactIds, ...listingValues } = values;
  return { ...listingValues, actorBroker: actor };
}

function throwMappedPersistenceError(error: unknown): never {
  const technical = error as { code?: string; message?: string; details?: string };
  const message = `${technical.message ?? ""} ${technical.details ?? ""}`;
  if (technical.code === "23505" || /listings_centris_number_unique_idx/i.test(message)) {
    throw new ListingServiceError("duplicate_centris", "Un Listing avec ce numéro Centris existe déjà.");
  }
  if (technical.code === "23503" || /propriétaire invalide/i.test(message)) {
    throw new ListingServiceError("invalid_owner", "Propriétaire invalide.");
  }
  if (/listing introuvable/i.test(message)) {
    throw new ListingServiceError("not_found", "Listing introuvable.");
  }
  if (/seul un listing en vente/i.test(message)) {
    throw new ListingServiceError("invalid_purpose", "Seul un Listing en vente peut être marqué comme vendu.");
  }
  if (/déjà marqué comme vendu|déjà vendu/i.test(message)) {
    throw new ListingServiceError("already_sold", "Ce Listing est déjà marqué comme vendu.");
  }
  if (/prix vendu invalide|date du notaire|courtier collaborateur/i.test(message)) {
    throw new ListingServiceError("invalid_sale_completion", "Finalisation de la vente invalide.");
  }
  throw error;
}

export async function loadListingOwnerRowsInBatches(
  listingIds: ReadonlyArray<string>,
  loadBatch: (listingIds: ReadonlyArray<string>) => Promise<ListingOwnerRow[]>,
  batchSize = LISTING_OWNER_BATCH_SIZE,
) {
  const uniqueIds = [...new Set(listingIds)];
  if (uniqueIds.length === 0) return [];
  const batches: string[][] = [];
  for (let index = 0; index < uniqueIds.length; index += batchSize) {
    batches.push(uniqueIds.slice(index, index + batchSize));
  }
  return (await Promise.all(batches.map(loadBatch))).flat();
}

export function createSupabaseListingRepository(): ListingRepository {
  return {
    async listRows(filters) {
      let query = getSupabaseAdmin().from("listings").select("*");
      if (filters.broker) query = query.eq("broker", filters.broker);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.purpose) query = query.eq("purpose", filters.purpose);
      const { data, error } = await query.order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ListingRow[];
    },

    async getRow(listingId) {
      const { data, error } = await getSupabaseAdmin()
        .from("listings")
        .select("*")
        .eq("id", listingId)
        .maybeSingle();
      if (error) throw error;
      return data as ListingRow | null;
    },

    async listOwnerRows(listingIds) {
      const admin = getSupabaseAdmin();
      return loadListingOwnerRowsInBatches(listingIds, async (batch) => {
        const { data, error } = await admin
          .from("listing_contacts")
          .select("listing_id, contact_id, role")
          .in("listing_id", [...batch])
          .eq("role", "owner");
        if (error) throw error;
        return (data ?? []) as ListingOwnerRow[];
      });
    },

    async createWithOwners(draft, actor) {
      const { data, error } = await getSupabaseAdmin().rpc("create_listing_with_owners", {
        p_values: rpcValues(draft, actor),
        p_owner_contact_ids: draft.ownerContactIds,
      });
      if (error) throwMappedPersistenceError(error);
      const row = (Array.isArray(data) ? data[0] : data) as ListingRow | null;
      if (!row) throw new Error("Le Listing créé est introuvable.");
      return row;
    },

    async updateWithOwners(listingId, values, actor) {
      const { data, error } = await getSupabaseAdmin().rpc("update_listing_with_owners", {
        p_listing_id: listingId,
        p_values: rpcValues(values, actor),
        p_owner_contact_ids: values.ownerContactIds ?? null,
      });
      if (error) throwMappedPersistenceError(error);
      const row = (Array.isArray(data) ? data[0] : data) as ListingRow | null;
      if (!row) throw new ListingServiceError("not_found", "Listing introuvable.");
      return row;
    },

    async completeSale(listingId, values, actor) {
      const { data, error } = await getSupabaseAdmin().rpc("complete_listing_sale", {
        p_listing_id: listingId,
        p_sold_price: values.soldPrice,
        p_notary_date: values.notaryDate,
        p_collaborating_broker_name: values.collaboratingBrokerName,
        p_no_collaborating_broker: values.noCollaboratingBroker,
        p_actor_broker: actor,
      });
      if (error) throwMappedPersistenceError(error);
      const row = (Array.isArray(data) ? data[0] : data) as ListingRow | null;
      if (!row) throw new ListingServiceError("not_found", "Listing introuvable.");
      return row;
    },

    async deleteRow(listingId) {
      const { data, error } = await getSupabaseAdmin()
        .from("listings")
        .delete()
        .eq("id", listingId)
        .select("id");
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  };
}
