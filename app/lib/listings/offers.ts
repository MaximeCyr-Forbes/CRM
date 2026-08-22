import type {
  ListingAcceptedPaInput,
  ListingBroker,
  ListingOffer,
  ListingOfferDraft,
  ListingOfferStatus,
  ListingPurpose,
  ListingTransactionLink,
} from "../../data/listing-types";
import { LISTING_OFFER_STATUSES } from "../../data/listing-types";
import { getSupabaseAdmin } from "../supabase/server";
import { parseListingAcceptedPaInput } from "./accepted-pa";
import { ListingServiceError } from "./persistence";

export type ListingOfferRow = {
  id: string;
  listing_id: string;
  purpose: ListingPurpose;
  offer_date: string;
  amount: number | string;
  status: ListingOfferStatus;
  buyer_names: string;
  collaborating_broker_name: string;
  collaborating_broker_agency: string;
  notes: string;
  accepted_at: string | null;
  created_by: ListingBroker | null;
  created_at: string;
  updated_at: string;
};

type LinkRow = {
  listing_id: string;
  offer_id: string;
  transaction_id: string;
  created_at: string;
};

type LinkedTransactionRow = {
  id: string;
  status: string;
  price: number | string | null;
  promise_date: string | null;
  broker: ListingBroker;
};

export type ListingOffersRepository = {
  listOfferRows: (listingId: string) => Promise<ListingOfferRow[]>;
  createOfferRow: (listingId: string, draft: ListingOfferDraft, actor: ListingBroker | null) => Promise<ListingOfferRow>;
  updateOfferRow: (listingId: string, offerId: string, draft: ListingOfferDraft, actor: ListingBroker | null) => Promise<ListingOfferRow>;
  deleteOfferRow: (listingId: string, offerId: string, actor: ListingBroker | null) => Promise<void>;
  getListingPurpose: (listingId: string) => Promise<ListingPurpose | null>;
  getLinkRow: (listingId: string) => Promise<LinkRow | null>;
  getTransactionRow: (transactionId: string) => Promise<LinkedTransactionRow | null>;
  createTransactionLink: (listingId: string, offerId: string, actor: ListingBroker | null) => Promise<string>;
};

export function mapListingOffer(row: ListingOfferRow): ListingOffer {
  return {
    id: row.id,
    listingId: row.listing_id,
    purpose: row.purpose,
    offerDate: row.offer_date,
    amount: Number(row.amount),
    status: row.status,
    buyerNames: row.buyer_names,
    collaboratingBrokerName: row.collaborating_broker_name,
    collaboratingBrokerAgency: row.collaborating_broker_agency,
    notes: row.notes,
    acceptedAt: row.accepted_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseListingOfferDraft(value: unknown): ListingOfferDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.offerDate !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(data.offerDate)
    || typeof data.amount !== "number"
    || !Number.isFinite(data.amount)
    || data.amount < 0
    || typeof data.status !== "string"
    || !LISTING_OFFER_STATUSES.includes(data.status as ListingOfferStatus)
    || typeof data.buyerNames !== "string"
    || typeof data.collaboratingBrokerName !== "string"
    || typeof data.collaboratingBrokerAgency !== "string"
    || typeof data.notes !== "string"
  ) return null;
  return {
    offerDate: data.offerDate,
    amount: data.amount,
    status: data.status as ListingOfferStatus,
    buyerNames: data.buyerNames.trim(),
    collaboratingBrokerName: data.collaboratingBrokerName.trim(),
    collaboratingBrokerAgency: data.collaboratingBrokerAgency.trim(),
    notes: data.notes.trim(),
  };
}

function rpcRow<T>(data: unknown, message: string) {
  const row = (Array.isArray(data) ? data[0] : data) as T | null;
  if (!row) throw new ListingServiceError("not_found", message);
  return row;
}

