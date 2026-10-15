"use client";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { directClientDuplicates, directClientToday, parseDirectClient, type DirectClient, type DirectClientDraft } from "../lib/transactions/direct-clients";
import { captureClientWarnings, type ImportClient } from "../lib/transactions/direct-client-capture";
import { workspaceRequest } from "../lib/workspace-request";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";
type Preview = ImportClient & { importId: string; selected: boolean; allowDuplicate: boolean };
const fields = [["name","Nom"],["phone","Téléphone"],["email","Courriel"],["source","Provenance"],["request_date","Date"],["request_note","Nature de la demande"]] as const;
export default function DirectClientCaptureModal({initialFile,existing,endpoint,onClose,onImported}: {
  initialFile:File|null;existing:DirectClient[];endpoint:string;onClose:()=>void;onImported:(clients:DirectClient[])=>void;
}) {
  const dialog=useRef<HTMLDialogElement>(null),picker=useRef<HTMLInputElement>(null),controller=useRef<AbortController|null>(null);
  const importing=useRef(false),generation=useRef(0);
  const [file,setFile]=useState<File|null>(initialFile),[image,setImage]=useState("");
  const [rows,setRows]=useState<Preview[]>([]),[known,setKnown]=useState(existing);
  const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[progress,setProgress]=useState("");
  const [error,setError]=useState(""),[warnings,setWarnings]=useState<string[]>([]),[drag,setDrag]=useState(false);
  function close(){if(importing.current)return;controller.current?.abort();onClose();}
  useDialogLifecycle(true,close);
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>{controller.current?.abort();node?.close();};},[]);
  useEffect(()=>{if(!file){setImage("");return;}const url=URL.createObjectURL(file);setImage(url);return()=>URL.revokeObjectURL(url);},[file]);
  useEffect(()=>{
    if(!file)return;
    const abort=new AbortController();controller.current=abort;const current=++generation.current;
    const timer=window.setTimeout(()=>abort.abort(),120000);
    setBusy(true);setRows([]);setError("");setWarnings([]);setProgress("Lecture de la capture…");
    void import("../lib/transactions/direct-client-capture-browser").then(module=>module.readClientCapture(file,directClientToday(),{signal:abort.signal,onProgress:setProgress})).then(result=>{
      if(current!==generation.current||abort.signal.aborted)return;
      setWarnings(result.warnings);
      setRows(result.clients.map(client=>({...client,importId:crypto.randomUUID(),selected:!directClientDuplicates(known,client).length&&!client.warnings.some(w=>!w.startsWith("Année supposée")),allowDuplicate:false})));
    }).catch(()=>{if(current===generation.current)setError(abort.signal.aborted ? "Lecture interrompue. Essayez une capture plus petite." : "Impossible de lire suffisamment de données. Choisissez une capture nette incluant les en-têtes et le tableau complet (PNG, JPG ou WEBP, maximum 12 Mo).");})
      .finally(()=>{window.clearTimeout(timer);if(current===generation.current)setBusy(false);});
    return()=>{generation.current++;abort.abort();window.clearTimeout(timer);};
  // Existing clients are snapshotted when a new capture starts.
  },[file]);
  function choose(next:File|undefined){if(!next||importing.current)return;controller.current?.abort();setFile(next);}
  function drop(event:DragEvent){event.preventDefault();event.stopPropagation();setDrag(false);if(event.dataTransfer.files.length!==1){setError("Déposez une seule capture à la fois.");return;}choose(event.dataTransfer.files[0]);}
  const selected=rows.filter(row=>row.selected);
  const invalid=selected.some(row=>{try{parseDirectClient(row);return false;}catch{return true;}});
  function edit(id:string,key:keyof DirectClientDraft,value:string){setRows(current=>current.map(row=>row.importId===id?{...row,[key]:value,allowDuplicate:false}:row));setError("");}
  async function save(){
    if(importing.current||!selected.length||invalid)return;
    importing.current=true;setSaving(true);setError("");
    try{
      const response=await workspaceRequest(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"import",clients:selected.map(row=>({...parseDirectClient(row),importId:row.importId,allowDuplicate:row.allowDuplicate}))})});
      const payload=await response.json();
      if(!response.ok){
        if(response.status===409){const refreshed=await fetch(endpoint,{cache:"no-store"}).then(r=>r.json());if(Array.isArray(refreshed.data)){setKnown(refreshed.data);setRows(current=>current.map(row=>directClientDuplicates(refreshed.data,row).length?{...row,selected:false,allowDuplicate:false}:row));}}
        throw new Error(payload.error||"Import impossible. Aucun succès n’a été confirmé.");
      }
      onImported(payload.data);
    }catch(caught){setError(caught instanceof Error?caught.message:"Import non confirmé. Réessayez : les lignes déjà enregistrées ne seront pas recréées.");}
    finally{importing.current=false;setSaving(false);}
  }
  return <dialog ref={dialog} className="transaction-modal direct-client-dialog direct-capture-dialog" aria-labelledby="direct-capture-title" onCancel={event=>{event.preventDefault();close();}}
    onPaste={event=>{const imageFile=[...event.clipboardData.files].find(f=>f.type.startsWith('image/'));if(imageFile){event.preventDefault();choose(imageFile);}}}>
    <div className="transaction-modal-heading"><h2 id="direct-capture-title">Importer depuis ChatGPT</h2><button type="button" onClick={close} disabled={saving} aria-label="Fermer">×</button></div>
    <div className="direct-capture-body">
      <p className="direct-capture-privacy">Lecture locale dans votre navigateur. La capture n’est ni envoyée ni conservée.</p>
      <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{choose(event.target.files?.[0]);event.target.value="";}} />
      <div className={`direct-capture-drop ${drag?'is-dragging':''}`} onDragOver={event=>{event.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={drop}>
        {image&&<img src={image} alt="Capture à importer" />}
        <div><strong>{drag?"Déposez la capture ici":file?"Capture sélectionnée":"Glissez votre capture ici"}</strong><p>PNG · JPG · WEBP · 12 Mo maximum<br />Vous pouvez aussi coller une capture avec Ctrl/Cmd + V.</p><button type="button" disabled={saving} onClick={()=>picker.current?.click()}>{file?"Changer l’image":"Choisir une image"}</button></div>
      </div>
      {busy&&<p role="status">{progress}</p>}
      {error&&<p className="transaction-form-error" role="alert">{error}</p>}
      {warnings.map((warning,i)=><p key={i} className="direct-client-warning">{warning}</p>)}
      {!!rows.length&&<><h3>{rows.length} clients détectés</h3><p className="direct-capture-privacy">Vérifiez les coordonnées avant d’importer. Cochez une ligne « À vérifier » seulement après l’avoir contrôlée. Les doublons sont décochés par défaut.</p></>}
      <div className="direct-capture-rows">{rows.map(row=>{
        const duplicate=directClientDuplicates(known,row).length>0;
        const rowWarnings=[...new Set([...row.warnings,...captureClientWarnings(row)])];
        return <article className="direct-capture-row" key={row.importId}>
          <label className="direct-capture-select"><input type="checkbox" checked={row.selected} disabled={saving} onChange={event=>setRows(current=>current.map(item=>item.importId===row.importId?{...item,selected:event.target.checked,allowDuplicate:event.target.checked&&(duplicate||directClientDuplicates(rows.filter(other=>other.importId!==row.importId&&other.selected).map(other=>({...other,id:other.importId})),row).length>0)}:item))}/><strong>{row.name||"Nom à renseigner"}</strong>{duplicate&&<span>Déjà présent</span>}</label>
          {rowWarnings.length>0&&<div className="direct-capture-warnings"><strong>À vérifier</strong><ul>{rowWarnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
          {duplicate&&<p className="direct-capture-privacy">Cochez cette ligne pour l’importer quand même.</p>}
          <fieldset disabled={saving}>{fields.map(([key,label])=><label className={`transaction-field ${key==='request_note'?'direct-client-note-field':''}`} key={key}><span>{label}</span>{key==='request_note'?<textarea rows={2} value={row[key]??""} maxLength={4000} onChange={event=>edit(row.importId,key,event.target.value)}/>:<input type={key==='request_date'?'date':key==='email'?'email':key==='phone'?'tel':'text'} value={row[key]??""} maxLength={key==='name'?200:key==='email'?254:80} onChange={event=>edit(row.importId,key,event.target.value)}/>}</label>)}</fieldset>
        </article>;
      })}</div>
      <div className="transaction-form-actions"><button type="button" disabled={saving} onClick={close}>Annuler</button><button className="transaction-submit" type="button" disabled={busy||saving||!selected.length||invalid} onClick={()=>void save()}>{saving?"Import en cours…":`Importer ${selected.length} client${selected.length===1?'':'s'}`}</button></div>
    </div>
  </dialog>;
}
