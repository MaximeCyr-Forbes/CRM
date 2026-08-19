"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BROKER_LABELS } from "../data/contact-types";
import type { ListingOverview as ListingOverviewData, ListingPurpose } from "../data/listing-types";
import { formatListingAmount, formatListingDate } from "../lib/listings/presentation";

function overviewUrl(broker: string | undefined, purpose: ListingPurpose | undefined) {
  const query = new URLSearchParams();
  if (broker) query.set("broker", broker);
  if (purpose) query.set("purpose", purpose);
  return `/api/listings/overview${query.size ? `?${query}` : ""}`;
}

export function ListingOverview({ broker, purpose, refreshToken }: {
  broker?: "france" | "maxime" | "sandrine";
  purpose?: ListingPurpose;
  refreshToken: number;
}) {
  const router = useRouter();
  const [data, setData] = useState<ListingOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const response = await fetch(overviewUrl(broker, purpose), { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { data?: ListingOverviewData; error?: string } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error ?? "Aperçu indisponible.");
      setData(payload.data);
    } catch { setError("La vue d’ensemble est temporairement indisponible."); }
    finally { setIsLoading(false); }
  }, [broker, purpose]);

  useEffect(() => { void refreshToken; void load(); }, [load, refreshToken]);

  return <section className="listing-overview" aria-labelledby="listing-overview-title">
    <div className="listing-overview-heading"><div><p className="section-kicker">Pilotage de l’inventaire</p><h2 id="listing-overview-title">VUE D’ENSEMBLE</h2></div>{broker && <span>Statistiques · {BROKER_LABELS[broker]}</span>}</div>
    {error && <div className="listing-overview-error" role="alert"><span>{error}</span><button onClick={() => void load()} type="button">Réessayer</button></div>}
    {!error && <div className="listing-overview-stats" aria-busy={isLoading}>{[
      { label: "Listings actifs", value: data ? String(data.activeListings) : "—", accent: true },
      { label: "Valeur d’inventaire", value: data ? formatListingAmount(data.activeSaleInventoryValue, "sale") : "—", muted: purpose === "rental" },
      { label: "Loyers mensuels", value: data ? formatListingAmount(data.activeRentalMonthlyTotal, "rental") : "—", muted: purpose === "sale" },
      { label: "Offres en cours", value: data ? String(data.openOffers) : "—" },
      { label: "Expirations à venir", value: data ? String(data.expiringListings.length) : "—" },
      { label: "Moyenne en marché", value: data?.averageDaysOnMarket ? `${data.averageDaysOnMarket} jours` : data ? "Non disponible" : "—" },
    ].map((stat) => <article className={`${stat.accent ? "listing-overview-stat-accent" : ""} ${stat.muted ? "listing-overview-stat-muted" : ""}`} key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong></article>)}</div>}

    {data && <div className="listing-overview-panels">
      <section aria-labelledby="listing-attention-title"><header><div><span>Priorités</span><h3 id="listing-attention-title">À SURVEILLER</h3></div><strong>{data.attentionItems.length}</strong></header><div className="listing-attention-list">{data.attentionItems.slice(0, 10).map((item, index) => <button key={`${item.listingId}-${item.kind}-${index}`} onClick={() => router.push(`/listings/${item.listingId}`)} type="button"><span className={`listing-attention-level listing-attention-${item.level}`}>{item.level === "urgent" || item.level === "overdue" ? "URGENT" : item.level === "watch" ? "À SURVEILLER" : item.level === "upcoming" ? "À VENIR" : "SUIVI"}</span><strong>{item.address}</strong><small>{item.label} · {BROKER_LABELS[item.broker]}</small><b>Ouvrir →</b></button>)}{data.attentionItems.length === 0 && <p>Aucun élément prioritaire pour le moment.</p>}</div></section>
      <section aria-labelledby="listing-renewals-title"><header><div><span>30 prochains jours</span><h3 id="listing-renewals-title">CONTRATS À RENOUVELER</h3></div><strong>{data.expiringListings.length}</strong></header><div className="listing-renewal-list">{data.expiringListings.map((item) => <article key={item.listingId}><div><span className={`listing-attention-level listing-attention-${item.level}`}>{item.level === "overdue" || item.level === "urgent" ? "URGENT" : item.level === "watch" ? "À SURVEILLER" : "À VENIR"}</span><strong>{item.address}</strong><small>{BROKER_LABELS[item.broker]} · {item.label}</small><time>{formatListingDate(item.expirationDate)}</time></div><button aria-label={`Ouvrir le Listing ${item.address}`} onClick={() => router.push(`/listings/${item.listingId}`)} type="button">Ouvrir →</button></article>)}{data.expiringListings.length === 0 && <p>Aucun contrat à renouveler dans les 30 prochains jours.</p>}</div></section>
    </div>}
  </section>;
}
