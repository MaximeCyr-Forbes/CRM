"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-context";
import type { Listing, ListingDraft } from "./data/listing-types";
import type { ListingUpdate } from "./lib/listings/server-service";

type ListingsContextValue = {
  listings: ReadonlyArray<Listing>;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  retry: () => Promise<void>;
  createListing: (draft: ListingDraft) => Promise<Listing>;
  updateListing: (listingId: string, values: ListingUpdate) => Promise<Listing>;
  deleteListing: (listingId: string) => Promise<void>;
};

const ListingsContext = createContext<ListingsContextValue | null>(null);

function logDevelopmentWarning(error: unknown) {
  if (process.env.NODE_ENV !== "production") console.warn(error);
}

async function listingRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok || payload?.data === undefined) {
    throw new Error(payload?.error ?? "Opération Listings refusée.");
  }
  return payload.data;
}

export function ListingsProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [listings, setListings] = useState<ReadonlyArray<Listing>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadListings = useCallback(async () => {
    if (status !== "authenticated") {
      setListings([]);
      setIsLoading(status === "loading");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setListings(await listingRequest<Listing[]>("/api/listings", { cache: "no-store" }));
    } catch (caughtError) {
      logDevelopmentWarning(caughtError);
      setError("Les Listings ne peuvent pas être chargés pour le moment.");
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => { void loadListings(); }, [loadListings]);

  const runWrite = useCallback(async <T,>(operation: () => Promise<T>) => {
    setPendingWrites((current) => current + 1);
    setError(null);
    try {
      return await operation();
    } catch (caughtError) {
      logDevelopmentWarning(caughtError);
      setError(caughtError instanceof Error ? caughtError.message : "Opération Listings impossible.");
      throw caughtError;
    } finally {
      setPendingWrites((current) => Math.max(0, current - 1));
    }
  }, []);

  const replaceListing = useCallback((listing: Listing) => {
    setListings((current) => [listing, ...current.filter((item) => item.id !== listing.id)]);
    return listing;
  }, []);

  const create = useCallback((draft: ListingDraft) => runWrite(async () => {
    const listing = await listingRequest<Listing>("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft }),
    });
    return replaceListing(listing);
  }), [replaceListing, runWrite]);

  const update = useCallback((listingId: string, values: ListingUpdate) => runWrite(async () => {
    const listing = await listingRequest<Listing>(`/api/listings/${encodeURIComponent(listingId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    });
    return replaceListing(listing);
  }), [replaceListing, runWrite]);

  const remove = useCallback((listingId: string) => runWrite(async () => {
    await listingRequest<{ listingId: string }>(`/api/listings/${encodeURIComponent(listingId)}`, {
      method: "DELETE",
    });
    setListings((current) => current.filter((listing) => listing.id !== listingId));
  }), [runWrite]);

  const value = useMemo<ListingsContextValue>(() => ({
    listings,
    isLoading,
    isSaving: pendingWrites > 0,
    error,
    retry: loadListings,
    createListing: create,
    updateListing: update,
    deleteListing: remove,
  }), [listings, isLoading, pendingWrites, error, loadListings, create, update, remove]);

  return <ListingsContext.Provider value={value}>{children}</ListingsContext.Provider>;
}

export function useListings() {
  const context = useContext(ListingsContext);
  if (!context) throw new Error("useListings doit être utilisé dans ListingsProvider");
  return context;
}
