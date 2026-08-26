"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useBroker } from "../broker-context";
import { TransactionEditorModal } from "../components/transaction-editor-modal";
import { useContacts } from "../contacts-context";
import { BROKER_LABELS, CONTACT_BROKERS, getContactName } from "../data/contact-types";
import {
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  getNextTransactionDeadline,
  type TransactionBroker,
  type TransactionDraft,
  type TransactionType,
} from "../data/transaction-types";
import { useTransactions } from "../transactions-context";
import { currentTorontoDateTime, formatTransactionDeadlineTime, isTransactionDeadlineOverdue } from "../lib/transactions/deadline-time";
import { transactionMatchesSearch } from "../lib/transactions/search";
import {
  FINALIZED_TRANSACTION_YEARS,
  finalizedTransactionLabel,
  finalizedTransactionYear,
  isTransactionInState,
  sortFinalizedTransactions,
  type TransactionStateFilter,
} from "../lib/transactions/completion";

type BrokerFilter = "all" | TransactionBroker;
type TransactionTypeFilter = "all" | TransactionType;
type YearFilter = "all" | `${number}`;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

function formatAmount(value: number | null) {
  return value === null
    ? "Non renseigné"
    : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);
}

function validYearFilter(value: string | null): value is `${number}` {
  return FINALIZED_TRANSACTION_YEARS.includes(Number(value) as (typeof FINALIZED_TRANSACTION_YEARS)[number]);
}

