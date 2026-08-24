"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BROKER_LABELS } from "../data/contact-types";
import {
  STATISTICS_YEARS,
  defaultStatisticsYear,
  type StatisticsBroker,
  type StatisticsComparison,
  type StatisticsPeriod,
  type StatisticsSnapshot,
  type StatisticsYear,
} from "../data/statistics-types";

const PERIODS: ReadonlyArray<{ value: StatisticsPeriod; label: string }> = [
  { value: "month", label: "Ce mois" },
  { value: "three_months", label: "3 mois" },
  { value: "year", label: "Cette année" },
  { value: "twelve_months", label: "12 mois" },
  { value: "custom", label: "Personnalisée" },
];
const BROKERS: ReadonlyArray<{ value: StatisticsBroker; label: string }> = [
  { value: "team", label: "Équipe" },
  { value: "maxime", label: "Maxime" },
  { value: "france", label: "France" },
  { value: "sandrine", label: "Sandrine" },
];

const integer = new Intl.NumberFormat("fr-CA");
const currency = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const shortCurrency = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 1, notation: "compact" });

function formatValue(value: number, kind: "number" | "currency") {
  return kind === "currency" ? currency.format(value) : integer.format(value);
}

function Comparison({ comparisonLabel, value }: { comparisonLabel: string; value: StatisticsComparison }) {
  const className = value.changePercent === null ? "neutral" : value.changePercent >= 0 ? "positive" : "negative";
  const text = value.changeLabel === "new"
    ? `Nouveau vs ${comparisonLabel}`
    : value.changePercent === null
      ? "Aucune variation calculable"
      : `${value.changePercent >= 0 ? "+" : ""}${value.changePercent} % vs ${comparisonLabel}`;
  return <span className={`statistics-comparison ${className}`}>{text}</span>;
}

function days(value: number | null) {
  return value === null ? "—" : `${value} j`;
}