function mapOfferPersistenceError(error: unknown): never {
  const technical = error as { message?: string; details?: string };
  const message = `${technical.message ?? ""} ${technical.details ?? ""}`;
  if (/offre liée à une transaction/i.test(message)) {
    throw new ListingServiceError("offer_linked", "Cette offre est liée à une transaction et ne peut pas être supprimée.");
  }
  if (/possède déjà une transaction/i.test(message)) {
    throw new ListingServiceError("listing_already_linked", "Une transaction existe déjà pour ce Listing.");
  }
  if (/offre introuvable|listing introuvable/i.test(message)) {
    throw new ListingServiceError("not_found", "Offre ou Listing introuvable.");
  }
  if (/seule une offre de vente|doit être acceptée/i.test(message)) {
    throw new ListingServiceError("invalid_offer", technical.message ?? "Cette offre ne peut pas créer de transaction.");
  }
  throw error;
}

export function createSupabaseListingOffersRepository(): ListingOffersRepository {
  const rpcOffer = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await getSupabaseAdmin().rpc(name, args);
    if (error) mapOfferPersistenceError(error);
    return rpcRow<ListingOfferRow>(data, "Offre introuvable.");
  };
  return {
    async listOfferRows(listingId) {
      const { data, error } = await getSupabaseAdmin().from("listing_offers").select("*")
        .eq("listing_id", listingId).order("offer_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ListingOfferRow[];
    },
    createOfferRow: (listingId, draft, actor) => rpcOffer("create_listing_offer", { p_listing_id: listingId, p_values: draft, p_actor: actor }),
    updateOfferRow: (listingId, offerId, draft, actor) => rpcOffer("update_listing_offer", { p_listing_id: listingId, p_offer_id: offerId, p_values: draft, p_actor: actor }),
    async deleteOfferRow(listingId, offerId, actor) {
      const { error } = await getSupabaseAdmin().rpc("delete_listing_offer", { p_listing_id: listingId, p_offer_id: offerId, p_actor: actor });
      if (error) mapOfferPersistenceError(error);
    },
    async getListingPurpose(listingId) {
      const { data, error } = await getSupabaseAdmin().from("listings")
        .select("purpose").eq("id", listingId).maybeSingle();
      if (error) throw error;
      return (data?.purpose as ListingPurpose | undefined) ?? null;
    },
    async getLinkRow(listingId) {
      const { data, error } = await getSupabaseAdmin().from("listing_transaction_links").select("*")
        .eq("listing_id", listingId).maybeSingle();
      if (error) throw error;
      return data as LinkRow | null;
    },
    async getTransactionRow(transactionId) {
      const { data, error } = await getSupabaseAdmin().from("transactions")
        .select("id, status, price, promise_date, broker").eq("id", transactionId).maybeSingle();
      if (error) throw error;
      return data as LinkedTransactionRow | null;
    },
    async createTransactionLink(listingId, offerId, actor) {
      const { data, error } = await getSupabaseAdmin().rpc("create_transaction_from_listing_offer", {
        p_listing_id: listingId, p_offer_id: offerId, p_actor: actor,
      });
      if (error) mapOfferPersistenceError(error);
      if (typeof data !== "string") throw new Error("La transaction créée est introuvable.");
      return data;
    },
  };
}

