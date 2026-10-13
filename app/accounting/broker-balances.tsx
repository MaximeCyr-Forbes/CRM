"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useBroker } from '../broker-context';
import { accountingRequest } from '../lib/accounting/client';
import { balanceAmount, canEditBalance, type BrokerBalance } from '../lib/accounting/balances';
import { money } from '../lib/accounting/model';

export function BrokerBalances({onClose}:{onClose:()=>void}) {
  const {workspaceUser}=useBroker();
  const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null),saving=useRef(false);
  const [rows,setRows]=useState<BrokerBalance[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [editing,setEditing]=useState<string|null>(null),[amount,setAmount]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    const el=dialog.current!,previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';el.showModal();
    return()=>{el.close();document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    accountingRequest('/api/accounting/balances').then(result=>{if(active)setRows(result.data);})
      .catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[reload]);
  useEffect(()=>{if(editing){input.current?.focus();input.current?.select();}},[editing]);
  function edit(row:BrokerBalance) {setEditing(row.broker);setAmount(row.balance.replace('.',','));setError('');setNotice('');}
  async function save(event:FormEvent, row:BrokerBalance) {
    event.preventDefault();if(saving.current)return;
    let normalized:string;
    try{normalized=balanceAmount(amount);}catch(e){setError((e as Error).message);return;}
    saving.current=true;setBusy(true);setError('');
    try{
      const result=await accountingRequest('/api/accounting/balances','PATCH',{broker:row.broker,balance:normalized,version:row.version});
      setRows(current=>current.map(item=>item.broker===row.broker?result.data:item));setEditing(null);setNotice('Solde mis à jour');
    }catch(e){setError((e as Error).message);}finally{saving.current=false;setBusy(false);}
  }
  const ordered=[...rows].sort((a,b)=>Number(b.broker===workspaceUser)-Number(a.broker===workspaceUser));
  return <dialog ref={dialog} className="accounting-modal accounting-balances" aria-labelledby="balances-title" onCancel={event=>{
    if(busy){event.preventDefault();return;}if(editing){event.preventDefault();setEditing(null);setError('');}else onClose();
  }}>
    <header><div><h2 id="balances-title">Soldes courtiers</h2><p>Fonds marketing · contribution de 5 % des revenus bruts</p><small>Solde actuel saisi manuellement.</small></div><button aria-label="Fermer les soldes" disabled={busy} onClick={onClose}>×</button></header>
    {notice&&<p className="accounting-notice" role="status">{notice}</p>}
    {error&&<div className="accounting-error" role="alert">{error} <button disabled={busy} onClick={()=>{setEditing(null);setReload(n=>n+1);}}>Actualiser</button></div>}
    {loading?<p className="accounting-balance-loading" role="status">Chargement des soldes…</p>:<div className="accounting-balance-list">{ordered.map(row=><article key={row.broker} data-broker={row.broker} className="accounting-balance-card">
      <div className="accounting-balance-summary"><span className="accounting-balance-avatar" aria-hidden="true">{row.label.slice(0,1)}</span><div><h3>{row.label}</h3><strong>{money(Number(row.balance))}</strong><small>{row.updated_at?`Mis à jour le ${new Intl.DateTimeFormat('fr-CA',{day:'numeric',month:'short',year:'numeric',timeZone:'America/Toronto'}).format(new Date(row.updated_at))}`:'À définir'}</small></div>
        {editing!==row.broker&&canEditBalance(workspaceUser,row.broker)&&<button disabled={busy||editing!==null} onClick={()=>edit(row)} aria-label={`${row.version?'Modifier':'Définir'} le solde de ${row.label}`}>{row.version?'Modifier':'Définir le solde'}</button>}
      </div>
      {editing===row.broker&&<form onSubmit={event=>void save(event,row)}><label htmlFor="marketing-fund-amount">Solde du fonds marketing</label><div className="accounting-balance-input"><input ref={input} id="marketing-fund-amount" name="balance" type="text" inputMode="decimal" autoComplete="off" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} aria-describedby="balance-currency"/><span id="balance-currency">CAD</span><button type="button" disabled={busy} aria-label="Changer le signe du montant" onClick={()=>setAmount(v=>v.trim().startsWith('-')?v.trim().slice(1):`-${v.trim()}`)}>±</button></div><div className="accounting-balance-actions"><button type="button" disabled={busy} onClick={()=>{setEditing(null);setError('');}}>Annuler</button><button type="submit" className="accounting-primary" disabled={busy}>{busy?'Enregistrement…':'Enregistrer'}</button></div></form>}
    </article>)}</div>}
  </dialog>;
}
