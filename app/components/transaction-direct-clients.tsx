"use client";

import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { DIRECT_CLIENT_SOURCES, directClientToday, type DirectClient, type DirectClientDraft } from "../lib/transactions/direct-clients";
import { workspaceRequest } from "../lib/workspace-request";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

import { ShellIcon } from './shell-icons';
import { directClientEmailValid } from '../lib/transactions/direct-client-email';
const EmailModal = lazy(() => import('./direct-client-email-modal'));
const CaptureModal = lazy(() => import("./direct-client-capture-modal"));
const emptyDraft = (): DirectClientDraft => ({ name: "", phone: null, email: null, source: "Centris", request_date: directClientToday(), request_note: null });
function displayDate(value: string) {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function ClientDialog({ initial, removing, endpoint, onClose, onSaved, onDeleted }: {
  initial?: DirectClient; removing: boolean; endpoint: string; onClose: () => void;
  onSaved: (client: DirectClient, next: boolean) => void; onDeleted: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const focusNext = useRef(false);
  const [draft, setDraft] = useState<DirectClientDraft>(() => initial ?? emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<DirectClient[]>([]);
  const [continueAfterSave, setContinueAfterSave] = useState(false);
  useEffect(() => { if (!saving && focusNext.current) { focusNext.current = false; nameInput.current?.focus(); } }, [saving]);
  const close = () => { if (!inFlight.current) onClose(); };
  useDialogLifecycle(true, close);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  function change(key: keyof DirectClientDraft, value: string) {
    setDraft(current => ({ ...current, [key]: value })); setDuplicates([]); setError("");
  }
  async function save(next: boolean, force = false) {
    if (inFlight.current) return;
    inFlight.current = true; setSaving(true); setError(""); setContinueAfterSave(next);
    try {
      const response = await workspaceRequest(endpoint, {
        method: removing ? "DELETE" : initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(removing ? { id: initial!.id, confirm: true } : { ...draft, id: initial?.id, allowDuplicate: force }),
      });
      const payload = await response.json();
      if (response.status === 409 && payload.duplicates) { setDuplicates(payload.duplicates); return; }
      if (!response.ok) throw new Error(payload.error ?? "Enregistrement impossible.");
      if (removing) onDeleted(initial!.id);
      else {
        onSaved(payload.data, next);
        if (next) { setDraft(emptyDraft()); setDuplicates([]); focusNext.current = true; }
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Enregistrement impossible."); }
    finally { inFlight.current = false; setSaving(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-next") === "true";
    void save(next);
  }
  return <dialog ref={dialog} className="transaction-modal direct-client-dialog" aria-labelledby="direct-client-dialog-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="transaction-modal-heading"><h2 id="direct-client-dialog-title">{removing ? "Supprimer ce client ?" : initial ? "Modifier le client direct" : "Ajouter un client direct"}</h2><button type="button" aria-label="Fermer" disabled={saving} onClick={close}>×</button></div>
    <form className="direct-client-form" onSubmit={submit}>
      {removing ? <p>Supprimer <strong>{initial!.name}</strong> de cette transaction ?</p> : <fieldset disabled={saving}>
        <label className="transaction-field"><span>Nom</span><input ref={nameInput} autoFocus name="direct-client-name" required maxLength={200} value={draft.name} onChange={event => change("name", event.target.value)} /></label>
        <label className="transaction-field"><span>Téléphone <small>Facultatif</small></span><input name="direct-client-phone" type="tel" maxLength={80} value={draft.phone ?? ""} onChange={event => change("phone", event.target.value)} /></label>
        <label className="transaction-field"><span>Courriel <small>Facultatif</small></span><input name="direct-client-email" type="email" maxLength={254} value={draft.email ?? ""} onChange={event => change("email", event.target.value)} /></label>
        <label className="transaction-field"><span>Provenance</span><input name="direct-client-source" list="direct-client-sources" maxLength={80} value={draft.source ?? ""} onChange={event => change("source", event.target.value)} /><datalist id="direct-client-sources">{DIRECT_CLIENT_SOURCES.map(source => <option key={source} value={source} />)}</datalist></label>
        <label className="transaction-field"><span>Date de la demande</span><input name="direct-client-date" type="date" value={draft.request_date ?? ""} onChange={event => change("request_date", event.target.value)} /></label>
        <label className="transaction-field direct-client-note-field"><span>Nature de la demande</span><textarea name="direct-client-note" rows={3} maxLength={4000} value={draft.request_note ?? ""} onChange={event => change("request_note", event.target.value)} /></label>
      </fieldset>}
      {error && <p className="transaction-form-error" role="alert">{error}</p>}
      {duplicates.length > 0 && <div className="direct-client-warning" role="alert"><strong>Ce client semble déjà être dans la liste.</strong>{duplicates.slice(0, 3).map(client => <p key={client.id}>{client.name}<br />{client.email || client.phone}</p>)}</div>}
      <div className="transaction-form-actions">
        <button type="button" disabled={saving} onClick={close}>Annuler</button>
        {duplicates.length > 0 ? <button className="transaction-submit" type="button" disabled={saving} onClick={() => void save(continueAfterSave, true)}>{initial ? "Enregistrer quand même" : "Ajouter quand même"}</button> : <>
          {!initial && <button type="submit" data-next="true" disabled={saving}>Ajouter et suivant</button>}
          <button className={removing ? "destructive-button" : "transaction-submit"} disabled={saving} type="submit">{saving ? "Enregistrement…" : removing ? "Supprimer" : initial ? "Enregistrer" : "Ajouter"}</button>
        </>}
      </div>
    </form>
  </dialog>;
}

export function TransactionDirectClients({ transactionId }: { transactionId: string }) {
  const endpoint = `/api/transactions/${transactionId}/direct-clients`;
  const [clients, setClients] = useState<DirectClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const [capture, setCapture] = useState<{ file: File | null } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [emailOpen,setEmailOpen]=useState(false);
  const eligible=clients.filter(c=>directClientEmailValid(c.email));
  const emailSelected=eligible.filter(c=>selectedIds.includes(c.id));
  const [showAll, setShowAll] = useState(false);
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<{ client?: DirectClient; removing: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Chargement impossible.");
      if (!controller.signal.aborted) setClients(result.data);
    }).catch(caught => { if (!controller.signal.aborted) setError(caught.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, retry]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 4500); return () => window.clearTimeout(timer); }, [notice]);
  return <section className={`transaction-detail-section direct-clients ${dragging ? "direct-capture-target" : ""}`} aria-labelledby="direct-clients-title"
    onDragOver={event => { if (!loading && !error && event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
    onDrop={event => { event.preventDefault(); setDragging(false); if (!loading && !error && event.dataTransfer.files.length === 1) setCapture({ file: event.dataTransfer.files[0] }); }}>
    {dragging && <p className="direct-client-feedback">Déposez la capture ChatGPT</p>}
    <div className="direct-clients-heading"><div><h2 id="direct-clients-title">CLIENTS DIRECTS <span aria-label="Nombre de clients">{loading || error ? "—" : clients.length}</span></h2><p>{!loading && !error && clients.length === 0 ? "Aucun client direct enregistré." : "Demandes reçues directement pour cette propriété."}</p></div>
      <div className="direct-clients-actions"><button type="button" className="direct-email-trigger" disabled={!emailSelected.length} title={!emailSelected.length?'Sélectionnez au moins un client avec une adresse courriel.':undefined} onClick={()=>setEmailOpen(true)}><ShellIcon name="Courriels Auto"/>Envoyer un courriel{emailSelected.length?' · '+emailSelected.length:''}</button><button className="direct-capture-trigger" type="button" disabled={loading || Boolean(error)} onClick={() => setCapture({ file: null })}>Importer une capture</button><button type="button" aria-expanded={open} aria-controls="direct-clients-list" onClick={() => setOpen(!open)}>{open ? "Replier" : "Voir la liste"}</button><button type="button" disabled={loading || Boolean(error)} onClick={() => setEditor({ removing: false })}>+ Ajouter</button></div>
    </div>
    {notice && <p className="direct-client-feedback" role="status">{notice}</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Réessayer</button></p>}
    <div id="direct-clients-list" hidden={!open}>
      {clients.length>1&&<div className="direct-email-selection"><button type="button" disabled={!eligible.length} onClick={()=>setSelectedIds(emailSelected.length===eligible.length?[]:eligible.map(c=>c.id))}>{emailSelected.length===eligible.length&&eligible.length?'Tout désélectionner':'Tout sélectionner'}</button><span>{emailSelected.length} sélectionné{emailSelected.length>1?'s':''}</span></div>}
      {loading && <p role="status">Chargement…</p>}
      {(showAll ? clients : clients.slice(0, 6)).map(client => <article className={'direct-client-entry'+(emailSelected.some(c=>c.id===client.id)?' is-email-selected':'')} key={client.id}>
        <input className="direct-email-checkbox" type="checkbox" aria-label={'Sélectionner '+client.name+' pour un courriel'} title={directClientEmailValid(client.email)?'Sélectionner pour un courriel':'Adresse courriel absente ou invalide'} disabled={!directClientEmailValid(client.email)} checked={emailSelected.some(c=>c.id===client.id)} onChange={event=>setSelectedIds(ids=>event.target.checked?[...ids,client.id]:ids.filter(id=>id!==client.id))}/>
        <div><strong>{client.name}</strong><div className="direct-client-coordinates">{client.phone && <a href={`tel:${client.phone.replace(/[^\d+*#;,]/g, "")}`}>{client.phone}</a>}{client.email && <a href={`mailto:${client.email}`}>{client.email}</a>}</div>
          <div className="direct-client-meta">{client.source && <span>{client.source}</span>}{client.request_date && <time dateTime={client.request_date}>{displayDate(client.request_date)}</time>}</div>
          {client.request_note && <p className="direct-client-note">{client.request_note}</p>}
        </div>
        <div className="direct-clients-actions"><button type="button" onClick={() => setEditor({ client, removing: false })}>Modifier</button><button type="button" onClick={() => setEditor({ client, removing: true })}>Supprimer</button></div>
      </article>)}
      {clients.length > 6 && <button type="button" className="direct-client-more" onClick={() => setShowAll(!showAll)}>{showAll ? "Voir moins" : `Voir les ${clients.length} clients`}</button>}
    </div>
    {emailOpen&&<Suspense fallback={<p role="status">Ouverture du courriel…</p>}><EmailModal recipients={emailSelected.map(({id,name,email})=>({id,name,email}))} endpoint={endpoint} onClose={()=>setEmailOpen(false)} onComplete={ids=>{setSelectedIds(ids);setEmailOpen(false);}}/></Suspense>}
    {capture && <Suspense fallback={<p role="status">Ouverture de l’import…</p>}><CaptureModal initialFile={capture.file} existing={clients} endpoint={endpoint} onClose={() => setCapture(null)} onImported={imported => { setClients(current => [...imported, ...current.filter(row => !imported.some(item => item.id === row.id))]); setCapture(null); setOpen(true); setNotice(`${imported.length} clients ajoutés`); }} /></Suspense>}
    {editor && <ClientDialog initial={editor.client} removing={editor.removing} endpoint={endpoint} onClose={() => setEditor(null)}
      onSaved={(client, next) => { setClients(rows => editor.client ? rows.map(row => row.id === client.id ? client : row) : [client, ...rows]); setNotice(editor.client ? "Client mis à jour" : "Client ajouté"); if (!next) setEditor(null); }}
      onDeleted={id => { setClients(rows => rows.filter(row => row.id !== id)); setNotice("Client supprimé"); setEditor(null); }} />}
  </section>;
}