export default function StatisticsPage() {
  const router = useRouter();
  const currentYear = defaultStatisticsYear(new Date());
  const [year, setYear] = useState<StatisticsYear>(currentYear);
  const [period, setPeriod] = useState<StatisticsPeriod>("year");
  const [broker, setBroker] = useState<StatisticsBroker>("team");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<StatisticsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const yearMinimum = `${year}-01-01`;
  const yearMaximum = `${year}-12-31`;
  const customIsValid = period !== "custom" || Boolean(
    customFrom
    && customTo
    && customFrom <= customTo
    && customFrom >= yearMinimum
    && customTo <= yearMaximum,
  );

  const requestUrl = useMemo(() => {
    const query = new URLSearchParams({ period, broker, year: String(year) });
    if (period === "custom" && customIsValid) {
      query.set("from", customFrom);
      query.set("to", customTo);
    }
    return `/api/statistics?${query.toString()}`;
  }, [broker, customFrom, customIsValid, customTo, period, year]);

  function changeYear(value: StatisticsYear) {
    setYear(value);
    setCustomFrom("");
    setCustomTo("");
    if (period === "twelve_months" && value !== currentYear) setPeriod("year");
  }

  useEffect(() => {
    if (!customIsValid) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    fetch(requestUrl, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { data?: StatisticsSnapshot; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Impossible de charger les statistiques.");
        return payload.data;
      })
      .then(setData)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Impossible de charger les statistiques.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [customIsValid, requestUrl]);

  const activityMaximum = Math.max(1, ...(data?.trends.flatMap((item) => [item.listings, item.sales, item.purchases]) ?? [1]));
  const volumeMaximum = Math.max(1, ...(data?.trends.flatMap((item) => [item.saleVolume, item.purchaseVolume]) ?? [1]));
  const kpis = data ? [
    { label: "Nouveaux contacts", value: data.kpis.newContacts, kind: "number" as const, href: "/contacts" },
    { label: "Nouveaux Listings", value: data.kpis.newListings, kind: "number" as const, href: "/listings" },
    { label: "PA acceptées", value: data.kpis.acceptedOffers, kind: "number" as const },
    { label: "Transactions de vente", value: data.kpis.saleTransactions, kind: "number" as const, href: `/transactions?type=sale&state=sold&year=${year}` },
    { label: "Transactions d’achat", value: data.kpis.purchaseTransactions, kind: "number" as const, href: `/transactions?type=purchase&state=sold&year=${year}` },
    { label: "Volume de vente", value: data.kpis.saleVolume, kind: "currency" as const },
    { label: "Volume d’achat", value: data.kpis.purchaseVolume, kind: "currency" as const },
    {
      label: "Listings actifs",
      value: data.kpis.activeListings,
      kind: "number" as const,
      href: data.kpis.activeListings === null ? undefined : "/listings?status=active",
      note: data.kpis.activeListings === null ? "Historique d’état non disponible" : undefined,
    },
  ] : [];

  return (
    <main className="statistics-page">
      <div className="statistics-shell">
        <header className="statistics-heading">
          <div><p className="section-kicker">Pilotage d’équipe</p><h1>STATISTIQUES</h1><p>Une lecture claire du développement des affaires et de la performance immobilière.</p></div>
          <div className="statistics-context"><span>Période analysée</span><strong>{data?.period.label ?? "—"}</strong></div>
        </header>

        <section className="statistics-filters" aria-label="Filtres statistiques">
          <label className="statistics-year-filter">
            <span>Année</span>
            <select aria-label="Année des statistiques" onChange={(event) => changeYear(Number(event.target.value) as StatisticsYear)} value={year}>
              {STATISTICS_YEARS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <div className="statistics-filter-group" aria-label="Période">
            {PERIODS.map((option) => {
              const disabled = option.value === "twelve_months" && year !== currentYear;
              return <button aria-pressed={period === option.value} disabled={disabled} key={option.value} onClick={() => setPeriod(option.value)} title={disabled ? "Disponible pour l’année courante seulement." : undefined} type="button">{option.label}</button>;
            })}
          </div>
          <div className="statistics-filter-group" aria-label="Courtier">
            {BROKERS.map((option) => <button aria-pressed={broker === option.value} key={option.value} onClick={() => setBroker(option.value)} type="button">{option.label}</button>)}
          </div>
          {period === "custom" && <div className="statistics-custom-dates">
            <label>Du<input max={customTo || yearMaximum} min={yearMinimum} onChange={(event) => setCustomFrom(event.target.value)} type="date" value={customFrom} /></label>
            <label>Au<input max={yearMaximum} min={customFrom || yearMinimum} onChange={(event) => setCustomTo(event.target.value)} type="date" value={customTo} /></label>
            {!customIsValid && <span>Choisissez une période valide.</span>}
          </div>}
          {year !== currentYear && <small className="statistics-period-note">12 mois est disponible pour l’année courante seulement.</small>}
        </section>

        {error && <div className="statistics-message statistics-message-error" role="alert">{error}</div>}
        {isLoading && <div className="statistics-message" role="status">Calcul des statistiques…</div>}

        {data && !isLoading && <>
          <section aria-labelledby="statistics-kpis-title">
            <div className="statistics-section-title"><p className="section-kicker">Vue d’ensemble</p><h2 id="statistics-kpis-title">INDICATEURS CLÉS</h2></div>
            <div className="statistics-kpi-grid">
              {kpis.map((item) => {
                const content = <><span>{item.label}</span><strong>{item.value === null ? "—" : formatValue(item.value, item.kind)}</strong>{"note" in item && item.note && <em>{item.note}</em>}{item.href && <small>Ouvrir <span aria-hidden="true">→</span></small>}</>;
                return item.href
                  ? <button className="statistics-kpi-card statistics-kpi-link" key={item.label} onClick={() => router.push(item.href!)} type="button">{content}</button>
                  : <article className="statistics-kpi-card" key={item.label}>{content}</article>;
              })}
            </div>
          </section>

          <section className="statistics-month-panel" aria-labelledby="current-month-title">
            <div className="statistics-section-title"><p className="section-kicker">Comparatif</p><h2 id="current-month-title">{data.monthContext.title}</h2><p>{data.monthContext.description}</p></div>
            <div className="statistics-month-grid">
              {([
                ["Nouveaux contacts", data.currentMonth.newContacts, "number"],
                ["Nouveaux Listings", data.currentMonth.newListings, "number"],
                ["PA acceptées", data.currentMonth.acceptedOffers, "number"],
                ["Ventes", data.currentMonth.saleTransactions, "number"],
                ["Achats", data.currentMonth.purchaseTransactions, "number"],
                ["Volume vente", data.currentMonth.saleVolume, "currency"],
                ["Volume achat", data.currentMonth.purchaseVolume, "currency"],
              ] as const).map(([label, value, kind]) => <article key={label}><span>{label}</span><strong>{formatValue(value.current, kind)}</strong><Comparison comparisonLabel={data.monthContext.comparisonLabel} value={value} /></article>)}
            </div>
          </section>

          <section className="statistics-panel statistics-listing-performance" aria-labelledby="listing-performance-title">
            <div className="statistics-section-title"><p className="section-kicker">Vente seulement</p><h2 id="listing-performance-title">PERFORMANCE DES LISTINGS</h2><p>Les achats et les ventes sans Listing source sont strictement exclus de ces délais.</p></div>
            <div className="statistics-performance-grid">
              <article><span>Listings pris</span><strong>{integer.format(data.listingPerformance.listingsTaken)}</strong></article>
              <article><span>PA acceptées</span><strong>{integer.format(data.listingPerformance.listingsWithAcceptedPa)}</strong></article>
              <article><span>Listings vendus</span><strong>{integer.format(data.listingPerformance.listingsSold)}</strong></article>
              <article><span>Taux Listing → PA</span><strong>{data.listingPerformance.listingToPaRate === null ? "—" : `${data.listingPerformance.listingToPaRate} %`}</strong></article>
              <article><span>Taux PA → vendu</span><strong>{data.listingPerformance.paToSoldRate === null ? "—" : `${data.listingPerformance.paToSoldRate} %`}</strong></article>
              <article className="statistics-delay-card"><span>Délai Listing → PA</span><strong>{days(data.listingPerformance.averagePaDays)}</strong><small>Médiane {days(data.listingPerformance.medianPaDays)} · n={data.listingPerformance.paDelaySampleSize}</small></article>
              <article className="statistics-delay-card"><span>Délai Listing → vente</span><strong>{days(data.listingPerformance.averageSaleDays)}</strong><small>Médiane {days(data.listingPerformance.medianSaleDays)} · n={data.listingPerformance.saleDelaySampleSize}</small></article>
            </div>
          </section>

          <div className="statistics-two-column">
            <section className="statistics-panel" aria-labelledby="provenance-title">
              <div className="statistics-section-title"><p className="section-kicker">Développement</p><h2 id="provenance-title">PROVENANCE DES CLIENTS</h2></div>
              <div className="statistics-provenance-list">
                {data.provenance.map((item) => <article key={item.key}>
                  <div><strong>{item.label}</strong><span>{item.contacts} contact{item.contacts === 1 ? "" : "s"} · {item.share} %</span></div>
                  <div className="statistics-progress" aria-label={`${item.share} %`}><span style={{ width: `${item.share}%` }} /></div>
                  <small>{item.contactsWithTransaction} avec transaction · conversion {item.conversionRate} %</small>
                </article>)}
              </div>
            </section>

            <section className="statistics-panel" aria-labelledby="health-title">
              <div className="statistics-section-title"><p className="section-kicker">Répertoire</p><h2 id="health-title">SANTÉ DES CONTACTS</h2></div>
              <div className="statistics-health-grid">
                <article><span>Total</span><strong>{data.contactHealth.totalContacts}</strong></article>
                <button onClick={() => router.push("/contacts?broker=unassigned")} type="button"><span>Non attribués</span><strong>{data.contactHealth.unassigned}</strong><small>Ouvrir →</small></button>
                <article><span>Chauds</span><strong>{data.contactHealth.hot}</strong></article>
                <article><span>Tièdes</span><strong>{data.contactHealth.warm}</strong></article>
                <article><span>Froids</span><strong>{data.contactHealth.cold}</strong></article>
                <article><span>Relances cette semaine</span><strong>{data.contactHealth.followUpsThisWeek}</strong></article>
                <button className={data.contactHealth.overdueFollowUps > 0 ? "attention" : ""} onClick={() => router.push("/contacts?followUp=overdue")} type="button"><span>Relances en retard</span><strong>{data.contactHealth.overdueFollowUps}</strong><small>Ouvrir →</small></button>
                <article><span>Jamais contactés</span><strong>{data.contactHealth.neverContacted}</strong></article>
                <article><span>Inactifs depuis 90 jours</span><strong>{data.contactHealth.inactive90Days}</strong></article>
              </div>
            </section>
          </div>

          <section className="statistics-panel" aria-labelledby="brokers-title">
            <div className="statistics-section-title"><p className="section-kicker">Équipe Forbes</p><h2 id="brokers-title">ACTIVITÉ PAR COURTIER</h2></div>
            <div className="statistics-table-wrap"><table className="statistics-table"><thead><tr><th>Courtier</th><th>Contacts</th><th>Listings vente</th><th>PA acceptées</th><th>Ventes</th><th>Achats</th><th>Volume vente</th><th>Volume achat</th><th>Relances</th></tr></thead><tbody>
              {data.brokerActivity.map((item) => <tr key={item.broker}><th>{BROKER_LABELS[item.broker]}</th><td>{item.newContacts}</td><td>{item.listingsTaken}</td><td>{item.acceptedOffers}</td><td>{item.saleTransactions}</td><td>{item.purchaseTransactions}</td><td>{shortCurrency.format(item.saleVolume)}</td><td>{shortCurrency.format(item.purchaseVolume)}</td><td>{item.followUps}</td></tr>)}
            </tbody></table></div>
          </section>

          <section className="statistics-panel" aria-labelledby="trends-title">
            <div className="statistics-section-title"><p className="section-kicker">Évolution</p><h2 id="trends-title">TENDANCES MENSUELLES</h2></div>
            <div className="statistics-chart-grid">
              <article className="statistics-chart"><div className="statistics-chart-heading"><strong>Activité</strong><span><i className="listing" /> Listings <i className="sale" /> Ventes <i className="purchase" /> Achats</span></div><div className="statistics-bar-chart">
                {data.trends.map((item) => <div className="statistics-bar-column" key={item.month}><div className="statistics-bars"><span className="listing" style={{ height: `${Math.max(3, item.listings / activityMaximum * 100)}%` }} title={`${item.listings} Listings`} /><span className="sale" style={{ height: `${Math.max(3, item.sales / activityMaximum * 100)}%` }} title={`${item.sales} ventes`} /><span className="purchase" style={{ height: `${Math.max(3, item.purchases / activityMaximum * 100)}%` }} title={`${item.purchases} achats`} /></div><small>{item.label}</small></div>)}
              </div></article>
              <article className="statistics-chart"><div className="statistics-chart-heading"><strong>Volumes</strong><span>Vente / Achat</span></div><div className="statistics-volume-chart">
                {data.trends.map((item) => <div key={item.month}><span>{item.label}</span><div><i className="sale" style={{ width: `${Math.max(item.saleVolume ? 2 : 0, item.saleVolume / volumeMaximum * 100)}%` }} /><i className="purchase" style={{ width: `${Math.max(item.purchaseVolume ? 2 : 0, item.purchaseVolume / volumeMaximum * 100)}%` }} /></div><strong>{shortCurrency.format(item.saleVolume + item.purchaseVolume)}</strong></div>)}
              </div></article>
            </div>
          </section>

          <footer className="statistics-definitions"><strong>Règles de calcul</strong><p>{data.definitions.paDelay}</p><p>{data.definitions.saleDelay}</p><p>{data.definitions.purchaseBusinessDate}</p><p>Lorsqu’un Listing connaît plusieurs cycles, cette V1 utilise sa première date de mise en marché et sa première PA acceptée liée. Les périodes sont calculées dans le fuseau horaire du Québec.</p></footer>
        </>}
      </div>
    </main>
  );
}
