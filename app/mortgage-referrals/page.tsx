"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useBroker } from "../broker-context";
import { referralContactName, referralMatchesSearch, type MortgageReferral, type ReferralTransaction } from "../data/mortgage-referral-types";
import type { TransactionBroker } from "../data/transaction-types";
import { currentTorontoDateTime } from "../lib/transactions/deadline-time";
import { workspaceRequest } from "../lib/workspace-request";
import { paymentAmount, paymentDate, paymentMoney, paymentSummary } from "../lib/mortgage-referrals/payments";
import "./referrals.css";

const returnQuery = "?returnTo=%2Fmortgage-referrals";
function formatDate(value: string, time = false) {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", day: "numeric", month: "long", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(value));
}
async function api(path: string, init?: RequestInit) {
  const response = await (init?.method ? workspaceRequest : fetch)(`/api/mortgage-referrals${path}`, { cache: "no-store", ...init });
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
  const [view, setView] = useState<'upcoming'|'paid'>('upcoming');
  const [year, setYear] = useState(() => Number(currentTorontoDateTime().date.slice(0,4)));
  const [payment, setPayment] = useState<MortgageReferral | null>(null);
  const [cancelling, setCancelling] = useState<MortgageReferral | null>(null);
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
      setEditor(null); setFollowUp(null); setDeleting(null); setPayment(null); setCancelling(null); setRefresh(value => value + 1);
    } catch (error) { setModalError(error instanceof Error ? error.message : "Opération impossible."); }
    finally { saving.current = false; setBusy(false); }
  }
  const summary = paymentSummary(rows, broker, year);
  const visible = rows.filter(row => row.broker === broker && (view === 'upcoming' ? !row.paid_at : row.paid_at?.slice(0,4) === String(year)) && referralMatchesSearch(row, search));
  const open = (action: () => void) => { setModalError(""); action(); };
  const feedback = modalError && <p role="alert" className="referral-error">{modalError}{modalError.includes("connecté") && <> <a href="/settings">Ouvrir les paramètres Google Agenda</a></>}</p>;
  return <main className="transactions-page referral-page"><div className="transactions-shell">
    <header className="transactions-header"><div><p className="section-kicker">SUIVI DES CLIENTS RÉFÉRÉS EN FINANCEMENT</p><h1>RÉFÉRENCES HYPOTHÉCAIRES</h1><p className="referral-broker">COURTIER CONSULTÉ <strong>{label.toUpperCase()}</strong></p></div><button className="transaction-new" onClick={() => open(() => setEditor("new"))}>+ AJOUTER UNE RÉFÉRENCE</button></header>
    <section className="referral-payment-summary" aria-label="Paiements des références">
      <nav className="referral-payment-tabs" aria-label="Statut du paiement"><button aria-pressed={view==='upcoming'} onClick={()=>setView('upcoming')}>À venir <span>{loading?'—':summary.upcoming}</span></button><button aria-pressed={view==='paid'} onClick={()=>setView('paid')}>Payé <span>{loading?'—':summary.paid}</span></button></nav>
      <div className="referral-annual"><div><p>Revenus reçus en {year}</p><strong aria-live="polite">{loading||error?'—':paymentMoney(summary.amount)}</strong><small>{loading?'Chargement…':`${summary.paid} référence${summary.paid!==1?'s':''} payée${summary.paid!==1?'s':''}`}</small></div><div className="referral-year"><button aria-label="Année précédente" disabled={year<=1900} onClick={()=>setYear(y=>y-1)}>‹</button><span>{year}</span><button aria-label="Année suivante" disabled={year>=9999} onClick={()=>setYear(y=>y+1)}>›</button></div></div>
    </section>
    <div className="referral-toolbar"><label>RECHERCHER<input type="search" placeholder="Transaction, client, responsable, institution" value={search} onChange={event => setSearch(event.target.value)} /></label><span className="referral-muted">{visible.length} référence{visible.length !== 1 ? "s" : ""}</span></div>
    {error && <p role="alert" className="referral-error">{error} <button onClick={() => setRefresh(value => value + 1)}>Réessayer</button></p>}
    {loading ? <p role="status">Chargement des références…</p> : <div className="referral-table-wrap"><table className="referral-table"><thead><tr>{["TRANSACTION", "CONTACT(S)", "RESPONSABLE HYPOTHÉCAIRE", "BANQUE / INSTITUTION", view==='paid'?"PAYÉ LE":"DATE DE CRÉATION", view==='paid'?"MONTANT":"SUIVI", "ACTIONS"].map(title => <th scope="col" key={title}>{title}</th>)}</tr></thead><tbody>
      {visible.map(row => <tr key={row.id}>
        <td data-label="TRANSACTION"><a href={`/transactions/${row.transaction_id}${returnQuery}`}>{row.transactions.address}</a></td>
        <td data-label="CONTACT(S)"><Contacts transaction={row.transactions} /></td>
        <td data-label="RESPONSABLE HYPOTHÉCAIRE">{row.mortgage_advisor_name}</td>
        <td data-label="BANQUE / INSTITUTION">{row.institution_name}</td>
        <td data-label={view==='paid'?"PAYÉ LE":"DATE DE CRÉATION"}>{formatDate(row.paid_at ? `${row.paid_at}T12:00:00` : row.created_at)}</td>
        <td data-label={view==='paid'?"MONTANT":"SUIVI"}>{view==='paid'?<strong className="referral-payment-amount">{paymentMoney(row.paid_amount!)}</strong>:<div className="referral-actions">{row.follow_up_at && <time dateTime={row.follow_up_at}>{formatDate(row.follow_up_at, true)}</time>}<button onClick={() => open(() => setFollowUp(row))}>{row.follow_up_at ? "MODIFIER SUIVI" : "PLANIFIER"}</button></div>}</td>
        <td data-label="ACTIONS"><div className="referral-actions">{row.paid_at?<><button className="referral-pay" onClick={()=>open(()=>setPayment(row))}>Modifier le paiement</button><button onClick={()=>open(()=>setCancelling(row))}>Remettre à venir</button>{row.follow_up_at&&<button onClick={()=>open(()=>setFollowUp(row))}>MODIFIER SUIVI</button>}</>:<button className="referral-pay" onClick={()=>open(()=>setPayment(row))}>Payé</button>}<button onClick={() => open(() => setEditor(row))}>MODIFIER</button><button className="referral-delete" onClick={() => open(() => setDeleting(row))}>SUPPRIMER</button></div></td>
      </tr>)}
    </tbody></table>{!visible.length && <div className="transactions-empty"><h2>{search ? "Aucun résultat" : view==='paid'?`Aucun paiement en ${year}`:"Aucune référence à venir"}</h2><p>{search ? "Modifiez votre recherche." : view==='paid'?"Seuls les paiements confirmés figurent dans cette vue.":`Les références de ${label} restent ici jusqu’au paiement.`}</p></div>}</div>}
  </div>
  {payment && <PaymentEditor row={payment} busy={busy} close={()=>setPayment(null)} feedback={feedback} save={body=>save(`/${payment.id}`,"PATCH",body)} />}
  {cancelling && <Modal title="Annuler ce paiement ?" busy={busy} close={()=>setCancelling(null)}><p>{cancelling.transactions.address}</p><p>Cette référence retournera dans À venir et son montant ne sera plus comptabilisé dans les revenus.</p>{feedback}<footer><button disabled={busy} onClick={()=>setCancelling(null)}>Annuler</button><button className="referral-delete" disabled={busy} onClick={()=>void save(`/${cancelling.id}`,"PATCH",{action:'cancel-payment',confirm:true,payment_version:cancelling.payment_version})}>{busy?'Enregistrement…':'Confirmer'}</button></footer></Modal>}
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

