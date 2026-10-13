"use client";
import {useEffect,useRef,useState} from 'react';
import {accountingRequest} from '../lib/accounting/client';
import type {BalanceHistoryEntry,BrokerBalance} from '../lib/accounting/balances';
import {money} from '../lib/accounting/model';

export function BalanceHistory({broker,brokers}:{broker:string;brokers:BrokerBalance[]}) {
  const [entries,setEntries]=useState<BalanceHistoryEntry[]>([]),[cursor,setCursor]=useState<number|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const active=useRef(false),pending=useRef(false);
  useEffect(()=>{
    active.current=true;
    let cancelled=false;
    setLoading(true);setError('');
    accountingRequest(`/api/accounting/balances/history?broker=${encodeURIComponent(broker)}`)
      .then(result=>{if(!cancelled){setEntries(result.data);setCursor(result.nextCursor);}})
      .catch(e=>{if(!cancelled)setError((e as Error).message);})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;active.current=false;};
  },[broker,retry]);
  async function more() {
    if(cursor===null||pending.current)return;
    pending.current=true;setLoading(true);setError('');
    try {
      const result=await accountingRequest(`/api/accounting/balances/history?broker=${encodeURIComponent(broker)}&before=${cursor}`);
      if(active.current){setEntries(previous=>[...previous,...result.data]);setCursor(result.nextCursor);}
    }catch(e){if(active.current)setError((e as Error).message);}
    finally{pending.current=false;if(active.current)setLoading(false);}
  }
  return <section id={`balance-history-${broker}`} className="accounting-balance-history" aria-label="Historique des modifications" aria-busy={loading}>
    {entries.length>0&&<ol>{entries.map(entry=><li key={entry.id}>
      <div><span>Ancien : {money(Number(entry.old_balance))}</span><strong>Nouveau : {money(Number(entry.new_balance))}</strong></div>
      <small><time dateTime={entry.updated_at}>{new Intl.DateTimeFormat('fr-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Toronto'}).format(new Date(entry.updated_at))}</time> · {brokers.find(row=>row.broker===entry.updated_by)?.label??entry.updated_by}</small>
    </li>)}</ol>}
    {!loading&&!error&&entries.length===0&&<p>Aucune modification enregistrée.</p>}
    {loading&&<p role="status">Chargement de l’historique…</p>}
    {error&&<p role="alert">{error} <button onClick={()=>entries.length?void more():setRetry(n=>n+1)}>Réessayer</button></p>}
    {!loading&&!error&&cursor!==null&&<button onClick={()=>void more()}>Voir plus</button>}
  </section>;
}