export default function TransactionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedBroker } = useBroker();
  const { contacts } = useContacts();
  const { transactions, isLoading, isSaving, error, retry, createTransaction } = useTransactions();
  const queryBroker = searchParams.get("broker");
  const queryState = searchParams.get("state");
  const queryType = searchParams.get("type");
  const queryYear = searchParams.get("year");
  const initialBroker = CONTACT_BROKERS.includes(queryBroker as TransactionBroker)
    ? queryBroker as TransactionBroker
    : selectedBroker?.toLowerCase() as TransactionBroker | undefined;
  const [brokerFilter, setBrokerFilter] = useState<BrokerFilter>(initialBroker ?? "all");
  const [stateFilter, setStateFilter] = useState<TransactionStateFilter>(queryState === "sold" || queryState === "completed" ? queryState : "active");
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>(queryType === "sale" || queryType === "purchase" ? queryType : "all");
  const today = currentTorontoDateTime().date;
  const currentYear = today.slice(0, 4) as `${number}`;
  const defaultSoldYear: YearFilter = validYearFilter(currentYear) ? currentYear : "all";
  const [yearFilter, setYearFilter] = useState<YearFilter>(validYearFilter(queryYear) ? queryYear : queryState === "sold" ? defaultSoldYear : "all");
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    if (CONTACT_BROKERS.includes(queryBroker as TransactionBroker)) setBrokerFilter(queryBroker as TransactionBroker);
  }, [queryBroker]);

  useEffect(() => {
    if (queryState === "active" || queryState === "sold" || queryState === "completed") setStateFilter(queryState);
    if (queryType === "sale" || queryType === "purchase") setTypeFilter(queryType);
    if (validYearFilter(queryYear)) setYearFilter(queryYear);
    else if (queryState === "sold") setYearFilter(defaultSoldYear);
  }, [defaultSoldYear, queryState, queryType, queryYear]);

  useEffect(() => {
    if (!confirmation) return;
    const timeout = window.setTimeout(() => setConfirmation(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [confirmation]);

  useEffect(() => {
    const notice = window.sessionStorage.getItem("transactionNotice");
    if (!notice) return;
    window.sessionStorage.removeItem("transactionNotice");
    setConfirmation(notice);
  }, []);

  const visibleTransactions = useMemo(() => {
    const filtered = transactions.filter((transaction) => {
      if (brokerFilter !== "all" && transaction.broker !== brokerFilter) return false;
      if (typeFilter !== "all" && transaction.type !== typeFilter) return false;
      if (!isTransactionInState(transaction, stateFilter)) return false;
      if (stateFilter === "sold" && yearFilter !== "all" && finalizedTransactionYear(transaction) !== Number(yearFilter)) return false;
      const contactNames = transaction.contactIds.map((contactId) => {
        const contact = contacts.find((item) => item.id === contactId);
        return contact ? getContactName(contact) : "";
      }).join(" ");
      return transactionMatchesSearch(transaction, contactNames, search);
    });
    return stateFilter === "sold" ? sortFinalizedTransactions(filtered) : filtered;
  }, [brokerFilter, contacts, search, stateFilter, transactions, typeFilter, yearFilter]);

  function selectState(state: TransactionStateFilter) {
    setStateFilter(state);
    if (state === "sold" && yearFilter === "all") setYearFilter(defaultSoldYear);
  }

  return (
    <main className="transactions-page">
      <div className="transactions-shell">
        <header className="transactions-header">
          <div><p className="section-kicker">Dossiers immobiliers</p><h1>TRANSACTIONS</h1><p>Les dossiers, leurs clients et leurs prochaines dates importantes.</p></div>
          <button className="transaction-new" onClick={() => setIsCreating(true)} type="button">+ Nouvelle transaction</button>
        </header>

        <section className={`transactions-controls ${stateFilter === "sold" ? "has-year-filter" : ""}`} aria-label="Filtres des transactions">
          <div className="transaction-filter-group">{(["all", ...CONTACT_BROKERS] as BrokerFilter[]).map((broker) => <button aria-pressed={brokerFilter === broker} key={broker} onClick={() => setBrokerFilter(broker)} type="button">{broker === "all" ? "Tous" : BROKER_LABELS[broker]}</button>)}</div>
          <div className="transaction-filter-group"><button aria-pressed={typeFilter === "all"} onClick={() => setTypeFilter("all")} type="button">Tous types</button><button aria-pressed={typeFilter === "sale"} onClick={() => setTypeFilter("sale")} type="button">Ventes</button><button aria-pressed={typeFilter === "purchase"} onClick={() => setTypeFilter("purchase")} type="button">Achats</button></div>
          <div className="transaction-filter-group transaction-state-filter"><button aria-pressed={stateFilter === "active"} onClick={() => selectState("active")} type="button">Actives</button><button aria-pressed={stateFilter === "sold"} onClick={() => selectState("sold")} type="button">Vendus</button><button aria-pressed={stateFilter === "completed"} onClick={() => selectState("completed")} type="button">Terminées</button></div>
          {stateFilter === "sold" && <label className="transaction-year-filter"><span>Année</span><select aria-label="Année des Transactions vendues" onChange={(event) => setYearFilter(event.target.value as YearFilter)} value={yearFilter}><option value="all">Toutes les années</option>{FINALIZED_TRANSACTION_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>}
          <label className="transactions-search"><span aria-hidden="true">⌕</span><input aria-label="Rechercher par adresse, numéro Centris ou client" onChange={(event) => setSearch(event.target.value)} placeholder="Adresse, Centris ou client" type="search" value={search} /></label>
        </section>

        {error && <div className="transaction-status transaction-status-error" role="alert"><span>{error}</span><button onClick={() => void retry()} type="button">Réessayer</button></div>}
        {isLoading && <div className="transaction-status">Chargement des transactions…</div>}

        <section className="transaction-grid" aria-live="polite">
          {visibleTransactions.map((transaction) => {
            const linkedContacts = transaction.contactIds.map((contactId) => contacts.find((contact) => contact.id === contactId)).filter(Boolean);
            const nextDeadline = getNextTransactionDeadline(transaction);
            const isOverdue = Boolean(nextDeadline && isTransactionDeadlineOverdue(nextDeadline));
            const nextDeadlineTime = nextDeadline ? formatTransactionDeadlineTime(nextDeadline.dueTime) : null;
            return <article className={`transaction-card ${isOverdue ? "transaction-card-overdue" : ""}`} key={transaction.id}>
              <div className="transaction-card-top"><span>{TRANSACTION_TYPE_LABELS[transaction.type]}</span><span className={`transaction-status-badge ${stateFilter === "sold" ? "status-finalized" : `status-${transaction.status}`}`}>{stateFilter === "sold" ? finalizedTransactionLabel(transaction) : TRANSACTION_STATUS_LABELS[transaction.status]}</span></div>
              <h2>{transaction.address}</h2>
              <dl><div><dt>Clients</dt><dd>{linkedContacts.length ? linkedContacts.map((contact) => getContactName(contact!)).join(" · ") : "Aucun contact lié"}</dd></div><div><dt>Courtier</dt><dd>{BROKER_LABELS[transaction.broker]}</dd></div>{stateFilter === "sold" ? <><div><dt>Date du notaire</dt><dd>{transaction.notaryDate ? formatDate(transaction.notaryDate) : "Non renseignée"}</dd></div><div><dt>Prix final</dt><dd>{formatAmount(transaction.type === "sale" ? transaction.soldPrice : transaction.price)}</dd></div></> : <div><dt>Prochaine échéance</dt><dd className={isOverdue ? "transaction-deadline-overdue" : ""}>{isOverdue && <strong>EN RETARD · </strong>}{nextDeadline ? `${nextDeadline.title} · ${formatDate(nextDeadline.dueDate)}${nextDeadlineTime ? ` · ${nextDeadlineTime}` : ""}` : "Aucune échéance"}</dd></div>}</dl>
              <button onClick={() => router.push(`/transactions/${transaction.id}`)} type="button">Ouvrir <span aria-hidden="true">→</span></button>
            </article>;
          })}
          {!isLoading && visibleTransactions.length === 0 && <div className="transactions-empty"><span aria-hidden="true">◇</span><h2>Aucune transaction</h2><p>Créez une transaction ou modifiez les filtres.</p></div>}
        </section>
      </div>
      {confirmation && <div aria-live="polite" className="follow-up-confirmation" role="status"><span aria-hidden="true">✓</span><strong>{confirmation}</strong></div>}
      {isCreating && <TransactionEditorModal
        initial={{
          address: "",
          centrisNumber: "",
          type: "purchase",
          broker: (selectedBroker?.toLowerCase() ?? "maxime") as TransactionBroker,
          contactIds: [],
          price: null,
          promiseDate: null,
          status: "new",
          generalNotes: "",
        } satisfies TransactionDraft}
        isSaving={isSaving}
        mode="create"
        onClose={() => setIsCreating(false)}
        onOpenExisting={(transactionId) => {
          setIsCreating(false);
          router.push(`/transactions/${transactionId}`);
        }}
        onSave={async (draft) => {
          await createTransaction(draft);
          setIsCreating(false);
          setConfirmation("Transaction enregistrée ✓");
        }}
        transactions={transactions}
      />}
    </main>
  );
}
