"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useBroker } from "../../broker-context";
import type { ListingOffer, ListingOfferDraft, ListingTransactionLink } from "../../data/listing-types";

type OffersData = { offers: ListingOffer[]; transactionLink: ListingTransactionLink | null };
const emptyData: OffersData = { offers: [], transactionLink: null };

async function offersRequest<T>(listingId: string, path = "", init?: RequestInit) {
  const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}/offers${path}`, init);
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok || payload?.data === undefined) throw new Error(payload?.error ?? "Opération sur l’offre refusée.");
  return payload.data;
}

export function useListingOffers(listingId: string, onChanged?: () => void | Promise<void>) {
  const { selectedBroker } = useBroker();
  const actorBroker = selectedBroker?.toLowerCase() ?? null;
  const [data, setData] = useState<OffersData>(emptyData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try { setData(await offersRequest<OffersData>(listingId, "", { cache: "no-store" })); }
    catch { setError("Les offres sont temporairement indisponibles."); }
    finally { if (showLoading) setIsLoading(false); }
  }, [listingId]);

  useEffect(() => { void load(); }, [load]);

  const write = useCallback(async <T,>(path: string, method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => {
    setIsSaving(true);
    setError(null);
    try {
      const result = await offersRequest<T>(listingId, path, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, actorBroker }),
      });
      await load(false);
      await onChanged?.();
      return result;
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Opération sur l’offre impossible.";
      setError(message);
      throw caughtError;
    } finally { setIsSaving(false); }
  }, [actorBroker, listingId, load, onChanged]);

  return useMemo(() => ({
    ...data, isLoading, isSaving, error, retry: load,
    createOffer: (offer: ListingOfferDraft) => write<ListingOffer>("", "POST", { offer }),
    updateOffer: (offerId: string, offer: ListingOfferDraft) => write<ListingOffer>(`/${encodeURIComponent(offerId)}`, "PATCH", { offer }),
    deleteOffer: (offerId: string) => write<{ offerId: string }>(`/${encodeURIComponent(offerId)}`, "DELETE", {}),
    createTransaction: (offerId: string) => write<ListingTransactionLink>(`/${encodeURIComponent(offerId)}`, "POST", { action: "createTransaction" }),
  }), [data, error, isLoading, isSaving, load, write]);
}
