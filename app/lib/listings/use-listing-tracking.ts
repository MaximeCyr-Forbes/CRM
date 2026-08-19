"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useBroker } from "../../broker-context";
import type { ListingTrackingData, ListingVisitDraft } from "../../data/listing-types";

const emptyTracking: ListingTrackingData = { tasks: [], visits: [], activity: [], priceHistory: [] };

async function trackingRequest<T>(listingId: string, init?: RequestInit) {
  const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}/tracking`, init);
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok || payload?.data === undefined) throw new Error(payload?.error ?? "Opération de suivi refusée.");
  return payload.data;
}

export function useListingTracking(listingId: string) {
  const { selectedBroker } = useBroker();
  const actorBroker = selectedBroker?.toLowerCase() ?? null;
  const [data, setData] = useState<ListingTrackingData>(emptyTracking);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      setData(await trackingRequest<ListingTrackingData>(listingId, { cache: "no-store" }));
    } catch {
      setError("Le suivi de mise en marché est temporairement indisponible.");
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [listingId]);

  useEffect(() => { void load(); }, [load]);

  const write = useCallback(async (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => {
    setIsSaving(true);
    setError(null);
    try {
      await trackingRequest(listingId, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, actorBroker }),
      });
      await load(false);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Opération de suivi impossible.";
      setError(message);
      throw caughtError;
    } finally {
      setIsSaving(false);
    }
  }, [actorBroker, listingId, load]);

  return useMemo(() => ({
    data, isLoading, isSaving, error, retry: load,
    toggleTask: (taskId: string, completed: boolean) => write("PATCH", { action: "toggleTask", taskId, completed }),
    addTask: (title: string) => write("POST", { action: "addTask", title }),
    updateTask: (taskId: string, title: string) => write("PATCH", { action: "updateTask", taskId, title }),
    deleteTask: (taskId: string) => write("DELETE", { action: "deleteTask", taskId }),
    addVisit: (visit: ListingVisitDraft) => write("POST", { action: "addVisit", visit }),
    updateVisit: (visitId: string, visit: ListingVisitDraft) => write("PATCH", { action: "updateVisit", visitId, visit }),
    deleteVisit: (visitId: string) => write("DELETE", { action: "deleteVisit", visitId }),
  }), [data, error, isLoading, isSaving, load, write]);
}