function PaymentEditor({row,busy,close,feedback,save}:{row:MortgageReferral;busy:boolean;close:()=>void;feedback:ReactNode;save:(body:object)=>Promise<void>}) {
  const [error,setError] = useState('');
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setError('');const data=new FormData(event.currentTarget);
    try { const amount=paymentAmount(data.get('amount')),date=paymentDate(data.get('paid_at'));
      void save({action:'payment',paid_amount:amount,paid_at:date,payment_version:row.payment_version});
    } catch(e) {setError((e as Error).message);}
  }
  return <Modal title={row.paid_at?'Modifier le paiement':'Paiement reçu'} busy={busy} close={close}><div className="referral-payment-context"><strong>{row.transactions.address}</strong><p>{row.institution_name}</p></div><form onSubmit={submit} noValidate><fieldset disabled={busy}>
    <label>MONTANT REÇU (CAD)<input name="amount" autoFocus inputMode="decimal" placeholder="0,00" defaultValue={row.paid_amount==null?'':String(row.paid_amount).replace('.',',')} /></label>
    <label>DATE DU PAIEMENT<input name="paid_at" type="date" min="1900-01-01" max="9999-12-31" defaultValue={row.paid_at??currentTorontoDateTime().date}/></label>
    {row.payment_updated_at&&<p className="referral-muted">Dernière confirmation : {formatDate(row.payment_updated_at,true)} · {row.payment_updated_by}</p>}
    {error&&<p className="referral-error" role="alert">{error}</p>}{feedback}<footer><button type="button" onClick={close}>Annuler</button><button type="submit" className="transaction-new">{busy?'Enregistrement…':row.paid_at?'Enregistrer le paiement':'Confirmer le paiement'}</button></footer>
  </fieldset></form></Modal>;
}
