"use client";
import {useEffect,useRef,useState} from 'react';
import {useDialogLifecycle} from '../lib/use-dialog-lifecycle';
import type {DirectEmailHistory,DirectEmailHistoryEntry} from '../lib/transactions/direct-client-email';
const brokerLabels:Record<string,string>={maxime:'Maxime',france:'France',sandrine:'Sandrine'};
export default function DirectClientEmailHistory({endpoint,onClose}:{endpoint:string;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [entries,setEntries]=useState<DirectEmailHistoryEntry[]>([]),[offset,setOffset]=useState(0),[retry,setRetry]=useState(0);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[hasMore,setHasMore]=useState(false);
 useDialogLifecycle(true,onClose);
 useEffect(()=>{const d=dialog.current;d?.showModal();return()=>d?.close();},[]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
  fetch(`${endpoint}/email?offset=${offset}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Chargement impossible.');return data as DirectEmailHistory;}).then(data=>{if(controller.signal.aborted)return;setEntries(current=>offset===0?data.entries:[...current,...data.entries.filter(row=>!current.some(old=>old.id===row.id))]);setHasMore(data.hasMore);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Chargement impossible.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[endpoint,offset,retry]);
 return <dialog ref={dialog} className="transaction-modal direct-client-dialog direct-email-history" aria-labelledby="direct-email-history-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <div className="transaction-modal-heading"><h2 id="direct-email-history-title">Historique des courriels</h2><button type="button" aria-label="Fermer" onClick={onClose}>×</button></div>
  <div className="direct-email-history-body"><p className="direct-email-help">Courriels envoyés depuis Clients directs, du plus récent au plus ancien.</p>
   {entries.map(row=><article className="direct-email-history-entry" key={row.id}>
    <strong>{row.subject}</strong><span>{row.recipient_name}</span><small>{row.recipient_email}</small>
    <div><time dateTime={row.updated_at}>{new Intl.DateTimeFormat('fr-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Toronto'}).format(new Date(row.updated_at))}</time><span>Expéditeur : {brokerLabels[row.sender_broker]??row.sender_broker}</span></div>
   </article>)}
   {loading&&<p role="status">Chargement…</p>}
   {!loading&&!error&&!entries.length&&<p>Aucun courriel envoyé pour cette transaction.</p>}
   {error&&<p role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Réessayer</button></p>}
   {!loading&&!error&&hasMore&&<button type="button" onClick={()=>setOffset(n=>n+50)}>Voir plus</button>}
   <div className="transaction-form-actions"><button type="button" onClick={onClose}>Fermer</button></div>
  </div>
 </dialog>;
}
