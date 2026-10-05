"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_LABELS, expenseTotals, filterExpenses, money, todayToronto, type Expense, type Filters } from "../lib/accounting/model";
import { accountingRequest, expenseUrl } from "../lib/accounting/client";
import { ExpenseModal } from "./expense-modal";
import "./accounting.css";

function displayDate(value:string|null) { if(!value)return "À compléter"; return new Intl.DateTimeFormat("fr-CA",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`)); }
export default function AccountingPage() {
  const [rows,setRows]=useState<Expense[]>([]), [loading,setLoading]=useState(true),[error,setError]=useState("");
  const [filters,setFilters]=useState<Filters>({category:"all",period:"all",payment:"all",year:todayToronto().slice(0,4),search:""});
  const [editing,setEditing]=useState<Expense|null|undefined>(undefined),[notice,setNotice]=useState("");
  const [deleting,setDeleting]=useState<Expense|null>(null),[busy,setBusy]=useState(false);
  const deleteDialog=useRef<HTMLDialogElement>(null);
  const load=useCallback(async()=>{ setLoading(true); setError(""); try {setRows((await accountingRequest("/api/accounting/expenses")).data); void accountingRequest("/api/accounting/expenses","PATCH").catch(e=>setNotice(`Nettoyage des anciens uploads à réessayer : ${(e as Error).message}`));} catch(e) {setError((e as Error).message);} finally {setLoading(false);} },[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{ if(!deleting)return; const dialog=deleteDialog.current!; dialog.showModal(); return ()=>dialog.close(); },[deleting]);
  const visible=useMemo(()=>filterExpenses(rows,filters),[rows,filters]);
  const totals=expenseTotals(visible);
  const years=Array.from(new Set([todayToronto().slice(0,4),filters.year,...rows.flatMap(r=>r.expense_date?[r.expense_date.slice(0,4)]:[])])).sort().reverse();
  const filter=<K extends keyof Filters>(key:K,value:Filters[K])=>setFilters(f=>({...f,[key]:value}));
  async function remove() {
    if(!deleting)return; setBusy(true); setError("");
    try {await accountingRequest(expenseUrl(deleting.id),"DELETE",{confirm:true});setRows(r=>r.filter(e=>e.id!==deleting.id));setDeleting(null);setNotice("Dépense et facture supprimées.");}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function payment(row:Expense) {
    if(busy)return;setBusy(true);setError("");
    try {const updated=(await accountingRequest(expenseUrl(row.id),"PATCH",{action:"payment",is_paid:!row.is_paid})).data as Expense;setRows(r=>r.map(e=>e.id===updated.id?updated:e));setNotice(updated.is_paid?"Dépense marquée payée.":"Dépense marquée à payer.");}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const status=(row:Expense)=><span className={`accounting-payment ${row.is_paid?"paid":"unpaid"}`}>{row.is_paid?"PAYÉ ✓":"À PAYER"}</span>;
  const actions=(row:Expense)=><div className="accounting-actions"><button disabled={busy} onClick={()=>void payment(row)}>{row.is_paid?"Marquer à payer":"Marquer payé"}</button><button onClick={()=>setEditing(row)}>Modifier<span className="accounting-sr"> {row.vendor}</span></button><button className="accounting-danger" onClick={()=>{setError("");setDeleting(row);}}>Supprimer<span className="accounting-sr"> {row.vendor}</span></button></div>;
  const invoice=(row:Expense)=>row.invoice ? <a className="accounting-invoice-link" title={row.invoice.file_name} href={`${expenseUrl(row.id)}/invoice`} target="_blank" rel="noopener noreferrer">Ouvrir la facture ↗</a> : <span className="accounting-muted">—</span>;
  return <main className="accounting-page">
    <header className="accounting-header"><div><p className="accounting-eyebrow">REGISTRE PARTAGÉ · ÉQUIPE FORBES</p><h1>Comptabilité</h1><p>Suivi des dépenses de l’Équipe Forbes.</p></div><button className="accounting-primary" onClick={()=>setEditing(null)}>+ Ajouter une dépense</button></header>
    <div className="accounting-tabs" aria-label="Catégories">{(["all","marketing","operation"] as const).map(c=><button key={c} aria-pressed={filters.category===c} onClick={()=>filter("category",c)}>{c==="all"?"Toutes":CATEGORY_LABELS[c]}</button>)}</div>
    <section className="accounting-totals" aria-label="Totaux des dépenses filtrées">{[["Dépenses totales",totals.total],["Marketing",totals.marketing],["Opération",totals.operation]].map(([label,total])=><article key={label}><span>{label}</span><strong>{loading?"—":money(Number(total))}</strong><small>Filtres sélectionnés</small></article>)}</section>
    <section className="accounting-ledger" aria-label="Dépenses">
      <div className="accounting-filters"><label className="accounting-search">Rechercher<input type="search" placeholder="Fournisseur, description, facture…" value={filters.search} onChange={e=>filter("search",e.target.value)}/></label><label>Période<select value={filters.period} onChange={e=>filter("period",e.target.value as Filters["period"])}><option value="month">Ce mois</option><option value="year">Cette année</option><option value="all">Tout</option></select></label><label>Statut<select value={filters.payment} onChange={e=>filter("payment",e.target.value as Filters["payment"])}><option value="all">Toutes</option><option value="unpaid">À payer</option><option value="paid">Payées</option></select></label><label>Année<select value={filters.year} onChange={e=>setFilters(f=>({...f,year:e.target.value,period:"year"}))}>{years.map(y=><option key={y}>{y}</option>)}</select></label></div>
      {notice&&<p className="accounting-notice" role="status">{notice}</p>}
      {error&&!deleting&&<div className="accounting-error" role="alert">{error} <button onClick={()=>void load()}>Réessayer</button></div>}
      {loading ? <div className="accounting-empty" role="status">Chargement des dépenses…</div> : !error&&visible.length===0 ? <div className="accounting-empty"><span aria-hidden="true">◇</span><h2>Aucune dépense enregistrée pour cette période.</h2><p>Centralisez les factures et les dépenses de votre équipe.</p><button onClick={()=>setEditing(null)}>+ Ajouter une dépense</button></div> : <>
        <p className="accounting-count">{visible.length} dépense{visible.length>1?"s":""} · {money(expenseTotals(visible).total)}</p>
        <div className="accounting-table"><table><thead><tr>{["Date","Catégorie","Fournisseur","Description","Montant","Statut","Renouvellement","Facture","Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{visible.map(row=><tr key={row.id}><td>{displayDate(row.expense_date)}</td><td><span className={`accounting-badge ${row.category}`}>{row.category?CATEGORY_LABELS[row.category]:"À CLASSER"}</span></td><td><strong>{row.vendor??"À compléter"}</strong></td><td>{row.description??"À compléter"}</td><td className="accounting-amount">{money(row.amount)}</td><td>{status(row)}</td><td>{row.renewal_date?displayDate(row.renewal_date):"—"}</td><td>{invoice(row)}</td><td>{actions(row)}</td></tr>)}</tbody></table></div>
        <div className="accounting-cards">{visible.map(row=><article key={row.id}><div className="accounting-card-top"><span className={`accounting-badge ${row.category}`}>{row.category?CATEGORY_LABELS[row.category]:"À CLASSER"}</span><time dateTime={row.expense_date??undefined}>{displayDate(row.expense_date)}</time></div><h2>{row.vendor??"À compléter"}</h2><p>{row.description??"À compléter"}</p><strong className="accounting-card-amount">{money(row.amount)}</strong><div className="accounting-card-status">{status(row)}</div>{row.renewal_date&&<p>Renouvellement : <time dateTime={row.renewal_date}>{displayDate(row.renewal_date)}</time></p>}<div>{invoice(row)}</div>{actions(row)}</article>)}</div>
      </>}
    </section>
    {editing!==undefined&&<ExpenseModal expense={editing} onClose={()=>setEditing(undefined)} onSaved={row=>{setRows(r=>[row,...r.filter(e=>e.id!==row.id)]);setNotice("Dépense enregistrée.");}}/>}
    <dialog className="accounting-modal accounting-confirm" ref={deleteDialog} aria-labelledby="delete-expense-title" onCancel={e=>{if(busy)e.preventDefault();else setDeleting(null);}}>{deleting&&<><h2 id="delete-expense-title">Supprimer cette dépense ?</h2><p>{deleting.vendor} · {money(deleting.amount)}</p><p>La dépense et sa facture seront supprimées définitivement.</p>{error&&<p role="alert" className="accounting-error">{error}</p>}<div className="accounting-modal-actions"><button disabled={busy} onClick={()=>setDeleting(null)}>Annuler</button><button className="accounting-primary" disabled={busy} onClick={()=>void remove()}>{busy?"Suppression…":"Confirmer la suppression"}</button></div></>}</dialog>
  </main>;
}