export function createListingOffersService(repository: ListingOffersRepository) {
  const draft = (value: unknown) => {
    const parsed = parseListingOfferDraft(value);
    if (!parsed) throw new ListingServiceError("invalid_offer", "Offre invalide.");
    return parsed;
  };
  const link = async (listingId: string): Promise<ListingTransactionLink | null> => {
    const row = await repository.getLinkRow(listingId);
    if (!row) return null;
    const transaction = await repository.getTransactionRow(row.transaction_id);
    if (!transaction) return null;
    return {
      listingId: row.listing_id,
      offerId: row.offer_id,
      transactionId: row.transaction_id,
      createdAt: row.created_at,
      transaction: {
        status: transaction.status,
        price: transaction.price === null ? null : Number(transaction.price),
        promiseDate: transaction.promise_date,
        broker: transaction.broker,
      },
    };
  };
  const createTransaction = async (
    listingId: string,
    offerId: string,
    actor: ListingBroker | null,
  ) => {
    const existing = await link(listingId);
    if (existing) return existing;
    try {
      await repository.createTransactionLink(listingId, offerId, actor);
    } catch (error) {
      if (error instanceof ListingServiceError && error.code === "listing_already_linked") {
        const concurrentlyCreated = await link(listingId);
        if (concurrentlyCreated) return concurrentlyCreated;
      }
      throw error;
    }
    const created = await link(listingId);
    if (!created) throw new Error("Le lien vers la transaction est introuvable.");
    return created;
  };
  return {
    async listListingOffers(listingId: string) { return (await repository.listOfferRows(listingId)).map(mapListingOffer); },
    async createListingOffer(listingId: string, value: unknown, actor: ListingBroker | null) { return mapListingOffer(await repository.createOfferRow(listingId, draft(value), actor)); },
    async updateListingOffer(listingId: string, offerId: string, value: unknown, actor: ListingBroker | null) { return mapListingOffer(await repository.updateOfferRow(listingId, offerId, draft(value), actor)); },
    deleteListingOffer: (listingId: string, offerId: string, actor: ListingBroker | null) => repository.deleteOfferRow(listingId, offerId, actor),
    getListingTransactionLink: link,
    createTransactionFromListingOffer: createTransaction,
    async acceptListingPurchaseAgreement(
      listingId: string,
      value: unknown,
      actor: ListingBroker | null,
    ) {
      const existing = await link(listingId);
      if (existing) return existing;

      const purpose = await repository.getListingPurpose(listingId);
      if (purpose === null) throw new ListingServiceError("not_found", "Listing introuvable.");
      if (purpose !== "sale") {
        throw new ListingServiceError(
          "invalid_purpose",
          "PA ACCEPTÉE est disponible uniquement pour un Listing de vente.",
        );
      }

      const input = parseListingAcceptedPaInput(value);
      if (!input) throw new ListingServiceError("invalid_offer", "Promesse d’achat invalide.");
      const acceptedOffers = (await repository.listOfferRows(listingId))
        .filter((offer) => offer.purpose === "sale" && offer.status === "accepted");
      let acceptedOffer = input.offerId
        ? acceptedOffers.find((offer) => offer.id === input.offerId) ?? null
        : null;

      if (input.offerId && !acceptedOffer) {
        throw new ListingServiceError("invalid_offer", "L’offre acceptée sélectionnée est introuvable.");
      }
      if (!acceptedOffer && acceptedOffers.length === 1) acceptedOffer = acceptedOffers[0];
      if (!acceptedOffer && acceptedOffers.length > 1) {
        throw new ListingServiceError(
          "multiple_accepted_offers",
          "Plusieurs offres acceptées existent. Choisissez celle à utiliser.",
        );
      }
      if (!acceptedOffer) {
        acceptedOffer = await repository.createOfferRow(listingId, {
          offerDate: input.offerDate,
          amount: input.amount,
          status: "accepted",
          buyerNames: input.buyerNames,
          collaboratingBrokerName: "",
          collaboratingBrokerAgency: "",
          notes: "",
        }, actor);
      }
      return createTransaction(listingId, acceptedOffer.id, actor);
    },
  };
}

const offersService = createListingOffersService(createSupabaseListingOffersRepository());
export const listListingOffers = (listingId: string) => offersService.listListingOffers(listingId);
export const createListingOffer = (listingId: string, value: unknown, actor: ListingBroker | null) => offersService.createListingOffer(listingId, value, actor);
export const updateListingOffer = (listingId: string, offerId: string, value: unknown, actor: ListingBroker | null) => offersService.updateListingOffer(listingId, offerId, value, actor);
export const deleteListingOffer = (listingId: string, offerId: string, actor: ListingBroker | null) => offersService.deleteListingOffer(listingId, offerId, actor);
export const getListingTransactionLink = (listingId: string) => offersService.getListingTransactionLink(listingId);
export const createTransactionFromListingOffer = (listingId: string, offerId: string, actor: ListingBroker | null) => offersService.createTransactionFromListingOffer(listingId, offerId, actor);
export const acceptListingPurchaseAgreement = (listingId: string, value: ListingAcceptedPaInput, actor: ListingBroker | null) => offersService.acceptListingPurchaseAgreement(listingId, value, actor);
