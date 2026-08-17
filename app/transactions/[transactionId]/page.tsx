"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useContacts } from "../../contacts-context";
import { BROKER_LABELS, getContactName } from "../../data/contact-types";
import {
  DEADLINE_PRESETS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  statusesForTransaction,
  type TransactionDeadline,
  type TransactionStatus,
} from "../../data/transaction-types";
import { toLocalISODate } from "../../lib/follow-up";
import { useTransactions } from "../../transactions-context";
import { useDialogLifecycle } from "../../lib/use-dialog-lifecycle";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    .format(new Date(value));
}

function DeadlineModal({
  initial,
  isSaving,
  onClose,
  onSave,
}: {
  initial?: TransactionDeadline;
  isSaving: boolean;
  onClose: () => void;
  onSave: (values: { title: string; dueDate: string; syncToGoogle: boolean }) => Promise<void>;
}) {
  const isPreset = initial ? DEADLINE_PRESETS.includes(initial.title as (typeof DEADLINE_PRESETS)[number]) : true;
  const [choice, setChoice] = useState(initial && isPreset ? initial.title : DEADLINE_PRESETS[0]);
  const [customTitle, setCustomTitle] = useState(initial && !isPreset ? initial.title : "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [syncToGoogle, setSyncToGoogle] = useState(Boolean(initial?.googleCalendarEventId));
  const [error, setError] = useState<string | null>(null);
  useDialogLifecycle(true, onClose);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const title = choice === "custom" ? customTitle.trim() : choice;
    if (!title || !dueDate) return setError("Ajoutez un titre et une date.");
    try { await onSave({ title, dueDate, syncToGoogle }); }
    catch { setError("L’échéance n’a pas pu être enregistrée."); }
  }

  return <div className="transaction-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation"><section aria-labelledby="deadline-modal-title" aria-modal="true" className="transaction-modal deadline-modal" role="dialog">
    <div className="transaction-modal-heading"><div><p className="section-kicker">Date importante</p><h2 id="deadline-modal-title">{initial ? "MODIFIER L’ÉCHÉANCE" : "AJOUTER UNE ÉCHÉANCE"}</h2></div><button aria-label="Fermer" onClick={onClose} type="button">×</button></div>
    <form className="deadline-form" onSubmit={submit}>
      <div className="deadline-presets">{DEADLINE_PRESETS.map((preset) => <button aria-pressed={choice === preset} key={preset} onClick={() => setChoice(preset)} type="button">{preset}</button>)}<button aria-pressed={choice === "custom"} onClick={() => setChoice("custom")} type="button">Titre personnalisé</button></div>
      {choice === "custom" && <label className="transaction-field"><span>Titre</span><input autoFocus onChange={(event) => setCustomTitle(event.target.value)} value={customTitle} /></label>}
      <label className="transaction-field"><span>Date</span><input onChange={(event) => setDueDate(event.target.value)} required type="date" value={dueDate} /></label>
      <label className="deadline-calendar-choice"><input checked={syncToGoogle} onChange={(event) => setSyncToGoogle(event.target.checked)} type="checkbox" /><span>Ajouter à Google Agenda du courtier responsable</span></label>
      {error && <p className="transaction-form-error" role="alert">{error}</p>}
      <div className="transaction-form-actions"><button onClick={onClose} type="button">Annuler</button><button className="transaction-submit" disabled={isSaving} type="submit">Enregistrer</button></div>
    </form>
  </section></div>;
}

