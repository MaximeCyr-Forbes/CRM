"use client";

import { getListingDaysOnMarket, getListingExpirationInfo } from "../lib/listings/overview";
import { formatListingDate } from "../lib/listings/presentation";
import { useListingReport } from "../lib/listings/use-listing-report";

export function ListingMarketSnapshot({ listingId }: { listingId: string }) {
  const report = useListingReport(listingId);
  if (report.isLoading) return <section className="listing-market-snapshot listing-market-snapshot-loading" aria-live="polite">Chargement du résumé de mise en marché…</section>;
  if (report.error || !report.data) return <section className="listing-market-snapshot listing-market-snapshot-error" role="alert"><span>Résumé temporairement indisponible.</span><button onClick={() => void report.retry()} type="button">Réessayer</button></section>;
  const { listing, tracking, offers, transactionLink } = report.data;
  const days = getListingDaysOnMarket(listing);
  const expiration = getListingExpirationInfo(listing);
  const completed = tracking?.tasks.filter((task) => task.completed).length ?? null;
  return <section className="listing-market-snapshot" aria-labelledby="listing-market-snapshot-title"><header><div><p className="section-kicker">Lecture rapide</p><h2 id="listing-market-snapshot-title">MISE EN MARCHÉ</h2></div>{transactionLink && <button onClick={() => window.location.assign(`/transactions/${transactionLink.transactionId}`)} type="button">TRANSACTION LIÉE →</button>}</header><div><article><span>Jours en marché</span><strong>{days === null ? "—" : days === 1 ? "Jour 1" : `${days} jours`}</strong></article><article><span>Date de mise en marché</span><strong>{formatListingDate(listing.listingDate)}</strong></article><article><span>Expiration</span><strong>{expiration?.label ?? formatListingDate(listing.expirationDate)}</strong></article><article><span>Visites</span><strong>{tracking ? tracking.visits.length : "Indisponible"}</strong></article><article><span>Offres</span><strong>{offers ? offers.length : "Indisponible"}</strong></article><article><span>Progression checklist</span><strong>{tracking && completed !== null ? `${completed} / ${tracking.tasks.length}` : "Indisponible"}</strong></article></div></section>;
}
