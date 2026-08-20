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
  isTransactionCompleted,
  type TransactionBroker,
  type TransactionDraft,
} from "../data/transaction-types";
import { useTransactions } from "../transactions-context";
import { toLocalISODate } from "../lib/follow-up";
import { transactionMatchesSearch } from "../lib/transactions/search";

type BrokerFilter = "all" | TransactionBroker;
type StateFilter = "active" | "completed";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

export default function TransactionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedBroker } = useBroker();
  const { contacts } = useContacts();
  const { transactions, isLoading, isSaving, error, retry, createTransaction } = useTransactions();
  const queryBroker = searchParams.get("broker");
  const initialBroker = CONTACT_BROKERS.includes(queryBroker as TransactionBroker)
    ? queryBroker as TransactionBroker
    : selectedBroker?.toLowerCase() as TransactionBroker | undefined;
  const [brokerFilter, setBrokerFilter] = useState<BrokerFilter>(initialBroker ?? "all");
  const [stateFilter, setStateFilter] = useState<StateFilter>("active");
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const today = toLocalISODate(new Date());

  useEffect(() => {
    if (CONTACT_BROKERS.includes(queryBroker as TransactionBroker)) setBrokerFilter(queryBroker as TransactionBroker);
  }, [queryBroker]);

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
    return transactions.filter((transaction) => {
      if (brokerFilter !== "all" && transaction.broker !== brokerFilter) return false;
      if (stateFilter === "active" ? isTransactionCompleted(transaction) : !isTransactionCompleted(transaction)) return false;
      const contactNames = transaction.contactIds.map((contactId) => {
        const contact = contacts.find((item) => item.id === contactId);
        return contact ? getContactName(contact) : "";
      }).join(" ");
      return transactionMatchesSearch(transaction, contactNames, search);
    });
  }, [brokerFilter, contacts, search, stateFilter, transactions]);

  return (
    <main className="transactions-page">
      <div className="transactions-shell">
        <header className="transactions-header">
          <div><p className="section-kicker">Dossiers immobiliers</p><h1>TRANSACTIONS</h1><p>Les dossiers, leurs clients et leurs prochaines dates importantes.</p></div>
          <button className="transaction-new" onClick={() => setIsCreating(true)} type="button">+ Nouvelle transaction</button>
        </header>

        <section className="transactions-controls" aria-label="Filtres des transactions">
          <div className="transaction-filter-group">{(["all", ...CONTACT_BROKERS] as BrokerFilter[]).map((broker) => <button aria-pressed={brokerFilter === broker} key={broker} onClick={() => setBrokerFilter(broker)} type="button">{broker === "all" ? "Tous" : BROKER_LABELS[broker]}</button>)}</div>
          <div className="transaction-filter-group transaction-state-filter"><button aria-pressed={stateFilter === "active"} onClick={() => setStateFilter("active")} type="button">Actives</button><button aria-pressed={stateFilter === "completed"} onClick={() => setStateFilter("completed")} type="button">Terminées</button></div>
          <label className="transactions-search"><span aria-hidden="true">⌕</span><input aria-label="Rechercher par adresse, numéro Centris ou client" onChange={(event) => setSearch(event.target.value)} placeholder="Adresse, Centris ou client" type="search" value={search} /></label>
        </section>

        {error && <div className="transaction-status transaction-status-error" role="alert"><span>{error}</span><button onClick={() => void retry()} type="button">Réessayer</button></div>}
        {isLoading && <div className="transaction-status">Chargement des transactions…</div>}

        <section className="transaction-grid" aria-live="polite">
          {visibleTransactions.map((transaction) => {
            const linkedContacts = transaction.contactIds.map((contactId) => contacts.find((contact) => contact.id === contactId)).filter(Boolean);
            const nextDeadline = getNextTransactionDeadline(transaction);
            const isOverdue = Boolean(nextDeadline && nextDeadline.dueDate < today);
            return <article className={`transaction-card ${isOverdue ? "transaction-card-overdue" : ""}`} key={transaction.id}>
              <div className="transaction-card-top"><span>{TRANSACTION_TYPE_LABELS[transaction.type]}</span><span className={`transaction-status-badge status-${transaction.status}`}>{TRANSACTION_STATUS_LABELS[transaction.status]}</span></div>
              <h2>{transaction.address}</h2>
              <dl><div><dt>Clients</dt><dd>{linkedContacts.length ? linkedContacts.map((contact) => getContactName(contact!)).join(" · ") : "Aucun contact lié"}</dd></div><div><dt>Courtier</dt><dd>{BROKER_LABELS[transaction.broker]}</dd></div><div><dt>Prochaine échéance</dt><dd className={isOverdue ? "transaction-deadline-overdue" : ""}>{isOverdue && <strong>EN RETARD · </strong>}{nextDeadline ? `${nextDeadline.title} · ${formatDate(nextDeadline.dueDate)}` : "Aucune échéance"}</dd></div></dl>
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
