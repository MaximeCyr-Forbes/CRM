"use client";

import { useCallback, useEffect, useState } from "react";
import type { ListingReportData } from "../../data/listing-types";

export function useListingReport(listingId: string) {
  const [data, setData] = useState<ListingReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true); setError(null); setNotFound(false);
    try {
      const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}/report`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { data?: ListingReportData; error?: string } | null;
      if (response.status === 404) { setNotFound(true); return; }
      if (!response.ok || !payload?.data) throw new Error(payload?.error ?? "Rapport indisponible.");
      setData(payload.data);
    } catch { setError("Certaines données du rapport sont temporairement indisponibles."); }
    finally { setIsLoading(false); }
  }, [listingId]);

  useEffect(() => { void load(); }, [load]);
  return { data, isLoading, error, notFound, retry: load };
}
