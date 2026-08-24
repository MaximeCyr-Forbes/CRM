"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BROKER_LABELS } from "../../../data/contact-types";
import {
  LISTING_INTEREST_LABELS,
  LISTING_OFFER_STATUS_LABELS,
  LISTING_PROPERTY_TYPE_LABELS,
  LISTING_PURPOSE_LABELS,
  LISTING_STATUS_LABELS,
} from "../../../data/listing-types";
import { getListingDaysOnMarket, getListingExpirationInfo } from "../../../lib/listings/overview";
import { formatListingAmount, formatListingDate, listingAddressLines, listingPriceLabel } from "../../../lib/listings/presentation";
import { useListingReport } from "../../../lib/listings/use-listing-report";
import { getListingChecklistStats, listingTaskDisplayTitle } from "../../../lib/listings/checklist";

const reportDate = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric" });

export default function ListingReportPage() {
  const params = useParams<{ listingId: string }>();
  const router = useRouter();
  const listingId = Array.isArray(params.listingId) ? params.listingId[0] : params.listingId;
  const report = useListingReport(listingId);
  const [copied, setCopied] = useState(false);
  const generatedOn = useMemo(() => reportDate.format(new Date()), []);

  if (report.isLoading) return <main className="listing-report-state" aria-live="polite">Préparation du rapport…</main>;
  if (report.notFound) return <main className="listing-report-state"><strong>LISTING INTROUVABLE</strong><button onClick={() => router.push("/listings")} type="button">Retour Listings</button></main>;
  if (report.error || !report.data) return <main className="listing-report-state" role="alert"><strong>Certaines données du rapport sont temporairement indisponibles.</strong><button onClick={() => void report.retry()} type="button">RÉESSAYER</button></main>;

  const { listing, ownerNames, tracking, offers } = report.data;
  const address = listingAddressLines(listing).join(", ");
  const daysOnMarket = getListingDaysOnMarket(listing);
  const expiration = getListingExpirationInfo(listing);
  const checklist = tracking ? getListingChecklistStats(tracking.tasks, listing.propertyType) : null;
  const completedTasks = checklist?.visibleTasks.filter((task) => task.completed) ?? [];
  const remainingTasks = checklist?.visibleTasks.filter((task) => !task.completed) ?? [];
  const usefulVisits = tracking?.visits.filter((visit) => visit.feedback || visit.interestLevel) ?? [];
  const interestCounts = {
    high: tracking?.visits.filter((visit) => visit.interestLevel === "high").length ?? 0,
    medium: tracking?.visits.filter((visit) => visit.interestLevel === "medium").length ?? 0,
    low: tracking?.visits.filter((visit) => visit.interestLevel === "low").length ?? 0,
  };
  const priceHistory = tracking?.priceHistory ?? [];
  const chronologicalPrices = [...priceHistory].sort((a, b) => a.changedAt.localeCompare(b.changedAt));
  const initialPrice = chronologicalPrices.find((entry) => entry.amount !== null)?.amount ?? null;
  const currentPrice = listing.purpose === "sale" ? listing.askingPrice : listing.monthlyRent;
  const difference = initialPrice !== null && currentPrice !== null ? currentPrice - initialPrice : null;
  const differencePercent = difference !== null && initialPrice ? difference / initialPrice * 100 : null;
  const summary = [
    `Rapport de mise en marché — ${address}`,
    `${daysOnMarket ?? "—"} jour${daysOnMarket === 1 ? "" : "s"} sur le marché`,
    tracking ? `${tracking.visits.length} visite${tracking.visits.length === 1 ? "" : "s"}` : "Visites temporairement indisponibles",
    offers ? `${offers.length} offre${offers.length === 1 ? "" : "s"}` : "Offres temporairement indisponibles",
    `${listing.purpose === "sale" ? "Prix actuel" : "Loyer actuel"} : ${listingPriceLabel(listing)}`,
    `Expiration : ${formatListingDate(listing.expirationDate)}`,
  ].join("\n");

  async function copySummary() {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  return <main className="listing-report-page">
    <div className="listing-report-toolbar" aria-label="Actions du rapport"><button onClick={() => router.push(`/listings/${listing.id}`)} type="button">← RETOUR AU LISTING</button><div><button onClick={() => void copySummary()} type="button">{copied ? "RÉSUMÉ COPIÉ ✓" : "COPIER LE RÉSUMÉ"}</button><button className="listing-report-print" onClick={() => window.print()} type="button">IMPRIMER / ENREGISTRER EN PDF</button></div></div>
    {(!report.data.trackingAvailable || !report.data.offersAvailable) && <div className="listing-report-warning" role="alert">Certaines données du rapport sont temporairement indisponibles. <button onClick={() => void report.retry()} type="button">Réessayer</button></div>}

    <article className="listing-report-document">
      <header className="listing-report-header"><img alt="Équipe Forbes Team" height="182" src="/branding/equipe-forbes-header-logo.png" width="1337" /><div><p>RAPPORT DE MISE EN MARCHÉ</p><h1>{listing.purpose === "sale" ? "RAPPORT VENDEUR" : "RAPPORT PROPRIÉTAIRE"}</h1><strong>{address}</strong><span>{BROKER_LABELS[listing.broker]} · Rapport généré le {generatedOn}</span></div></header>

      <section className="listing-report-section" aria-labelledby="report-property-title"><div className="listing-report-section-title"><span>01</span><h2 id="report-property-title">RÉSUMÉ DE LA PROPRIÉTÉ</h2></div><dl className="listing-report-facts"><div><dt>Adresse</dt><dd>{address}</dd></div><div><dt>Numéro Centris</dt><dd>{listing.centrisNumber || "Non renseigné"}</dd></div><div><dt>Type</dt><dd>{LISTING_PROPERTY_TYPE_LABELS[listing.propertyType]}</dd></div><div><dt>Mandat</dt><dd>{LISTING_PURPOSE_LABELS[listing.purpose]}</dd></div><div><dt>Statut</dt><dd>{LISTING_STATUS_LABELS[listing.status]}</dd></div><div><dt>{listing.purpose === "sale" ? "Prix actuel" : "Loyer actuel"}</dt><dd>{listingPriceLabel(listing)}</dd></div><div><dt>Mise en marché</dt><dd>{formatListingDate(listing.listingDate)}</dd></div><div><dt>Jours en marché</dt><dd>{daysOnMarket === null ? "Non disponible" : daysOnMarket === 1 ? "Jour 1" : `${daysOnMarket} jours`}</dd></div><div><dt>Expiration du contrat</dt><dd>{formatListingDate(listing.expirationDate)}{expiration ? ` · ${expiration.label}` : ""}</dd></div></dl>{ownerNames.length > 0 && <div className="listing-report-owners"><span>Propriétaire{ownerNames.length > 1 ? "s" : ""}</span><strong>{ownerNames.join(" · ")}</strong></div>}</section>

      <section className="listing-report-section" aria-labelledby="report-performance-title"><div className="listing-report-section-title"><span>02</span><h2 id="report-performance-title">ACTIVITÉ DE MISE EN MARCHÉ</h2></div>{tracking && offers && checklist ? <div className="listing-report-performance"><article><strong>{tracking.visits.length}</strong><span>Visites</span></article><article><strong>{offers.length}</strong><span>Offres</span></article><article><strong>{checklist.completed} / {checklist.total}</strong><span>Checklist complétée</span></article><article><strong>{daysOnMarket ?? "—"}</strong><span>Jours en marché</span></article></div> : <p className="listing-report-unavailable">Certaines données de performance sont temporairement indisponibles.</p>}</section>

      <section className="listing-report-section" aria-labelledby="report-visits-title"><div className="listing-report-section-title"><span>03</span><h2 id="report-visits-title">VISITES ET COMMENTAIRES</h2></div>{tracking ? <><div className="listing-report-interest-summary"><strong>{tracking.visits.length} VISITE{tracking.visits.length === 1 ? "" : "S"}</strong><span>{interestCounts.high} intérêt fort · {interestCounts.medium} intérêt moyen · {interestCounts.low} intérêt faible</span></div><div className="listing-report-list">{usefulVisits.map((visit) => <article key={visit.id}><time>{formatListingDate(visit.visitDate)}</time>{visit.interestLevel && <strong className={`listing-report-interest listing-report-interest-${visit.interestLevel}`}>INTÉRÊT {LISTING_INTEREST_LABELS[visit.interestLevel].toUpperCase()}</strong>}{visit.feedback && <p>{visit.feedback}</p>}</article>)}{tracking.visits.length === 0 && <p>Aucune visite enregistrée pour le moment.</p>}{tracking.visits.length > 0 && usefulVisits.length === 0 && <p>Des visites sont enregistrées, sans commentaire partageable pour le moment.</p>}</div></> : <p className="listing-report-unavailable">Les visites sont temporairement indisponibles.</p>}</section>

      <section className="listing-report-section" aria-labelledby="report-offers-title"><div className="listing-report-section-title"><span>04</span><h2 id="report-offers-title">OFFRES REÇUES</h2></div>{offers ? <div className="listing-report-offers">{offers.map((offer) => <article key={offer.id}><time>{formatListingDate(offer.offerDate)}</time><strong>{formatListingAmount(offer.amount, offer.purpose)}</strong><span>{LISTING_OFFER_STATUS_LABELS[offer.status]}</span></article>)}{offers.length === 0 && <p>Aucune offre reçue pour le moment.</p>}</div> : <p className="listing-report-unavailable">Les offres sont temporairement indisponibles.</p>}</section>

      <section className="listing-report-section" aria-labelledby="report-price-title"><div className="listing-report-section-title"><span>05</span><h2 id="report-price-title">{listing.purpose === "sale" ? "ÉVOLUTION DU PRIX" : "ÉVOLUTION DU LOYER"}</h2></div>{tracking ? <><div className="listing-report-price-history">{chronologicalPrices.length === 0 ? <p>Valeur actuelle : {listingPriceLabel(listing)}</p> : chronologicalPrices.length === 1 ? <p>Prix initial et actuel : {listingPriceLabel(listing)}</p> : chronologicalPrices.map((entry) => <article key={entry.id}><time>{formatListingDate(entry.changedAt.slice(0, 10))}</time><strong>{entry.amount === null ? "Non renseigné" : formatListingAmount(entry.amount, entry.purpose)}</strong></article>)}</div>{difference !== null && difference !== 0 && <p className="listing-report-price-difference">Évolution depuis la valeur initiale : {difference > 0 ? "+" : ""}{formatListingAmount(difference, listing.purpose)}{differencePercent !== null ? ` · ${differencePercent > 0 ? "+" : ""}${differencePercent.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} %` : ""}</p>}</> : <p className="listing-report-unavailable">L’historique est temporairement indisponible.</p>}</section>

      <section className="listing-report-section listing-report-actions-section" aria-labelledby="report-actions-title"><div className="listing-report-section-title"><span>06</span><h2 id="report-actions-title">ACTIONS DE MISE EN MARCHÉ</h2></div>{tracking ? <div className="listing-report-actions-grid"><div><h3>ACTIONS RÉALISÉES</h3>{completedTasks.map((task) => <p key={task.id}>✓ {listingTaskDisplayTitle(task)}</p>)}{completedTasks.length === 0 && <p>Aucune action complétée pour le moment.</p>}</div><div><h3>PROCHAINES ACTIONS</h3>{remainingTasks.map((task) => <p key={task.id}>○ {listingTaskDisplayTitle(task)}</p>)}{remainingTasks.length === 0 && <p>Toutes les actions sont complétées.</p>}</div></div> : <p className="listing-report-unavailable">La checklist est temporairement indisponible.</p>}</section>
    </article>
  </main>;
}
