"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useBroker } from "../broker-context";
import { referralContactName, referralMatchesSearch, type MortgageReferral, type ReferralTransaction } from "../data/mortgage-referral-types";
import type { TransactionBroker } from "../data/transaction-types";
import { currentTorontoDateTime } from "../lib/transactions/deadline-time";
import "./referrals.css";

const returnQuery = "?returnTo=%2Fmortgage-referrals";
function formatDate(value: string, time = false) {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", day: "numeric", month: "long", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(value));
}
async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api/mortgage-referrals${path}`, { cache: "no-store", ...init });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Opération impossible.");
  return result.data;
}
function Contacts({ transaction }: { transaction: ReferralTransaction }) {
  const contacts = transaction.transaction_contacts.flatMap(({ contacts }) => contacts ? [contacts] : []);
  return contacts.length ? <div className="referral-contacts">{contacts.map(contact => <a key={contact.id} href={`/contacts/${contact.id}${returnQuery}`}>{referralContactName(contact)}</a>)}</div> : <span className="referral-muted">Aucun contact lié</span>;
}
function Modal({ title, close, busy, children }: { title: string; close: () => void; busy: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="referral-modal" aria-labelledby="referral-modal-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <header><h2 id="referral-modal-title">{title}</h2><button type="button" aria-label="Fermer" disabled={busy} onClick={close}>×</button></header>{children}
  </dialog>;
}
export default function MortgageReferralsPage() {
  const { selectedBroker, isBrokerReady } = useBroker();
  if (!isBrokerReady) return <main className="transactions-page">Chargement…</main>;
  if (!selectedBroker) return <main className="transactions-page"><h1>RÉFÉRENCES HYPOTHÉCAIRES</h1><a href="/">Sélectionner un courtier</a></main>;
  // Remount the entire working surface synchronously on broker changes: neither
  // stale rows nor an open editor from the previous broker can remain visible.
  return <BrokerReferrals key={selectedBroker} broker={selectedBroker.toLowerCase() as TransactionBroker} label={selectedBroker} />;
}
function BrokerReferrals({ broker, label }: { broker: TransactionBroker; label: string }) {
  const [rows, setRows] = useState<MortgageReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<MortgageReferral | "new" | null>(null);
  const [followUp, setFollowUp] = useState<MortgageReferral | null>(null);
  const [deleting, setDeleting] = useState<MortgageReferral | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    api(`?broker=${broker}`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setRows(data); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [broker, refresh]);
  const saving = useRef(false);
  async function save(path: string, method: string, body: object) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setModalError("");
    try {
      await api(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ broker, ...body }) });
      setEditor(null); setFollowUp(null); setDeleting(null); setRefresh(value => value + 1);
    } catch (error) { setModalError(error instanceof Error ? error.message : "Opération impossible."); }
    finally { saving.current = false; setBusy(false); }
  }
  const visible = rows.filter(row => row.broker === broker && referralMatchesSearch(row, search));
  const open = (action: () => void) => { setModalError(""); action(); };
  const feedback = modalError && <p role="alert" className="referral-error">{modalError}{modalError.includes("connecté") && <> <a href="/settings">Ouvrir les paramètres Google Agenda</a></>}</p>;
  return <main className="transactions-page referral-page"><div className="transactions-shell">
    <header className="transactions-header"><div><p className="section-kicker">SUIVI DES CLIENTS RÉFÉRÉS EN FINANCEMENT</p><h1>RÉFÉRENCES HYPOTHÉCAIRES</h1><p className="referral-broker">COURTIER CONSULTÉ <strong>{label.toUpperCase()}</strong></p></div><button className="transaction-new" onClick={() => open(() => setEditor("new"))}>+ AJOUTER UNE RÉFÉRENCE</button></header>
    <div className="referral-toolbar"><label>RECHERCHER<input type="search" placeholder="Transaction, client, responsable, institution" value={search} onChange={event => setSearch(event.target.value)} /></label><span className="referral-muted">{visible.length} référence{visible.length !== 1 ? "s" : ""}</span></div>
    {error && <p role="alert" className="referral-error">{error} <button onClick={() => setRefresh(value => value + 1)}>Réessayer</button></p>}
    {loading ? <p role="status">Chargement des références…</p> : <div className="referral-table-wrap"><table className="referral-table"><thead><tr>{["TRANSACTION", "CONTACT(S)", "RESPONSABLE HYPOTHÉCAIRE", "BANQUE / INSTITUTION", "DATE DE CRÉATION", "SUIVI", "ACTIONS"].map(title => <th scope="col" key={title}>{title}</th>)}</tr></thead><tbody>
      {visible.map(row => <tr key={row.id}>
        <td data-label="TRANSACTION"><a href={`/transactions/${row.transaction_id}${returnQuery}`}>{row.transactions.address}</a></td>
        <td data-label="CONTACT(S)"><Contacts transaction={row.transactions} /></td>
        <td data-label="RESPONSABLE HYPOTHÉCAIRE">{row.mortgage_advisor_name}</td>
        <td data-label="BANQUE / INSTITUTION">{row.institution_name}</td>
        <td data-label="DATE DE CRÉATION">{formatDate(row.created_at)}</td>
        <td data-label="SUIVI"><div className="referral-actions">{row.follow_up_at && <time dateTime={row.follow_up_at}>{formatDate(row.follow_up_at, true)}</time>}<button onClick={() => open(() => setFollowUp(row))}>{row.follow_up_at ? "MODIFIER SUIVI" : "PLANIFIER"}</button></div></td>
        <td data-label="ACTIONS"><div className="referral-actions"><button onClick={() => open(() => setEditor(row))}>MODIFIER</button><button className="referral-delete" onClick={() => open(() => setDeleting(row))}>SUPPRIMER</button></div></td>
      </tr>)}
    </tbody></table>{!visible.length && <div className="transactions-empty"><h2>{search ? "Aucun résultat" : "Aucune référence hypothécaire"}</h2><p>{search ? "Modifiez votre recherche." : `Ajoutez la première référence de ${label}.`}</p></div>}</div>}
  </div>
  {editor && <ReferralEditor broker={broker} row={editor === "new" ? null : editor} busy={busy} close={() => setEditor(null)} feedback={feedback} save={body => save(editor === "new" ? "" : `/${editor.id}`, editor === "new" ? "POST" : "PATCH", body)} />}
  {followUp && <FollowUpEditor row={followUp} busy={busy} close={() => setFollowUp(null)} feedback={feedback} save={body => save(`/${followUp.id}`, "PATCH", body)} />}
  {deleting && <Modal title="SUPPRIMER LA RÉFÉRENCE" busy={busy} close={() => setDeleting(null)}><p>{deleting.transactions.address}</p><p>{deleting.google_event_id ? "Le suivi Google Agenda et cette référence seront supprimés." : "Cette référence sera supprimée."} La transaction et ses contacts seront conservés.</p>{feedback}<footer><button disabled={busy} onClick={() => setDeleting(null)}>Annuler</button><button disabled={busy} className="referral-delete" onClick={() => void save(`/${deleting.id}`, "DELETE", { confirm: true })}>{busy ? "Suppression…" : "Confirmer la suppression"}</button></footer></Modal>}
  </main>;
}
function ReferralEditor({ broker, row, busy, close, feedback, save }: { broker: TransactionBroker; row: MortgageReferral | null; busy: boolean; close: () => void; feedback: ReactNode; save: (body: object) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ReferralTransaction[]>([]);
  const [selected, setSelected] = useState<ReferralTransaction | null>(row?.transactions ?? null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (row) return;
    const controller = new AbortController();
    setOptions([]); setLoading(true);
    const timeout = setTimeout(() => {
      api(`?broker=${broker}&transactions=true&q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setOptions(data); setError(""); } })
        .catch(error => { if (!controller.signal.aborted) setError(error.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [broker, query, row]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) { setError("Sélectionnez une transaction."); return; }
    const data = new FormData(event.currentTarget);
    void save({ transaction_id: selected.id, mortgage_advisor_name: data.get("advisor"), institution_name: data.get("institution") });
  }
  return <Modal title={row ? "MODIFIER LA RÉFÉRENCE" : "NOUVELLE RÉFÉRENCE"} busy={busy} close={close}><form onSubmit={submit}><fieldset disabled={busy}>
    <label>TRANSACTION *{row ? <p>{row.transactions.address}</p> : <input type="search" placeholder="Rechercher une adresse ou un numéro Centris" value={query} onChange={event => setQuery(event.target.value)} />}</label>
    {!row && <div className="referral-options" aria-label="Transactions du courtier">{loading ? <p role="status">Recherche…</p> : options.length ? options.map(option => <button type="button" key={option.id} aria-pressed={selected?.id === option.id} onClick={() => setSelected(option)}>{option.address}{option.centris_number && <small>Centris {option.centris_number}</small>}</button>) : <p>Aucune transaction trouvée.</p>}<small>20 résultats maximum. Précisez la recherche au besoin.</small></div>}
    {selected && <div className="referral-linked"><strong>{selected.address}</strong><p>CONTACTS LIÉS</p><Contacts transaction={selected} /></div>}
    <label>RESPONSABLE HYPOTHÉCAIRE *<input name="advisor" required maxLength={200} defaultValue={row?.mortgage_advisor_name ?? ""} /></label>
    <label>BANQUE / INSTITUTION *<input name="institution" required maxLength={200} defaultValue={row?.institution_name ?? ""} /></label>
    {error && <p role="alert" className="referral-error">{error}</p>}{feedback}<footer><button type="button" onClick={close}>Annuler</button><button type="submit" className="transaction-new" disabled={!selected}>{busy ? "Enregistrement…" : "ENREGISTRER"}</button></footer>
  </fieldset></form></Modal>;
}
function FollowUpEditor({ row, busy, close, feedback, save }: { row: MortgageReferral; busy: boolean; close: () => void; feedback: ReactNode; save: (body: object) => Promise<void> }) {
  const initial = currentTorontoDateTime(row.follow_up_at ? new Date(row.follow_up_at) : new Date());
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    void save({ action: "follow-up", date: data.get("date"), time: data.get("time"), note: data.get("note") });
  }
  return <Modal title={row.follow_up_at ? "MODIFIER LE SUIVI" : "PLANIFIER UN SUIVI"} busy={busy} close={close}><p>{row.transactions.address}</p><form onSubmit={submit}><fieldset disabled={busy}>
    <div className="referral-date-time"><label>DATE *<input type="date" name="date" required defaultValue={initial.date} /></label><label>HEURE *<input type="time" name="time" required defaultValue={row.follow_up_at ? initial.time : "10:30"} /></label></div><p className="referral-muted">Heure de Montréal / Toronto · durée de 30 minutes</p>
    <label>NOTE (FACULTATIF)<textarea name="note" maxLength={1000} defaultValue={row.follow_up_note} /></label>{feedback}
    {row.google_event_link?.startsWith("https://www.google.com/calendar/") && <a href={row.google_event_link} target="_blank" rel="noreferrer">OUVRIR DANS GOOGLE AGENDA</a>}
    <footer><button type="button" onClick={close}>Annuler</button><button type="submit" className="transaction-new">{busy ? "Synchronisation…" : "ENREGISTRER LE SUIVI"}</button></footer>
    {row.follow_up_at && <button type="button" className="referral-delete" onClick={() => void save({ action: "remove-follow-up" })}>SUPPRIMER LE SUIVI</button>}
  </fieldset></form></Modal>;
}
