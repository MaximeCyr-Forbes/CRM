import { getContactName, type Contact } from "../data/contact-types";
import { getNextTransactionDeadline, TRANSACTION_STATUS_LABELS, type Transaction } from "../data/transaction-types";
import { formatTransactionDeadlineTime } from "../lib/transactions/deadline-time";
import { ShellIcon } from "../components/shell-icons";

export function dashboardDate(date: string) {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
}

export function DashboardTransactions({ transactions, contacts, loading, error, onNavigate }: {
  transactions: readonly Transaction[]; contacts: readonly Contact[]; loading: boolean; error: string | null; onNavigate: (href: string) => void;
}) {
  return <section className="dash-panel dash-transactions" aria-labelledby="dash-transactions-title">
    <header className="dash-panel-heading"><div><p>Dossiers actifs</p><h2 id="dash-transactions-title">Transactions en cours</h2></div><button className="dash-text-button" onClick={() => onNavigate("/transactions")} type="button">Voir toutes <span aria-hidden="true">↗</span></button></header>
    {loading ? <p className="dash-empty" role="status">Chargement des transactions…</p> : error ? <p className="dash-error" role="status">{error}</p> : transactions.length === 0 ? <p className="dash-empty">Aucune transaction en cours pour ce courtier.</p> : <div className="dash-transaction-list">
      {transactions.slice(0, 4).map(transaction => {
        const deadline = getNextTransactionDeadline(transaction);
        const names = transaction.contactIds.map(id => contacts.find(contact => contact.id === id)).filter((contact): contact is Contact => Boolean(contact)).map(getContactName);
        return <button className="dash-transaction" key={transaction.id} onClick={() => onNavigate(`/transactions/${transaction.id}`)} type="button">
          <span className="dash-property-icon" aria-hidden="true"><ShellIcon name="Listings" /></span>
          <span className="dash-transaction-body"><strong>{transaction.address}</strong><span className="dash-transaction-meta"><span className={`dash-status dash-status-${transaction.status}`}>{TRANSACTION_STATUS_LABELS[transaction.status]}</span>{transaction.price !== null && <span className="dash-price">{new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(transaction.price)}</span>}</span>{names.length > 0 && <span className="dash-contact-names">{names.join(" · ")}</span>}
          {deadline && <span className="dash-next-deadline">{deadline.title} · <time dateTime={deadline.dueDate}>{dashboardDate(deadline.dueDate)}</time>{deadline.dueTime && ` · ${formatTransactionDeadlineTime(deadline.dueTime)}`}</span>}</span>
          <span className="dash-row-arrow" aria-hidden="true">↗</span>
        </button>;
      })}
    </div>}
  </section>;
}

export function DashboardActions({ queue, transactions, loading, unavailable, today, onNavigate }: {
  queue: readonly Contact[]; transactions: readonly Transaction[]; loading: boolean; unavailable: boolean; today: string; onNavigate: (href: string) => void;
}) {
  // Read-only presentation of existing follow-ups and the existing next-deadline helper.
  const actions = [
    ...queue.map(contact => ({ id: `contact-${contact.id}`, title: getContactName(contact), detail: "Relance", date: contact.nextFollowUpDate!, href: `/contacts/${contact.id}?mode=followups`, icon: "Contacts" })),
    ...transactions.flatMap(transaction => {
      const deadline = getNextTransactionDeadline(transaction);
      return deadline ? [{ id: `deadline-${deadline.id}`, title: deadline.title, detail: transaction.address, date: deadline.dueDate, href: `/transactions/${transaction.id}`, icon: "Calendrier" }] : [];
    }),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  return <section className="dash-panel dash-actions" aria-labelledby="dash-actions-title">
    <header className="dash-panel-heading"><div><p>À votre agenda</p><h2 id="dash-actions-title">Prochaines actions</h2></div><ShellIcon name="Calendrier" /></header>
    {loading ? <p className="dash-empty" role="status">Chargement de vos actions…</p> : <>
      {actions.length === 0 && <p className="dash-empty">{unavailable ? "Certaines actions sont temporairement indisponibles." : "Aucune relance ni échéance en attente."}</p>}
      {actions.map(action => <button className="dash-action" key={action.id} onClick={() => onNavigate(action.href)} type="button"><span className="dash-action-icon" aria-hidden="true"><ShellIcon name={action.icon} /></span><span className="dash-action-body"><strong>{action.title}</strong><span>{action.detail}</span><time className={action.date < today ? "dash-date-late" : ""} dateTime={action.date}>{action.date < today ? "En retard · " : ""}{action.date === today ? "Aujourd’hui" : dashboardDate(action.date)}</time></span><span className="dash-row-arrow" aria-hidden="true">↗</span></button>)}
      {unavailable && actions.length > 0 && <p className="dash-data-warning" role="status">Certaines actions sont temporairement indisponibles.</p>}
    </>}
  </section>;
}
