"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CATEGORY_LABELS, invoiceFields, todayToronto, type Expense } from "../lib/accounting/model";
import { accountingRequest, expenseUrl, uploadInvoice } from "../lib/accounting/client";
export function ExpenseModal({expense,onClose,onSaved}:{expense:Expense|null;onClose:()=>void;onSaved:(row:Expense)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),fileInput=useRef<HTMLInputElement>(null);
  const [saved,setSaved]=useState(expense),[file,setFile]=useState<File|null>(null),[removeInvoice,setRemoveInvoice]=useState(false);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[drag,setDrag]=useState(false);
  useEffect(()=>{const el=dialog.current!, previous=document.activeElement as HTMLElement|null, overflow=document.body.style.overflow; document.body.style.overflow="hidden";el.showModal();return()=>{el.close();document.body.style.overflow=overflow;previous?.focus();};},[]);
  function choose(candidate:File|undefined) { if(!candidate)return;try{invoiceFields(candidate);setFile(candidate);setRemoveInvoice(false);setError("");}catch(e){setError((e as Error).message);} }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy)return;setBusy(true);setError("");
    const fields=Object.fromEntries(new FormData(event.currentTarget).entries());
    let row=saved; let fieldsSaved=false;
    try {
      row=(await accountingRequest(row?expenseUrl(row.id):"/api/accounting/expenses",row?"PATCH":"POST",fields)).data as Expense;
      setSaved(row);onSaved(row);fieldsSaved=true;
      if(file) row=(await uploadInvoice(row.id,file)).data as Expense;
      else if(removeInvoice) row=(await accountingRequest(`${expenseUrl(row.id)}/invoice`,"DELETE")).data as Expense;
      onSaved(row);onClose();
    }catch(e){if(fieldsSaved)setError(`Dépense enregistrée. Facture à vérifier ou à réessayer : ${(e as Error).message}`);else setError((e as Error).message);}
    finally{setBusy(false);}
  }
  return <dialog ref={dialog} className="accounting-modal" aria-labelledby="expense-title" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}>
    <form onSubmit={submit}>
      <header><div><p className="accounting-eyebrow">COMPTABILITÉ · ÉQUIPE FORBES</p><h2 id="expense-title">{saved?"Modifier la dépense":"Ajouter une dépense"}</h2></div><button type="button" aria-label="Fermer" disabled={busy} onClick={onClose}>×</button></header>
      <fieldset disabled={busy} className="accounting-form-fields"><div className="accounting-form-row"><label>Catégorie *<select name="category" defaultValue={expense?.category??"marketing"}>{Object.entries(CATEGORY_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Date *<input name="expense_date" type="date" required defaultValue={expense?.expense_date??todayToronto()}/></label></div>
        <label>Fournisseur *<input name="vendor" required maxLength={200} defaultValue={expense?.vendor??""} placeholder="Ex. : Photographe" autoFocus/></label>
        <label>Description *<input name="description" required maxLength={1000} defaultValue={expense?.description??""} placeholder="À quoi correspond cette dépense ?"/></label>
        <label>Montant total (CAD) *<input name="amount" inputMode="decimal" required defaultValue={expense?String(expense.amount).replace(".",","):""} placeholder="0,00"/></label>
        <label>Notes <span className="accounting-muted">facultatif</span><textarea name="notes" maxLength={5000} rows={3} defaultValue={expense?.notes??""}/></label>
        <div><span className="accounting-field-label">Facture <span className="accounting-muted">facultative</span></span>
          <div className={`accounting-dropzone ${drag?"dragging":""}`} onDragOver={e=>{e.preventDefault();if(!busy)setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);if(!busy){if(e.dataTransfer.files.length!==1)setError("Choisissez une seule facture.");else choose(e.dataTransfer.files[0]);}}}>
            <span aria-hidden="true" className="accounting-upload-icon">↑</span><strong>Déposez votre facture ici</strong><span>PDF ou image · maximum 15 Mo</span><button type="button" onClick={()=>fileInput.current?.click()}>Choisir un fichier</button>
            <input ref={fileInput} className="accounting-sr" tabIndex={-1} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" aria-label="Facture PDF ou image" onChange={e=>{choose(e.target.files?.[0]);e.target.value="";}}/>
          </div>
          {(file||saved?.invoice&&!removeInvoice)&&<div className="accounting-selected-file"><div><strong>{file?.name??saved?.invoice?.file_name}</strong><small>{((file?.size??saved?.invoice?.size??0)/1024).toLocaleString("fr-CA",{maximumFractionDigits:1})} Ko · {file?.type??saved?.invoice?.mime_type}</small></div><button type="button" onClick={()=>{setFile(null);setRemoveInvoice(true);}}>Retirer</button></div>}
          {removeInvoice&&saved?.invoice&&<p className="accounting-muted">La facture sera retirée à l’enregistrement. <button type="button" onClick={()=>setRemoveInvoice(false)}>Annuler</button></p>}
        </div>
      </fieldset>
      {error&&<p className="accounting-error" role="alert">{error}</p>}
      <footer className="accounting-modal-actions"><button type="button" disabled={busy} onClick={onClose}>Annuler</button><button className="accounting-primary" disabled={busy} type="submit">{busy?"Enregistrement…":"Enregistrer"}</button></footer>
    </form>
  </dialog>;
}
