"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ContactFollowUpCompletion } from "../../data/contact-follow-up-types";
export function useFollowUpHistory(contactId: string, version?: string) {
  const [history, setHistory] = useState<ContactFollowUpCompletion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const response = await fetch(`/api/contacts/${contactId}/follow-up-completions`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error("Historique des suivis indisponible.");
      if (sequence.current === request) { setHistory(payload.history); setError(null); }
    } catch { if (sequence.current === request) setError("Historique des suivis indisponible. Actualisez la fiche."); }
  }, [contactId]);
  useEffect(() => {
    setHistory([]); void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { sequence.current++; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load, version]);
  return { history, historyError: error, refreshHistory: load };
}
