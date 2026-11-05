"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {uniqueDirectEmailRecipients,type EmailRecipient,type DirectEmailResult,type DirectEmailPreview} from '../lib/transactions/direct-client-email';
import {restoreWorkspace} from '../lib/workspace';
import {workspaceRequest} from '../lib/workspace-request';
import {useDialogLifecycle} from '../lib/use-dialog-lifecycle';
import type {CalendarConnectionStatus} from '../data/calendar-types';
export default function DirectClientEmailModal({recipients,endpoint,onClose,onComplete}:{recipients:EmailRecipient[];endpoint:string;onClose:()=>void;onComplete:(failedIds:string[])=>void}){
 const dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false);
 const [sender]=useState(()=>restoreWorkspace(window.sessionStorage).workingBroker);
 const [selected,setSelected]=useState(()=>uniqueDirectEmailRecipients(recipients));
 const [subject,setSubject]=useState(''),[message,setMessage]=useState('Bonjour {{firstName}},\n\n'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [connection,setConnection]=useState<CalendarConnectionStatus|null>(null),[loading,setLoading]=useState(true);
 const [preview,setPreview]=useState<DirectEmailPreview|null>(null),[previewId,setPreviewId]=useState(''),[previewing,setPreviewing]=useState(false);
 const [result,setResult]=useState<DirectEmailResult|null>(null);
 const [attempt,setAttempt]=useState<{requestId:string;senderBroker:string;clientIds:string[];subjectTemplate:string;messageTemplate:string;fingerprints:Record<string,string>}|null>(null);
 const close=()=>{if(inFlight.current)return;if(result)onComplete(result.results.filter(r=>r.status==='failed').flatMap(r=>r.direct_client_id?[r.direct_client_id]:[]));else onClose();};
 useDialogLifecycle(true,close);
 useEffect(()=>{const d=dialog.current;d?.showModal();return()=>d?.close();},[]);
 useEffect(()=>{const controller=new AbortController();fetch('/api/google-calendar/connections',{cache:'no-store',signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>setConnection(data.connections.find((c:CalendarConnectionStatus)=>c.broker===sender)??null)).catch(()=>{if(!controller.signal.aborted)setError('Impossible de vérifier Gmail.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[sender]);
 async function send(event?:FormEvent){event?.preventDefault();if(inFlight.current||!sender)return;
  if(!attempt&&(!selected.length||!subject.trim()||!message.trim())){setError('Destinataire, objet et message requis.');return;}
  if(!attempt&&!preview){setError('Prévisualisez le courriel avant de confirmer.');return;}
  const body=attempt??{requestId:crypto.randomUUID(),senderBroker:sender,clientIds:selected.map(r=>r.id),subjectTemplate:subject,messageTemplate:message,fingerprints:Object.fromEntries((preview?.recipients??[]).map(r=>[r.id,r.fingerprint]))};
  setAttempt(body);inFlight.current=true;setBusy(true);setError('');
  try{const response=await workspaceRequest(endpoint+'/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const payload=await response.json();if(!response.ok)throw Error(payload.error||'Résultat non confirmé.');setResult(payload);}
  catch(e){setError(e instanceof Error?e.message:'Résultat non confirmé.');}
  finally{inFlight.current=false;setBusy(false);}
 }
 async function showPreview(){
  if(inFlight.current||!sender)return;
  inFlight.current=true;setPreviewing(true);setError('');
  try{const response=await workspaceRequest(endpoint+'/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preview:true,senderBroker:sender,clientIds:selected.map(r=>r.id),subjectTemplate:subject,messageTemplate:message})});const payload=await response.json();if(!response.ok)throw Error(payload.error||'Aperçu indisponible.');setPreview(payload);setPreviewId(payload.recipients[0]?.id??'');}
  catch(e){setError(e instanceof Error?e.message:'Aperçu indisponible.');}
  finally{inFlight.current=false;setPreviewing(false);}
 }
 const displayed=preview?.recipients.find(r=>r.id===previewId);
 const sendCount=preview?preview.recipients.filter(r=>!r.blockingReasons.length).length:selected.length;
 const ready=!!connection?.gmailSendEnabled&&!!connection?.gmailSignatureEnabled;
 const unresolved=result&&(result.pending>0||result.uncertain>0);
 return <dialog ref={dialog} className="transaction-modal direct-client-dialog direct-email-dialog" aria-labelledby="direct-email-title" onCancel={e=>{e.preventDefault();close();}}>
  <div className="transaction-modal-heading"><h2 id="direct-email-title">Envoyer un courriel</h2><button type="button" aria-label="Fermer" disabled={busy||previewing} onClick={close}>×</button></div>
  <form className="direct-client-form" onSubmit={send}>
   <p className="direct-email-help">{recipients.length} client{recipients.length>1?'s':''} sélectionné{recipients.length>1?'s':''} · {selected.length} adresse{selected.length>1?'s':''} unique{selected.length>1?'s':''}. Chaque personne reçoit son propre courriel.</p>
   {loading?<p role="status">Vérification de Gmail…</p>:<p className="direct-email-help">De : <strong>{connection?.email??sender??'Choisissez votre espace courtier'}</strong><br />La signature et le Reply-To Gmail habituels seront ajoutés automatiquement.</p>}
   {!loading&&!ready&&<p role="alert">Gmail ou sa signature n’est pas activé pour cet expéditeur. Vérifiez la connexion dans Paramètres.</p>}
   <div className="direct-email-recipients"><strong>Destinataires</strong>{selected.map(r=><div key={r.id}><span><strong>{r.name}</strong><small>{r.email}</small></span><button type="button" aria-label={'Retirer '+r.name} disabled={!!attempt||busy||previewing} onClick={()=>{setPreview(null);setSelected(rows=>rows.filter(x=>x.id!==r.id));}}>×</button></div>)}</div>
   <fieldset disabled={busy||previewing||!!attempt}>
    <label className="transaction-field direct-client-note-field"><span>Objet</span><input autoFocus name="direct-email-subject" required maxLength={250} value={subject} onChange={e=>{setSubject(e.target.value);setPreview(null);}}/></label>
    <label className="transaction-field direct-client-note-field"><span>Message</span><textarea name="direct-email-message" required rows={9} maxLength={100000} value={message} onChange={e=>{setMessage(e.target.value);setPreview(null);}}/></label>
   </fieldset>
   <p className="direct-email-help">{'Variables : {{firstName}} {{lastName}} {{fullName}} {{email}} {{phone}}'}</p>
   {!attempt&&<button type="button" disabled={busy||previewing||loading||!ready||!selected.length||!subject.trim()||!message.trim()} onClick={showPreview}>{previewing?'Prévisualisation…':'Prévisualiser avec la signature Gmail'}</button>}
   {preview&&<section aria-label="Prévisualisation du courriel">
    <label className="transaction-field"><span>Prévisualisation pour</span><select value={previewId} onChange={e=>setPreviewId(e.target.value)}>{preview.recipients.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
    <p className="direct-email-help">De : {preview.senderEmail} · {preview.recipients.filter(r=>!r.blockingReasons.length).length} prêt(s) · {preview.recipients.filter(r=>r.blockingReasons.length).length} bloqué(s)</p>
    {displayed&&<><strong>{displayed.subject}</strong>{displayed.blockingReasons.map(reason=><p role="alert" key={reason}>{reason}</p>)}<iframe title="Aperçu du courriel personnalisé" sandbox="" referrerPolicy="no-referrer" srcDoc={displayed.html} style={{width:'100%',minHeight:240,border:'1px solid #e5e7eb',background:'white'}} /></>}
   </section>}
   {error&&<p role="alert" className="transaction-form-error">{error}</p>}
   {result&&<div role="status" className="direct-email-result"><strong>{result.sent} courriel{result.sent>1?'s':''} envoyé{result.sent>1?'s':''} · {result.failed} échec{result.failed>1?'s':''}{unresolved?` · ${result.uncertain+result.pending} à vérifier`:''}</strong>
    {result.results.filter(r=>r.status!=='sent').map(r=><p key={r.id}>{r.recipient_name} — {r.recipient_email} : {r.status==='failed'?'échec':r.status==='pending'?'en attente':'résultat à vérifier dans Gmail Envoyés'}{r.error?' — '+r.error:''}</p>)}
    <p>Les messages réussis sont conservés dans Gmail Envoyés. Aucun envoi réussi ou incertain ne sera relancé automatiquement.</p>
   </div>}
   <div className="transaction-form-actions"><button type="button" disabled={busy||previewing} onClick={close}>{result?'Fermer':'Annuler'}</button>
    {(!result||unresolved)&&<button className="transaction-submit" type="submit" disabled={busy||previewing||loading||!ready||!selected.length||!subject.trim()||!message.trim()||(!attempt&&(!preview||!preview.recipients.some(r=>!r.blockingReasons.length)))}>{busy?'Envoi en cours…':attempt?'Vérifier le résultat':`Envoyer ${sendCount} courriel${sendCount>1?'s':''}`}</button>}
   </div>
  </form>
 </dialog>;
}
