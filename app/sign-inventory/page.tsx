"use client";
import {useEffect,useState} from 'react';
import {useBroker} from '../broker-context';
import {ShellIcon} from '../components/shell-icons';
import {PencilIcon} from '../components/action-icons';
import {inventoryRequest} from '../lib/sign-inventory/client';
import {canManageStock,type Assignment,type InventoryData} from '../lib/sign-inventory/model';
import {AddonDialog} from './addon-dialog';
import {AssignmentDialog} from './assignment-dialog';
import {ReturnDialog} from './return-dialog';
import {StockDialog} from './stock-dialog';
import {MaterialBadges,BacBadge,InventorySearch,inventoryDate} from './presentation';
import './sign-inventory.css';
import {SignStockSummary} from './sign-stock-summary';

export default function SignInventoryPage(){
 const {workspaceUser}=useBroker();
 const [view,setView]=useState<'active'|'history'>('active'),[search,setSearch]=useState(''),[broker,setBroker]=useState(''),[page,setPage]=useState(0);
 const [data,setData]=useState<InventoryData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
 const [adding,setAdding]=useState<Assignment|null>(null);
 const [editing,setEditing]=useState<Assignment|null|undefined>(undefined),[returning,setReturning]=useState<Assignment|null|undefined>(undefined),[stockOpen,setStockOpen]=useState(false);
 useEffect(()=>{
  let active=true;setLoading(true);setError('');
  const timer=setTimeout(()=>void inventoryRequest(`/api/sign-inventory?${new URLSearchParams({view,search,broker,page:String(page)})}`).then(r=>{if(active)setData(r);}).catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);}),search?200:0);
  return()=>{active=false;clearTimeout(timer);};
 },[view,search,broker,page,revision]);
 useEffect(()=>{const refresh=()=>setRevision(n=>n+1);window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(timer);},[notice]);
 function reload(message:string){setNotice(message);setRevision(n=>n+1);}
 const actions=(a:Assignment)=><div className="sign-actions"><button disabled={loading||!(a.listing_id||a.transaction_id)} onClick={()=>setEditing(a)}><PencilIcon/>Modifier</button><button title="Ajouter un ajout à la pancarte" disabled={loading||!(a.listing_id||a.transaction_id)} onClick={()=>setAdding(a)}><ShellIcon name="plus"/>Ajout</button><button disabled={loading} onClick={()=>setReturning(a)}><ShellIcon name="return"/>Retourner</button></div>;
 const property=(a:Assignment)=>a.listing_id||a.transaction_id?<a href={a.transaction_id?`/transactions/${a.transaction_id}`:`/listings/${a.listing_id}`}>{view==='history'?a.address_snapshot:a.address}</a>:<strong>{a.address_snapshot}<small>Propriété supprimée</small></strong>;
 const history=(a:Assignment)=><div className="sign-history-dates"><small>Attribué le {inventoryDate(a.created_at)} · {a.created_by}</small>{a.returned_at&&<small>Retourné le {inventoryDate(a.returned_at)} · {a.returned_by}</small>}</div>;
 return <main className="sign-page">
  <header className="sign-header"><div><p className="sign-eyebrow">OUTILS D’ÉQUIPE</p><h1>Pancartes / BAC</h1><p>Le bon matériel, à la bonne adresse.</p></div><div className="sign-header-actions">
   <button className="sign-primary" disabled={!data||loading} onClick={()=>setEditing(null)}><ShellIcon name="plus"/>Attribuer</button>
   <button className="sign-secondary" disabled={!data||loading} onClick={()=>setReturning(null)}><ShellIcon name="return"/>Retourner</button>
   <button className="sign-tertiary" disabled={!data||loading} onClick={()=>setStockOpen(true)}><ShellIcon name="inventory"/>Gérer l’inventaire</button>
  </div></header>
  {notice&&<div className="sign-notice" role="status"><ShellIcon name="check"/>{notice}</div>}
  {error&&<p className="sign-error" role="alert">{error} <button onClick={()=>setRevision(n=>n+1)}>Réessayer</button></p>}
  <section className="sign-availability" aria-label="Disponibilités" aria-busy={loading}><div className="sign-availability-heading"><ShellIcon name="inventory"/><h2>Disponibilités</h2><span>Prêt à repartir</span></div>
   {data?<div className="sign-availability-groups">{([['sign','Pancartes · stock total'],['addon','Ajouts'],['bac','Boîtes à clés']] as const).map(([kind,label])=><div className={`sign-availability-group ${kind}`} key={kind}><h3>{label}</h3>{kind==='sign'?<SignStockSummary stock={data.stock}/>:<dl>{data.stock.filter(s=>s.kind===kind).map(s=><div key={s.id} className={`sign-stock-chip ${Number(s.available)>0?'available':'empty'}`}><dt>{kind==='bac'?<><ShellIcon name="key"/>BAC</>:s.label}</dt><dd>{s.available}<span className="sign-sr"> disponible(s)</span></dd></div>)}</dl>}</div>)}</div>:<p className="sign-hint" role="status">Chargement des disponibilités…</p>}
  </section>
  <section className="sign-ledger" aria-busy={loading}>
   <div className="sign-ledger-heading"><h2>{view==='history'?'Historique du matériel':'Matériel en circulation'}{data&&<span className="sign-count">{data.assignments.count}</span>}</h2><nav aria-label="Vue du matériel">{([['active','En circulation'],['history','Historique']] as const).map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>{setView(id);setPage(0);}}>{id==='history'&&<ShellIcon name="history"/>}{label}</button>)}</nav></div>
   <div className="sign-filters"><InventorySearch value={search} onChange={value=>{setSearch(value);setPage(0);}}/><label className="sign-broker-filter"><span className="sign-sr">Courtier</span><select aria-label="Filtrer par courtier" value={broker} onChange={e=>{setBroker(e.target.value);setPage(0);}}><option value="">Tous les courtiers</option>{data?.stock.filter(s=>s.kind==='sign').map(s=><option key={s.id} value={s.broker!}>{s.label}</option>)}</select></label></div>
   {loading?<div className="sign-loading" role="status">Chargement du matériel…</div>:!error&&data?.assignments.count===0?<div className="sign-empty"><span className="sign-empty-icon"><ShellIcon name={search||broker?'search':view==='history'?'history':'inventory'}/></span><h3>{search||broker?'Aucun matériel trouvé.':view==='history'?'Une histoire à venir.':'Tout le matériel est disponible.'}</h3><p>{search||broker?'Essayez une autre adresse ou un autre courtier.':view==='history'?'Les retours de matériel apparaîtront ici.':'Aucune pancarte n’est actuellement en circulation.'}</p>{view==='active'&&<button className="sign-primary" onClick={()=>setEditing(null)}><ShellIcon name="plus"/>Attribuer du matériel</button>}</div>:!error&&data&&<>
    <div className="sign-table"><table><thead><tr>{['Propriété','Courtier','Matériel','BAC',view==='history'?'Dates':'Actions'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{data.assignments.data.map(a=><tr key={a.id}><td>{property(a)}</td><td><span className="sign-broker-name"><span aria-hidden="true">{a.broker_label.slice(0,1)}</span>{a.broker_label}</span></td><td><MaterialBadges row={a}/></td><td><BacBadge present={a.has_bac}/></td><td>{view==='history'?history(a):actions(a)}</td></tr>)}</tbody></table></div>
    <div className="sign-cards">{data.assignments.data.map(a=><article key={a.id}><div className="sign-card-heading"><h3>{property(a)}</h3><BacBadge present={a.has_bac}/></div><p className="sign-card-broker">{a.broker_label}</p><MaterialBadges row={a}/>{view==='history'?history(a):actions(a)}</article>)}</div>
    {data.assignments.count>50&&<div className="sign-pagination"><button disabled={page===0||loading} onClick={()=>setPage(p=>p-1)}>Précédent</button><span>Page {page+1} / {Math.ceil(data.assignments.count/50)}</span><button disabled={(page+1)*50>=data.assignments.count||loading} onClick={()=>setPage(p=>p+1)}>Suivant</button></div>}
   </>}
  </section>
  {editing!==undefined&&data&&<AssignmentDialog key={editing?.id??'new'} onExisting={(a,addon)=>{if(addon){setEditing(undefined);setAdding(a);}else setEditing(a);}} row={editing} data={data} onClose={()=>setEditing(undefined)} onSaved={()=>{setEditing(undefined);reload(editing?'Matériel modifié':'Matériel attribué');}}/>}
  {adding&&data&&<AddonDialog row={adding} data={data} onClose={()=>setAdding(null)} onSaved={()=>{setAdding(null);reload('Ajout enregistré');}}/>}
  {returning!==undefined&&<ReturnDialog initial={returning} onClose={()=>setReturning(undefined)} onSaved={()=>{setReturning(undefined);reload('Matériel retourné');}}/>}
  {stockOpen&&data&&<StockDialog stock={data.stock} canEdit={canManageStock(workspaceUser)} onClose={()=>setStockOpen(false)} onChanged={()=>setRevision(n=>n+1)} onSaved={()=>{setStockOpen(false);reload('Inventaire mis à jour');}}/>}
 </main>;
}
