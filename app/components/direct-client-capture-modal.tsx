"use client";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { directClientDuplicates, directClientToday, parseDirectClient, type DirectClient, type DirectClientDraft } from "../lib/transactions/direct-clients";
import { captureClientWarnings, deduplicateCapture, type ImportClient } from "../lib/transactions/direct-client-capture";
import { workspaceRequest } from "../lib/workspace-request";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";
import { capturePropertyMatch, type CaptureProperty } from '../lib/transactions/direct-client-capture-formats';
type Preview = ImportClient & { importId: string; selected: boolean; allowDuplicate: boolean };
const fields = [["name","Nom"],["phone","Téléphone"],["email","Courriel"],["source","Provenance"],["request_date","Date"],["request_note","Nature de la demande"]] as const;
export default function DirectClientCaptureModal({initialFiles,property,existing,endpoint,onClose,onImported}: {
  initialFiles:File[];property:CaptureProperty;existing:DirectClient[];endpoint:string;onClose:()=>void;onImported:(clients:DirectClient[])=>void;
}) {
  const dialog=useRef<HTMLDialogElement>(null),picker=useRef<HTMLInputElement>(null),controller=useRef<AbortController|null>(null);
  const importing=useRef(false),generation=useRef(0);
  const [files,setFiles]=useState<File[]>(initialFiles);
  const [summaries,setSummaries]=useState<string[]>([]),[propertyOverride,setPropertyOverride]=useState(false);
  const [rows,setRows]=useState<Preview[]>([]),[known,setKnown]=useState(existing);
  const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[progress,setProgress]=useState("");
  const [error,setError]=useState(""),[warnings,setWarnings]=useState<string[]>([]),[drag,setDrag]=useState(false);
  function close(){if(importing.current)return;controller.current?.abort();onClose();}
  useDialogLifecycle(true,close);
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>{controller.current?.abort();node?.close();};},[]);
  useEffect(()=>{
    if(!files.length)return;
    if(files.length>10){setError('Choisissez au maximum 10 captures à la fois.');return;}
    const abort=new AbortController();controller.current=abort;const current=++generation.current;
    setBusy(true);setRows([]);setError('');setWarnings([]);setSummaries([]);setPropertyOverride(false);
    void (async()=>{
      const module=await import('../lib/transactions/direct-client-capture-browser');
      const clients:ImportClient[]=[];const notes:string[]=[];
      for(let index=0;index<files.length;index++){
        abort.signal.throwIfAborted();
        const perFile=new AbortController();const stop=()=>perFile.abort();abort.signal.addEventListener('abort',stop,{once:true});
        const timer=window.setTimeout(()=>perFile.abort(),120000);
        try{
          const result=await module.readClientCapture(files[index],directClientToday(),{signal:perFile.signal,onProgress:message=>{if(current===generation.current)setProgress('Analyse de '+(index+1)+' / '+files.length+' captures — '+message);}});
          clients.push(...result.clients);notes.push(...result.warnings);
          if(current===generation.current)setSummaries(list=>[...list,'✓ Capture '+(index+1)+' — '+result.format]);
        }catch{
          if(abort.signal.aborted)throw new DOMException('Interrompu','AbortError');
          if(current===generation.current)setSummaries(list=>[...list,'! Capture '+(index+1)+' — format non reconnu ou image illisible']);
        }finally{window.clearTimeout(timer);abort.signal.removeEventListener('abort',stop);}
      }
      if(current!==generation.current||abort.signal.aborted)return;
      const merged=deduplicateCapture(clients);
      if(merged.length>100){setError('Importez au maximum 100 clients à la fois.');return;}
      setWarnings(notes);
      setRows(merged.map(client=>({...client,importId:crypto.randomUUID(),selected:!directClientDuplicates(known,client).length&&!client.warnings.some(w=>!w.startsWith('Année supposée')),allowDuplicate:false})));
      if(!merged.length)setError('Format de capture non reconnu. Choisissez une capture nette ChatGPT ou Centris.');
    })().catch(()=>{if(current===generation.current)setError('Lecture interrompue. Réessayez avec une capture plus petite.');})
      .finally(()=>{if(current===generation.current)setBusy(false);});
    return()=>{generation.current++;abort.abort();};
  // Snapshot the existing clients for this image selection. OCR is sequential and cancellable.
  },[files]);
  function choose(next:File[]){if(!next.length||importing.current)return;if(next.length>10){setError('Choisissez au maximum 10 captures à la fois.');return;}controller.current?.abort();setFiles(next);}
  function drop(event:DragEvent){event.preventDefault();event.stopPropagation();setDrag(false);choose([...event.dataTransfer.files]);}
  const selected=rows.filter(row=>row.selected);
  const mismatch=selected.some(row=>row.properties?.some(p=>capturePropertyMatch(p,property)==='mismatch'));
  const invalid=selected.some(row=>{try{parseDirectClient(row);return false;}catch{return true;}});
  function edit(id:string,key:keyof DirectClientDraft,value:string){setRows(current=>current.map(row=>row.importId===id?{...row,[key]:value,allowDuplicate:false}:row));setError("");}
  async function save(){
    if(importing.current||!selected.length||invalid||(mismatch&&!propertyOverride))return;
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
    onPaste={event=>{const images=[...event.clipboardData.files].filter(f=>f.type.startsWith('image/'));if(images.length){event.preventDefault();choose(images);}}}>
    <div className="transaction-modal-heading"><h2 id="direct-capture-title">Importer des captures</h2><button type="button" onClick={close} disabled={saving} aria-label="Fermer">×</button></div>
    <div className="direct-capture-body">
      <p className="direct-capture-privacy">Lecture locale dans votre navigateur. La capture n’est ni envoyée ni conservée.</p>
      <input ref={picker} type="file" multiple accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{choose([...(event.target.files??[])]);event.target.value="";}} />
      <div className={`direct-capture-drop ${drag?'is-dragging':''}`} onDragOver={event=>{event.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={drop}>
        <div><strong>{drag?"Déposez la capture ici":files.length?files.length+" capture(s) sélectionnée(s)":"Glissez vos captures ici"}</strong><p>ChatGPT ou Centris · PNG · JPG · WEBP<br />10 images maximum · 12 Mo par image<br />Vous pouvez aussi coller une capture avec Ctrl/Cmd + V.</p><button type="button" disabled={saving} onClick={()=>picker.current?.click()}>{files.length?"Changer les images":"Choisir des images"}</button></div>
      </div>
      {busy&&<p role="status">{progress}</p>}
      {error&&<p className="transaction-form-error" role="alert">{error}</p>}
      {summaries.length>0&&<ul className="direct-capture-privacy direct-capture-files">{summaries.map((summary,i)=><li key={i}>{summary} <button type="button" disabled={busy||saving} aria-label={"Retirer la capture "+(i+1)} onClick={()=>{setRows([]);setSummaries([]);setWarnings([]);setFiles(current=>current.filter((_,index)=>index!==i));}}>Retirer</button></li>)}</ul>}
      {warnings.map((warning,i)=><p key={i} className="direct-client-warning">{warning}</p>)}
      {!!rows.length&&<><h3>{rows.length} clients détectés</h3><p className="direct-capture-privacy">Vérifiez les coordonnées avant d’importer. Cochez une ligne « À vérifier » seulement après l’avoir contrôlée. Les doublons sont décochés par défaut.</p></>}
      <div className="direct-capture-rows">{rows.map(row=>{
        const duplicate=directClientDuplicates(known,row).length>0;
        const rowWarnings=[...new Set([...row.warnings,...captureClientWarnings(row)])];
        return <article className="direct-capture-row" key={row.importId}>
          <label className="direct-capture-select"><input type="checkbox" checked={row.selected} disabled={saving} onChange={event=>setRows(current=>current.map(item=>item.importId===row.importId?{...item,selected:event.target.checked,allowDuplicate:event.target.checked&&(duplicate||directClientDuplicates(rows.filter(other=>other.importId!==row.importId&&other.selected).map(other=>({...other,id:other.importId})),row).length>0)}:item))}/><strong>{row.name||"Nom à renseigner"}</strong>{duplicate&&<span>Déjà présent</span>}</label>
          {row.properties?.map((p,i)=>{const match=capturePropertyMatch(p,property);return match==='mismatch'?<div className="direct-client-warning" role="alert" key={i}><strong>Cette demande semble concerner une autre propriété.</strong><p>Capture : {p.address||'Adresse non détectée'}{p.listingNumber?' · #'+p.listingNumber:''}<br/>Transaction : {property.address||'Adresse non renseignée'}{property.listingNumber?' · #'+property.listingNumber:''}</p></div>:<p className="direct-capture-privacy" key={i}>{match==='match'?'✓ Propriété reconnue':'Propriété non vérifiée'}</p>;})}
          {rowWarnings.length>0&&<div className="direct-capture-warnings"><strong>À vérifier</strong><ul>{rowWarnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
          {duplicate&&<p className="direct-capture-privacy">Cochez cette ligne pour l’importer quand même.</p>}
          <fieldset disabled={saving}>{fields.map(([key,label])=><label className={`transaction-field ${key==='request_note'?'direct-client-note-field':''}`} key={key}><span>{label}</span>{key==='request_note'?<textarea rows={2} value={row[key]??""} maxLength={4000} onChange={event=>edit(row.importId,key,event.target.value)}/>:<input type={key==='request_date'?'date':key==='email'?'email':key==='phone'?'tel':'text'} value={row[key]??""} maxLength={key==='name'?200:key==='email'?254:80} onChange={event=>edit(row.importId,key,event.target.value)}/>}</label>)}</fieldset>
        </article>;
      })}</div>
      {mismatch&&<label className="direct-capture-select"><input type="checkbox" checked={propertyOverride} onChange={e=>setPropertyOverride(e.target.checked)} disabled={saving}/>Importer quand même malgré la propriété différente</label>}
      <div className="transaction-form-actions"><button type="button" disabled={saving} onClick={close}>Annuler</button><button className="transaction-submit" type="button" disabled={busy||saving||!selected.length||invalid||(mismatch&&!propertyOverride)} onClick={()=>void save()}>{saving?"Import en cours…":`Importer ${selected.length} client${selected.length===1?'':'s'}`}</button></div>
    </div>
  </dialog>;
}
