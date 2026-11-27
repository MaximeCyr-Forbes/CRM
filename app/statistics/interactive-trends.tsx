"use client";

import { useEffect, useRef, useState } from "react";
import type { StatisticsSnapshot } from "../data/statistics-types";
import { BROKER_LABELS } from "../data/contact-types";
import { LISTING_STATUS_LABELS } from "../data/listing-types";
import { TRANSACTION_STATUS_LABELS } from "../data/transaction-types";
import { METRIC_LABELS, trendCaption, type StatisticsDrilldown, type StatisticsMetric } from "../lib/statistics/drilldown";

const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });
const compactMoney = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 1, notation: "compact" });
const count = new Intl.NumberFormat("fr-CA");
type Trend = StatisticsSnapshot["trends"][number];
type Selection = { trend: Trend; metric: StatisticsMetric; trigger: HTMLButtonElement };

export function StatisticsDetail({ selection, snapshot, query, onClose }: { selection: Selection; snapshot: StatisticsSnapshot; query: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const revision = useRef<string | null>(null);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<StatisticsDrilldown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const caption = trendCaption(selection.trend.month, snapshot.period);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); if (selection.trigger.isConnected) selection.trigger.focus(); };
  }, [selection.trigger]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError(null); setResult(null);
    const params = new URLSearchParams(query.split("?")[1]);
    params.set("month", selection.trend.month); params.set("metric", selection.metric); params.set("page", String(page));
    if (revision.current) params.set("revision", revision.current);
    const timeout = setTimeout(() => { if (active) { active = false; controller.abort(); setError("Le chargement a pris trop de temps. Réessayez."); setLoading(false); } }, 15_000);
    fetch(`/api/statistics/drilldown?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.data) throw new Error(body.error ?? "Le détail est indisponible.");
        return body.data as StatisticsDrilldown;
      })
      .then((data) => { if (active) { revision.current = data.revision; setResult(data); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Le détail est indisponible."); })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [query, selection.trend.month, selection.metric, page, attempt]);
  const expectedCount = selection.metric === "listings" ? selection.trend.listings : selection.metric === "sales" || selection.metric === "sale_volume" ? selection.trend.sales : selection.metric === "combined_volume" ? selection.trend.sales + selection.trend.purchases : selection.trend.purchases;
  const expectedTotal = selection.metric === "listings" ? 0 : selection.metric === "sales" || selection.metric === "sale_volume" ? selection.trend.saleVolume : selection.metric === "combined_volume" ? selection.trend.saleVolume + selection.trend.purchaseVolume : selection.trend.purchaseVolume;
  const updated = result && (result.count !== expectedCount || result.total !== expectedTotal);
  return <dialog className="statistics-detail" ref={dialog} aria-labelledby="statistics-detail-title" onCancel={onClose}>
    <header><div><h2 id="statistics-detail-title">{METRIC_LABELS[selection.metric]} — {caption.title}</h2><p>{snapshot.broker === "team" ? "Équipe" : BROKER_LABELS[snapshot.broker]} · Du {caption.from} au {caption.to}{caption.partial ? " · Période partielle" : ""}</p></div><button type="button" onClick={onClose} autoFocus>Fermer</button></header>
    {loading && <p role="status">Chargement des dossiers…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => { revision.current = null; setPage(1); setAttempt((value) => value + 1); }}>Réessayer / actualiser</button></div>}
    {result && <>
      <p>{result.count} dossier{result.count === 1 ? "" : "s"}{selection.metric !== "listings" && <> · Total : <strong>{money.format(result.total)} CAD</strong></>}</p>
      {updated && <p role="status">Données mises à jour depuis l’ouverture du graphique.</p>}

      {selection.metric === "combined_volume" && <p>Vente : {money.format(result.saleVolume)} CAD · Achat : {money.format(result.purchaseVolume)} CAD</p>}
      {result.count === 0 && <p>Aucun dossier pour cette période.</p>}
      <ul>{result.rows.map((row) => <li key={row.id}>
        <strong>{row.address || "Adresse non renseignée"}</strong>
        <p>{BROKER_LABELS[row.broker as keyof typeof BROKER_LABELS] ?? row.broker} · {row.kind === "listing" ? "Prise de Listing" : "Date retenue"} : {row.date}</p>
        <p>{row.kind === "sale" ? "Vente" : row.kind === "purchase" ? "Achat" : "Listing"} · Statut : {((row.kind === "listing" ? LISTING_STATUS_LABELS : TRANSACTION_STATUS_LABELS) as Record<string, string>)[row.status] ?? row.status}{row.amount !== null && <> · {money.format(row.amount)} CAD</>}</p>
        <a href={`/${row.kind === "listing" ? "listings" : "transactions"}/${row.id}`} target="_blank" rel="noopener noreferrer">{row.kind === "listing" ? "Ouvrir la fiche" : "Ouvrir la Transaction"} ↗</a>
      </li>)}</ul>
      {result.count > result.pageSize && <nav aria-label="Pages du détail"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Précédent</button><span>Page {page} / {Math.ceil(result.count / result.pageSize)}</span><button type="button" disabled={page * result.pageSize >= result.count} onClick={() => setPage(page + 1)}>Suivant</button></nav>}
    </>}
  </dialog>;
}

export default function InteractiveTrends({ snapshot, query }: { snapshot: StatisticsSnapshot; query: string }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const activityMaximum = Math.max(1, ...snapshot.trends.flatMap((item) => [item.listings, item.sales, item.purchases]));
  const volumeMaximum = Math.max(1, ...snapshot.trends.flatMap((item) => [item.saleVolume, item.purchaseVolume]));
  function bar(item: Trend, metric: StatisticsMetric, value: number, series: string, style: React.CSSProperties) {
    const caption = trendCaption(item.month, snapshot.period);
    const label = `${caption.title} — ${METRIC_LABELS[metric]} : ${metric.includes("volume") ? `${money.format(value)} CAD` : count.format(value)}${caption.partial ? ` · Du ${caption.from} au ${caption.to} (période partielle)` : ""}`;
    return <button type="button" className={`statistics-chart-button ${series}`} data-zero={value === 0} style={style} aria-label={label} onClick={(event) => setSelection({ trend: item, metric, trigger: event.currentTarget })}>
      <span className="statistics-tooltip" role="tooltip">{label}</span>
    </button>;
  }
  return <>
    <div className="statistics-chart-grid">
      <article className="statistics-chart"><div className="statistics-chart-heading"><strong>Activité</strong><span><i className="listing" /> Listings <i className="sale" /> Ventes <i className="purchase" /> Achats</span></div><div className="statistics-bar-chart">
        {snapshot.trends.map((item) => <div className="statistics-bar-column" key={item.month}><div className="statistics-bars">
          {bar(item, "listings", item.listings, "listing", { height: `${Math.max(3, item.listings / activityMaximum * 100)}%` })}
          {bar(item, "sales", item.sales, "sale", { height: `${Math.max(3, item.sales / activityMaximum * 100)}%` })}
          {bar(item, "purchases", item.purchases, "purchase", { height: `${Math.max(3, item.purchases / activityMaximum * 100)}%` })}
        </div><small>{item.label}</small></div>)}
      </div></article>
      <article className="statistics-chart"><div className="statistics-chart-heading"><strong>Volumes</strong><span>Vente / Achat</span></div><div className="statistics-volume-chart">
        {snapshot.trends.map((item) => <div key={item.month}><span>{item.label}</span><div>
          {bar(item, "sale_volume", item.saleVolume, "sale", { width: `${Math.max(item.saleVolume ? 2 : 0, item.saleVolume / volumeMaximum * 100)}%` })}
          {bar(item, "purchase_volume", item.purchaseVolume, "purchase", { width: `${Math.max(item.purchaseVolume ? 2 : 0, item.purchaseVolume / volumeMaximum * 100)}%` })}
        </div><button type="button" className="statistics-volume-total" aria-label={`${trendCaption(item.month, snapshot.period).title} — Volume total : ${money.format(item.saleVolume + item.purchaseVolume)} CAD`} onClick={(event) => setSelection({ trend: item, metric: "combined_volume", trigger: event.currentTarget })}>{compactMoney.format(item.saleVolume + item.purchaseVolume)}</button></div>)}
      </div></article>
    </div>
    {selection && <StatisticsDetail key={`${selection.trend.month}-${selection.metric}`} selection={selection} snapshot={snapshot} query={query} onClose={() => setSelection(null)} />}
  </>;
}
