import Link from "next/link";
import type { Listing } from "../data/listing-types";
import { BROKER_LABELS } from "../data/contact-types";
import type { Transaction } from "../data/transaction-types";
import {
  formatTransactionHistoryDate,
  listingToPaDays,
  sortContactTransactions,
  transactionHistoryStatusLabel,
  transactionHistorySummary,
  transactionSourceListing,
} from "../lib/contacts/transaction-history";

const money = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

function dossierCountLabel(count: number) {
  if (count === 0) return "Aucun dossier immobilier avec ce client.";
  if (count === 1) return "1 dossier immobilier avec ce client";
  return `${count} dossiers immobiliers avec ce client`;
}

function DateDetail({ label, value }: { label: string; value: string | null }) {
  const formatted = formatTransactionHistoryDate(value);
  return formatted ? <div><dt>{label}</dt><dd>{formatted}</dd></div> : null;
}

function AmountDetail({ label, value }: { label: string; value: number | null }) {
  return value === null ? null : <div><dt>{label}</dt><dd>{money.format(value)}</dd></div>;
}

function TransactionCard({ transaction, listingsById }: { transaction: Transaction; listingsById: ReadonlyMap<string, Listing> }) {
  const sourceListingLink = transaction.type === "sale" ? transaction.sourceListing : null;
  const listing = transactionSourceListing(transaction, listingsById);
  const paDelay = listing ? listingToPaDays(listing.listingDate, transaction.promiseDate) : null;
  const cancelled = transaction.status === "cancelled";
  const completed = transaction.status === "completed" || Boolean(transaction.saleFinalizedAt);

  return (
    <article className={`contact-property-history-card${cancelled ? " is-cancelled" : ""}`}>
      <div className="contact-property-history-badges">
        <span>{transaction.type === "purchase" ? "ACHAT" : "VENTE"}</span>
        {sourceListingLink && <span className="is-listing">LISTING FORBES</span>}
        <strong className={cancelled ? "is-cancelled" : completed ? "is-completed" : ""}>
          {transactionHistoryStatusLabel(transaction)}
        </strong>
      </div>

      <div className="contact-property-history-address">
        <h3>{transaction.address || "Adresse non renseignée"}</h3>
        {transaction.centrisNumber && <p>Centris · {transaction.centrisNumber}</p>}
      </div>

      <dl className="contact-property-history-details">
        <AmountDetail label={transaction.type === "purchase" ? "Prix d’achat" : "Prix de la PA"} value={transaction.price} />
        {transaction.type === "sale" && <AmountDetail label="Prix vendu" value={transaction.soldPrice} />}
        <DateDetail label="PA acceptée" value={transaction.promiseDate} />
        <DateDetail label="Date du notaire" value={transaction.notaryDate} />
        <div><dt>Courtier</dt><dd>{BROKER_LABELS[transaction.broker]}</dd></div>
        {listing && <AmountDetail label="Prix demandé" value={listing.askingPrice} />}
        {listing && <DateDetail label="Mise en marché" value={listing.listingDate} />}
        {listing && paDelay !== null && <div><dt>Délai avant PA</dt><dd>{paDelay} jour{paDelay === 1 ? "" : "s"}</dd></div>}
      </dl>

      <div className="contact-property-history-actions">
        <Link href={`/transactions/${transaction.id}`}>OUVRIR LE DOSSIER <span aria-hidden="true">→</span></Link>
        {sourceListingLink && <Link href={`/listings/${sourceListingLink.listingId}`}>VOIR LE LISTING</Link>}
      </div>
    </article>
  );
}

export function ContactPropertyHistory({
  transactions,
  listingsById,
}: {
  transactions: readonly Transaction[];
  listingsById: ReadonlyMap<string, Listing>;
}) {
  const sortedTransactions = sortContactTransactions(transactions);
  const summary = transactionHistorySummary(sortedTransactions);

  return (
    <section className="contact-property-history" aria-labelledby="contact-property-history-title">
      <header>
        <p className="section-kicker">RELATION CLIENT</p>
        <h2 id="contact-property-history-title">HISTORIQUE IMMOBILIER</h2>
        <p>{dossierCountLabel(summary.dossiers)}</p>
      </header>

      <div className="contact-property-history-summary" aria-label="Résumé de l’historique immobilier">
        <article><strong>{summary.dossiers}</strong><span>Dossiers</span></article>
        <article><strong>{summary.purchases}</strong><span>Achats</span></article>
        <article><strong>{summary.sales}</strong><span>Ventes</span></article>
        <article><strong>{money.format(summary.completedVolume)}</strong><span>Volume conclu</span></article>
      </div>

      {sortedTransactions.length > 0 ? (
        <div className="contact-property-history-grid">
          {sortedTransactions.map((transaction) => (
            <TransactionCard key={transaction.id} listingsById={listingsById} transaction={transaction} />
          ))}
        </div>
      ) : (
        <div className="contact-property-history-empty">
          <strong>AUCUN HISTORIQUE IMMOBILIER</strong>
          <p>Ce contact n’est encore lié à aucune Transaction.</p>
        </div>
      )}
    </section>
  );
}