export default function TransactionDetailPage() {
  const params = useParams<{ transactionId: string }>();
  const router = useRouter();
  const { contacts } = useContacts();
  const { transactions, isLoading, isSaving, error, updateStatus, addDeadline, updateDeadline, deleteDeadline, addNote } = useTransactions();
  const transaction = transactions.find((item) => item.id === params.transactionId);
  const linkedContacts = useMemo(() => transaction?.contactIds.map((id) => contacts.find((contact) => contact.id === id)).filter(Boolean) ?? [], [contacts, transaction]);
  const [deadlineModal, setDeadlineModal] = useState<"new" | TransactionDeadline | null>(null);
  const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const today = toLocalISODate(new Date());

  useEffect(() => {
    if (!confirmation) return;
    const timeout = window.setTimeout(() => setConfirmation(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [confirmation]);

  if (isLoading && !transaction) return <main className="transactions-page"><div className="transactions-shell"><div className="transaction-status">Chargement de la transaction…</div></div></main>;
  if (!transaction) return <main className="transactions-page"><div className="transactions-shell"><div className="transactions-empty"><h1>Transaction introuvable</h1><button onClick={() => router.push("/transactions")} type="button">Retour aux transactions</button></div></div></main>;

  async function saveDeadline(values: { title: string; dueDate: string; syncToGoogle: boolean }) {
    const result = deadlineModal === "new"
      ? await addDeadline(transaction!.id, values.title, values.dueDate, values.syncToGoogle)
      : await updateDeadline(transaction!.id, deadlineModal!.id, values);
    setDeadlineModal(null);
    setConfirmation(result.message ?? "Échéance enregistrée.");
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    await addNote(transaction!.id, note.trim());
    setNote("");
    setConfirmation("Note ajoutée à la transaction.");
  }

  return <main className="transaction-detail-page"><div className="transaction-detail-shell">
    {error && <div className="transaction-status transaction-status-error" role="alert">{error}</div>}
    {confirmation && <div aria-live="polite" className="follow-up-confirmation" role="status"><span aria-hidden="true">✓</span><strong>{confirmation}</strong></div>}

    <header className="transaction-detail-header"><div><p className="section-kicker">{TRANSACTION_TYPE_LABELS[transaction.type]} · {BROKER_LABELS[transaction.broker]}</p><h1>{transaction.address}</h1><p>{linkedContacts.length ? linkedContacts.map((contact) => getContactName(contact!)).join(" · ") : "Aucun client lié"}</p></div><label><span>Statut actuel</span><select disabled={isSaving} onChange={(event) => void updateStatus(transaction.id, event.target.value as TransactionStatus)} value={transaction.status}>{statusesForTransaction(transaction.type).map((status) => <option key={status} value={status}>{TRANSACTION_STATUS_LABELS[status]}</option>)}</select></label></header>

    <section className="transaction-overview" aria-label="Résumé de la transaction">
      <article><span>Type</span><strong>{TRANSACTION_TYPE_LABELS[transaction.type]}</strong></article>
      <article><span>Prix</span><strong>{transaction.price === null ? "Non renseigné" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(transaction.price)}</strong></article>
      <article><span>Date de la PA</span><strong>{transaction.promiseDate ? formatDate(transaction.promiseDate) : "Non renseignée"}</strong></article>
      <article><span>Courtier responsable</span><strong>{BROKER_LABELS[transaction.broker]}</strong></article>
    </section>

    <section className="transaction-detail-section" aria-labelledby="transaction-clients-title"><div className="transaction-section-heading"><div><p className="section-kicker">Relations</p><h2 id="transaction-clients-title">CLIENTS LIÉS</h2></div></div><div className="transaction-linked-clients">{linkedContacts.map((contact) => <button key={contact!.id} onClick={() => router.push(`/contacts/${contact!.id}`)} type="button"><span>{getContactName(contact!)}</span><small>{BROKER_LABELS[contact!.broker]}</small><strong>Ouvrir →</strong></button>)}{linkedContacts.length === 0 && <p>Aucun contact lié à cette transaction.</p>}</div></section>

    <section className="transaction-detail-section" aria-labelledby="transaction-deadlines-title"><div className="transaction-section-heading"><div><p className="section-kicker">Suivi du dossier</p><h2 id="transaction-deadlines-title">DATES IMPORTANTES</h2></div><button className="transaction-add-deadline" onClick={() => setDeadlineModal("new")} type="button">+ Ajouter une échéance</button></div><div className="transaction-deadlines">{transaction.deadlines.map((deadline) => { const overdue = !deadline.completed && deadline.dueDate < today; return <article className={deadline.completed ? "deadline-completed" : ""} key={deadline.id}><label><input checked={deadline.completed} onChange={(event) => void updateDeadline(transaction.id, deadline.id, { completed: event.target.checked })} type="checkbox" /><span aria-hidden="true" /></label><div><div className="deadline-title-line"><h3>{deadline.title}</h3>{overdue && <strong>EN RETARD</strong>}</div><p>{formatDate(deadline.dueDate)}</p><small className={`calendar-deadline-state calendar-${deadline.googleCalendarSyncStatus}`}>{deadline.googleCalendarEventId ? "Google Agenda · " : ""}{deadline.googleCalendarSyncStatus === "synced" ? "Synchronisé" : deadline.googleCalendarLastError ?? "En attente"}</small></div><div className="deadline-actions"><button onClick={() => setDeadlineModal(deadline)} type="button">Modifier</button><button onClick={async () => { if (window.confirm("Supprimer cette échéance ?")) { const result = await deleteDeadline(transaction.id, deadline.id); setConfirmation(result.message ?? "Échéance supprimée."); } }} type="button">Supprimer</button></div></article>; })}{transaction.deadlines.length === 0 && <div className="transaction-section-empty">Aucune échéance pour le moment.</div>}</div></section>

    <section className="transaction-detail-section" aria-labelledby="transaction-notes-title"><div className="transaction-section-heading"><div><p className="section-kicker">Dossier</p><h2 id="transaction-notes-title">NOTES DE TRANSACTION</h2></div></div>{transaction.generalNotes && <article className="transaction-general-note"><span>Notes générales</span><p>{transaction.generalNotes}</p></article>}<form className="transaction-note-form" onSubmit={saveNote}><label><span>Ajouter une note</span><textarea onChange={(event) => setNote(event.target.value)} placeholder="Écrivez une note liée à cette transaction…" rows={4} value={note} /></label><button disabled={isSaving || !note.trim()} type="submit">Enregistrer la note</button></form><div className="transaction-notes-list">{transaction.notes.map((item) => <article key={item.id}><time>{formatDateTime(item.createdAt)}</time><p>{item.content}</p></article>)}{transaction.notes.length === 0 && <p>Aucune note de transaction pour le moment.</p>}</div></section>
  </div>{deadlineModal && <DeadlineModal initial={deadlineModal === "new" ? undefined : deadlineModal} isSaving={isSaving} onClose={() => setDeadlineModal(null)} onSave={saveDeadline} />}</main>;
}
