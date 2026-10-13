"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useBroker} from '../broker-context';
import {inventoryRequest} from '../lib/sign-inventory/client';
import {canManageStock,type Assignment,type InventoryData,type Stock} from '../lib/sign-inventory/model';
import {AssignmentDialog} from './assignment-dialog';
import {InventoryDialog} from './dialog';
import './sign-inventory.css';
const date=(value:string)=>new Intl.DateTimeFormat('fr-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Toronto'}).format(new Date(value));
function StockRow({stock,canEdit,onSaved}:{stock:Stock;canEdit:boolean;onSaved:()=>void}){
 const [total,setTotal]=useState(String(stock.total)),[busy,setBusy]=useState(false),[error,setError]=useState('');const pending=useRef(false);
 async function save(e:FormEvent){e.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await inventoryRequest('/api/sign-inventory',{action:'stock',id:stock.id,total:Number(total),version:stock.version});onSaved();}catch(e){setError((e as Error).message);}finally{pending.current=false;setBusy(false);}}
 return <form className="sign-stock-row" data-stock={stock.id} onSubmit={e=>void save(e)}><div><strong>{stock.label}</strong><small>{stock.used} en circulation · <b>{stock.available} disponible(s)</b></small></div><label>Total possédé<input aria-label={`Total ${stock.label}`} type="number" min={Number(stock.used)} max="100000" step="1" required disabled={!canEdit||busy} value={total} onChange={e=>setTotal(e.target.value)}/></label>{canEdit&&<button disabled={busy||total===''||Number(total)===stock.total} type="submit">{busy?'…':'Enregistrer'}</button>}{error&&<p className="sign-error" role="alert">{error}</p>}</form>;
}
export default function SignInventoryPage(){
 const {workspaceUser}=useBroker();
 const [view,setView]=useState<'active'|'stock'|'history'>('active'),[search,setSearch]=useState(''),[broker,setBroker]=useState(''),[page,setPage]=useState(0);
 const [data,setData]=useState<InventoryData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
 const [editing,setEditing]=useState<Assignment|null|undefined>(undefined),[returning,setReturning]=useState<Assignment|null>(null),[busy,setBusy]=useState(false),[returnError,setReturnError]=useState('');const pending=useRef(false);
 useEffect(()=>{
  let active=true;setLoading(true);setError('');
  const timer=setTimeout(()=>void inventoryRequest(`/api/sign-inventory?${new URLSearchParams({view,search,broker,page:String(page)})}`).then(r=>{if(active)setData(r);}).catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);}),search?200:0);
  return()=>{active=false;clearTimeout(timer);};
 },[view,search,broker,page,revision]);
 function reload(message:string){setNotice(message);setRevision(n=>n+1);}
 async function doReturn(){if(!returning||pending.current)return;pending.current=true;setBusy(true);setReturnError('');try{await inventoryRequest('/api/sign-inventory',{action:'return',id:returning.id,version:returning.version});setReturning(null);reload('Matériel retourné. Les disponibilités sont mises à jour.');}catch(e){setReturnError((e as Error).message);}finally{pending.current=false;setBusy(false);}}
 const actions=(a:Assignment)=><div className="sign-actions"><button disabled={loading||!a.listing_id} onClick={()=>setEditing(a)}>Modifier</button><button onClick={()=>{setReturnError('');setReturning(a);}}>Retourner</button></div>;
 const materials=(a:Assignment)=><><span className={`sign-badge ${a.sign_type??''}`}>{a.sign_label??'Sans pancarte'}</span>{a.addons.map(x=><span className="sign-addon" key={x.id}>+ {x.label}</span>)}</>;
 const property=(a:Assignment)=>a.listing_id?<a href={`/listings/${a.listing_id}`}>{view==='history'?a.address_snapshot:a.address}</a>:<strong>{a.address_snapshot}<small>Listing supprimé</small></strong>;
 return <main className="sign-page"><header className="sign-header"><div><p className="sign-eyebrow">OUTILS D’ÉQUIPE</p><h1>Pancartes / BAC</h1><p>Le bon matériel, à la bonne adresse.</p></div><button className="sign-primary" disabled={!data||loading} onClick={()=>setEditing(null)}>+ Attribuer du matériel</button></header>
  <div className="sign-toolbar"><nav aria-label="Vues inventaire">{([['active','En circulation'],['stock','Inventaire'],['history','Historique']] as const).map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>{setView(id);setPage(0);}}>{label}</button>)}</nav><button onClick={()=>reload('Disponibilités actualisées.')} disabled={loading}>Actualiser</button></div>
  {notice&&<p className="sign-notice" role="status">{notice}</p>}{error&&<p className="sign-error" role="alert">{error} <button onClick={()=>setRevision(n=>n+1)}>Réessayer</button></p>}
  {data&&<section className="sign-summary" aria-label="Matériel disponible">{([['sign','Pancartes disponibles'],['addon','Ajouts disponibles'],['bac','BAC disponibles']] as const).map(([kind,label])=><article key={kind}><h2>{label}</h2><dl>{data.stock.filter(s=>s.kind===kind).map(s=><div key={s.id}><dt>{s.label}</dt><dd className={Number(s.available)===0?'empty':''}>{s.available}</dd></div>)}</dl></article>)}</section>}
  {loading&&<p role="status" className="sign-hint">Chargement…</p>}
  {view==='stock'&&data&&<section className="sign-stock"><h2>Inventaire total</h2><p>Indiquez les quantités possédées. Les disponibilités se calculent automatiquement.</p>{!canManageStock(workspaceUser)&&<p className="sign-hint">Les administrateurs et adjointes peuvent modifier les quantités.</p>}{(['sign','bac','addon'] as const).map(kind=><section key={kind}><h3>{kind==='sign'?'Pancartes par courtier':kind==='bac'?'Boîtes à clés':'Ajouts'}</h3>{data.stock.filter(s=>s.kind===kind).map(s=><StockRow key={`${s.id}-${s.version}`} stock={s} canEdit={canManageStock(workspaceUser)} onSaved={()=>reload('Inventaire enregistré.')}/>)}</section>)}</section>}
  {view!=='stock'&&<section className="sign-ledger"><div className="sign-filters"><label>Rechercher<input type="search" placeholder="Rechercher une propriété…" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label><label>Courtier<select value={broker} onChange={e=>{setBroker(e.target.value);setPage(0);}}><option value="">Tous les courtiers</option>{data?.stock.filter(s=>s.kind==='sign').map(s=><option key={s.id} value={s.broker!}>{s.label}</option>)}</select></label></div>
   {!loading&&data?.assignments.count===0&&!error?<div className="sign-empty"><span aria-hidden="true">◇</span><h2>{search||broker?'Aucun résultat.':view==='history'?'Aucun matériel retourné.':'Aucune pancarte en circulation.'}</h2>{view==='active'&&<button onClick={()=>setEditing(null)}>+ Attribuer du matériel</button>}</div>:data&&<>
    <div className="sign-table"><table><thead><tr>{['Propriété','Courtier','Matériel','BAC',view==='history'?'Attribution / retour':'Attribution',view==='history'?'Utilisateur':'Actions'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{data.assignments.data.map(a=><tr key={a.id}><td>{property(a)}</td><td>{a.broker_label}</td><td>{materials(a)}</td><td>{a.has_bac?'Oui':'Non'}</td><td><time dateTime={a.created_at}>{date(a.created_at)}</time>{a.returned_at&&<small>Retourné le {date(a.returned_at)}</small>}</td><td>{view==='history'?<span>{a.created_by} → {a.returned_by}</span>:actions(a)}</td></tr>)}</tbody></table></div>
    <div className="sign-cards">{data.assignments.data.map(a=><article key={a.id}><h3>{property(a)}</h3><p>{a.broker_label}</p><div>{materials(a)}</div><p>BAC : {a.has_bac?'Oui':'Non'}</p><small>Attribué le {date(a.created_at)} · {a.created_by}</small>{a.returned_at?<small>Retourné le {date(a.returned_at)} · {a.returned_by}</small>:actions(a)}</article>)}</div>
    {data.assignments.count>50&&<div className="sign-pagination"><button disabled={page===0||loading} onClick={()=>setPage(p=>p-1)}>Précédent</button><span>Page {page+1} / {Math.ceil(data.assignments.count/50)}</span><button disabled={(page+1)*50>=data.assignments.count||loading} onClick={()=>setPage(p=>p+1)}>Suivant</button></div>}
   </>}
  </section>}
  {editing!==undefined&&data&&<AssignmentDialog row={editing} data={data} onClose={()=>setEditing(undefined)} onSaved={()=>{setEditing(undefined);reload('Attribution enregistrée.');}}/>}
  {returning&&<InventoryDialog title="Retourner le matériel ?" busy={busy} onClose={()=>setReturning(null)}><div className="sign-return"><h3>{returning.address}</h3><p>{returning.broker_label}</p>{materials(returning)}<p>BAC : {returning.has_bac?'Oui':'Non'}</p><p>Tout ce matériel redeviendra disponible.</p>{returnError&&<p className="sign-error" role="alert">{returnError}</p>}<footer><button disabled={busy} onClick={()=>setReturning(null)}>Annuler</button><button className="sign-primary" disabled={busy} onClick={()=>void doReturn()}>{busy?'Enregistrement…':'Confirmer le retour'}</button></footer></div></InventoryDialog>}
 </main>;
}
