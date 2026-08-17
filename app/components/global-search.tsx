"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

type SearchResult = {
  id: string;
  kind: "contact" | "transaction";
  title: string;
  detail: string;
  href: string;
};

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDialogLifecycle(isOpen, () => setIsOpen(false));

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!isOpen || trimmed.length < 2) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/crm/data?resource=globalSearch&q=${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as { data?: SearchResult[] } | null;
        if (!response.ok || !payload?.data) throw new Error("Recherche indisponible");
        setResults(payload.data);
      } catch (caughtError) {
        if ((caughtError as Error).name !== "AbortError") setError("Recherche momentanément indisponible.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 220);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isOpen, query]);

  function openResult(result: SearchResult) {
    setIsOpen(false);
    setQuery("");
    router.push(result.href);
  }

  return (
    <>
      <button aria-label="Ouvrir la recherche globale" className="global-search-trigger" onClick={() => setIsOpen(true)} type="button">
        <span aria-hidden="true">⌕</span>
        <span>Rechercher</span>
      </button>
      {isOpen && (
        <div className="global-search-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setIsOpen(false)} role="presentation">
          <section aria-labelledby="global-search-title" aria-modal="true" className="global-search-panel" role="dialog">
            <header>
              <div><p className="section-kicker">Accès rapide</p><h2 id="global-search-title">RECHERCHE GLOBALE</h2></div>
              <button aria-label="Fermer la recherche" onClick={() => setIsOpen(false)} type="button">×</button>
            </header>
            <label className="global-search-input">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Rechercher un contact ou une transaction"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nom, téléphone, email ou adresse"
                ref={inputRef}
                type="search"
                value={query}
              />
            </label>
            <div className="global-search-results" aria-live="polite">
              {isLoading && <p>Recherche…</p>}
              {error && <p className="global-search-error">{error}</p>}
              {!isLoading && !error && query.trim().length < 2 && <p>Saisissez au moins deux caractères.</p>}
              {!isLoading && !error && query.trim().length >= 2 && results.length === 0 && <p>Aucun résultat.</p>}
              {results.map((result) => (
                <button key={`${result.kind}-${result.id}`} onClick={() => openResult(result)} type="button">
                  <span className={`global-result-kind global-result-${result.kind}`}>{result.kind === "contact" ? "Contact" : "Transaction"}</span>
                  <span><strong>{result.title}</strong><small>{result.detail}</small></span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
