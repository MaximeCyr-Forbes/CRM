"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CATEGORY_LABELS, invoiceFields, expenseFields, monthlyIntent, type Expense } from "../lib/accounting/model";
import { accountingRequest, expenseUrl, uploadInvoice } from "../lib/accounting/client";
export function ExpenseModal({expense,onClose,onSaved}:{expense:Expense|null;onClose:()=>void;onSaved:(row:Expense)=>void}) {
  const confirmation=useRef<HTMLDialogElement>(null);
  const [pending,setPending]=useState<Record<string,FormDataEntryValue>|null>(null);
  const dialog=useRef<HTMLDialogElement>(null),fileInput=useRef<HTMLInputElement>(null);
  const [saved,setSaved]=useState(expense),[file,setFile]=useState<File|null>(null),[removeInvoice,setRemoveInvoice]=useState(false);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[drag,setDrag]=useState(false);
  const [monthly,setMonthly]=useState(expense?.recurring_rule?.active??false),[stopConfirmed,setStopConfirmed]=useState(false);
  const [stopPending,setStopPending]=useState<Record<string,FormDataEntryValue>|null>(null), stopDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(!stopPending)return;const el=stopDialog.current!;el.showModal();return()=>el.close();},[stopPending]);
  useEffect(()=>{const el=dialog.current!, previous=document.activeElement as HTMLElement|null, overflow=document.body.style.overflow; document.body.style.overflow="hidden";el.showModal();return()=>{el.close();document.body.style.overflow=overflow;previous?.focus();};},[]);
  useEffect(()=>{if(!pending)return;const el=confirmation.current!;el.showModal();return()=>el.close();},[pending]);
  function choose(candidate:File|undefined) { if(!candidate)return;try{invoiceFields(candidate);setFile(candidate);setRemoveInvoice(false);setError("");}catch(e){setError((e as Error).message);} }
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy)return;setError("");
    const fields=Object.fromEntries(new FormData(event.currentTarget).entries());
    try {const validated=expenseFields(fields);monthlyIntent({...fields,is_monthly:monthly},validated.expense_date);}catch(e){setError((e as Error).message);return;}
    if(saved?.recurring_rule?.active && !monthly && !stopConfirmed) {setStopPending(fields);return;}
    continueSave(fields,stopConfirmed);
  }
  function continueSave(fields:Record<string,FormDataEntryValue>, stopped:boolean) {
    if(!file && (!saved?.invoice || removeInvoice)) {setPending(fields);return;}
    void save(fields,false,stopped);
  }
  async function save(fields:Record<string,FormDataEntryValue>, confirmed=false, stopped=stopConfirmed) {
    if(busy)return;setBusy(true);setError("");setPending(null);
    const payload={...fields,is_monthly:monthly,confirm_stop:stopped,save_without_invoice:confirmed,invoice:file?{name:file.name,type:file.type,size:file.size}:undefined};
    let row=saved; let fieldsSaved=false;
    try {
      row=(await accountingRequest(row?expenseUrl(row.id):"/api/accounting/expenses",row?"PATCH":"POST",payload)).data as Expense;
      setSaved(row);onSaved(row);fieldsSaved=true;
      if(file) row=(await uploadInvoice(row.id,file)).data as Expense;
      else if(removeInvoice) row=(await accountingRequest(`${expenseUrl(row.id)}/invoice`,"DELETE",{save_without_invoice:confirmed})).data as Expense;
      onSaved(row);onClose();
    }catch(e){if(fieldsSaved)setError(`Dépense enregistrée. Facture à vérifier ou à réessayer : ${(e as Error).message}`);else setError((e as Error).message);}
    finally{setBusy(false);}
  }
  return <><dialog ref={dialog} className="accounting-modal" aria-labelledby="expense-title" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}>
    <form onSubmit={submit}>
      <header><div><p className="accounting-eyebrow">COMPTABILITÉ · ÉQUIPE FORBES</p><h2 id="expense-title">{saved?"Modifier la dépense":"Ajouter une dépense"}</h2></div><button type="button" aria-label="Fermer" disabled={busy} onClick={onClose}>×</button></header>
      <fieldset disabled={busy} className="accounting-form-fields">
        <div className="accounting-invoice-field"><span className="accounting-field-label">Facture <span className="accounting-muted">facultative</span></span>
          <div className={`accounting-dropzone ${drag?"dragging":""}`} onDragOver={e=>{e.preventDefault();if(!busy)setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);if(!busy){if(e.dataTransfer.files.length!==1)setError("Choisissez une seule facture.");else choose(e.dataTransfer.files[0]);}}}>
            <span aria-hidden="true" className="accounting-upload-icon">↑</span><strong>Déposez votre facture ici</strong><span>PDF ou image · maximum 15 Mo</span><button type="button" autoFocus onClick={()=>fileInput.current?.click()}>Choisir un fichier</button>
            <input ref={fileInput} className="accounting-sr" tabIndex={-1} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" aria-label="Facture PDF ou image" onChange={e=>{choose(e.target.files?.[0]);e.target.value="";}}/>
          </div>
          {(file||saved?.invoice&&!removeInvoice)&&<div className="accounting-selected-file"><div><strong>{file?.name??saved?.invoice?.file_name}</strong><small>{((file?.size??saved?.invoice?.size??0)/1024).toLocaleString("fr-CA",{maximumFractionDigits:1})} Ko · {file?.type??saved?.invoice?.mime_type}</small></div><button type="button" onClick={()=>{setFile(null);setRemoveInvoice(true);}}>Retirer</button></div>}
          {removeInvoice&&saved?.invoice&&<p className="accounting-muted">La facture sera retirée à l’enregistrement. <button type="button" onClick={()=>setRemoveInvoice(false)}>Annuler</button></p>}
        </div>
        <div className="accounting-form-row"><label>Catégorie<select name="category" defaultValue={expense?.category??""}><option value="">À classer</option>{Object.entries(CATEGORY_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Date<input name="expense_date" type="date" defaultValue={expense?.expense_date??""}/></label></div>
        <label>Fournisseur<input name="vendor" maxLength={200} defaultValue={expense?.vendor??""} placeholder="Ex. : Photographe"/></label>
        <label>Description<input name="description" maxLength={1000} defaultValue={expense?.description??""} placeholder="À quoi correspond cette dépense ?"/></label>
        <label>Montant total (CAD)<input name="amount" inputMode="decimal" defaultValue={expense?.amount!=null?String(expense.amount).replace(".",","):""} placeholder="0,00"/></label>
        <label>Date de renouvellement <span className="accounting-muted">facultative</span><input name="renewal_date" type="date" defaultValue={expense?.renewal_date??""}/></label>
        <label className="accounting-monthly-option"><input type="checkbox" checked={monthly} onChange={e=>{setMonthly(e.target.checked);setStopConfirmed(false);}}/><span><strong>DÉPENSE MENSUELLE</strong><small>Crée automatiquement une nouvelle dépense chaque mois.</small></span></label>
        {saved?.recurring_rule_id&&<p className="accounting-muted accounting-series-help">{saved.recurring_rule?.active?"Les changements s’appliquent à cette dépense et au modèle des mois futurs. Le jour récurrent reste inchangé.":"Série arrêtée. Cochez pour reprendre à partir du prochain mois, sans rattraper les mois d’arrêt."}</p>}
        <label>Notes <span className="accounting-muted">facultatif</span><textarea name="notes" maxLength={5000} rows={3} defaultValue={expense?.notes??""}/></label>

      </fieldset>
      {error&&<p className="accounting-error" role="alert">{error}</p>}
      <footer className="accounting-modal-actions"><button type="button" disabled={busy} onClick={onClose}>Annuler</button><button className="accounting-primary" disabled={busy} type="submit">{busy?"Enregistrement…":"Enregistrer"}</button></footer>
    </form>
  </dialog>
  <dialog ref={confirmation} className="accounting-modal accounting-confirm" aria-labelledby="no-invoice-title" onCancel={()=>setPending(null)}>
    <h2 id="no-invoice-title">AUCUNE FACTURE</h2>
    <p>{removeInvoice&&saved?.invoice ? "Êtes-vous sûr de vouloir conserver cette dépense sans facture?" : "Aucune facture n’est jointe à cette dépense. Êtes-vous sûr de vouloir l’enregistrer quand même?"}</p>
    <div className="accounting-modal-actions"><button type="button" onClick={()=>setPending(null)}>RETOUR</button><button type="button" className="accounting-primary" onClick={()=>{if(pending)void save(pending,true);}}>ENREGISTRER SANS FACTURE</button></div>
  </dialog>
  <dialog ref={stopDialog} className="accounting-modal accounting-confirm" aria-labelledby="stop-series-title" onCancel={()=>{setStopPending(null);setMonthly(true);}}>
    <h2 id="stop-series-title">ARRÊTER LA RÉCURRENCE ?</h2>
    <p>Les dépenses déjà créées resteront dans votre historique. Aucune nouvelle dépense ne sera créée automatiquement.</p>
    <div className="accounting-modal-actions"><button type="button" onClick={()=>{setStopPending(null);setMonthly(true);}}>ANNULER</button><button type="button" className="accounting-primary" onClick={()=>{if(stopPending){const fields=stopPending;setStopPending(null);setStopConfirmed(true);continueSave(fields,true);}}}>ARRÊTER LA RÉCURRENCE</button></div>
  </dialog></>;
}
