"use client";
import {useEffect,useRef,useState} from 'react';
import {InventoryDialog} from './dialog';
import {MaterialBadges,BacBadge,InventorySearch,inventoryDate} from './presentation';
import {ShellIcon} from '../components/shell-icons';
import {inventoryRequest} from '../lib/sign-inventory/client';
import type {Assignment} from '../lib/sign-inventory/model';
export function ReturnDialog({initial,onClose,onSaved}:{initial:Assignment|null;onClose:()=>void;onSaved:()=>void}){
 const [selected,setSelected]=useState(initial),[search,setSearch]=useState(''),[page,setPage]=useState(0),[rows,setRows]=useState<Assignment[]>([]),[count,setCount]=useState(0);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);const pending=useRef(false);
 useEffect(()=>{
  if(selected)return;let active=true;setLoading(true);setError('');
  const timer=setTimeout(()=>void inventoryRequest(`/api/sign-inventory?${new URLSearchParams({view:'active',search,page:String(page)})}`).then(r=>{if(active){setRows(r.assignments.data);setCount(r.assignments.count);}}).catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);}),search?200:0);
  return()=>{active=false;clearTimeout(timer);};
 },[search,page,selected,retry]);
 async function confirm(){if(!selected||pending.current)return;pending.current=true;setBusy(true);setError('');try{await inventoryRequest('/api/sign-inventory',{action:'return',id:selected.id,version:selected.version});onSaved();}catch(e){setError((e as Error).message);}finally{pending.current=false;setBusy(false);}}
 return <InventoryDialog title="Retourner du matériel" busy={busy} onClose={onClose}><div className="sign-dialog-body sign-return-body">
  {selected?<><p className="sign-dialog-helper">Ce matériel a été récupéré et peut être remis en disponibilité.</p><article className="sign-return-selection"><span className="sign-selection-icon"><ShellIcon name="return"/></span><h3>{selected.address}</h3><p>{selected.broker_label}</p><MaterialBadges row={selected}/><BacBadge present={selected.has_bac}/><small>Attribué le {inventoryDate(selected.created_at)}</small></article><button className="sign-text-button" disabled={busy} onClick={()=>{setSelected(null);setError('');}}>Choisir une autre attribution</button></>:<>
   <p className="sign-dialog-helper">Sélectionnez la propriété où le matériel a été récupéré.</p><InventorySearch autoFocus value={search} onChange={value=>{setSearch(value);setPage(0);}}/>
   <div className="sign-return-results" aria-busy={loading}>{loading?<p role="status" className="sign-hint">Recherche du matériel…</p>:!error&&rows.length===0?<div className="sign-dialog-empty"><ShellIcon name="check"/><p>{search?'Aucun matériel trouvé à cette adresse.':'Tout le matériel est déjà disponible.'}</p></div>:!loading&&rows.map((row,index)=><button className="sign-return-choice" key={row.id} onClick={()=>setSelected(row)}><strong>{row.address}</strong><span>{row.broker_label}</span><MaterialBadges row={row}/><BacBadge present={row.has_bac}/><small>Ensemble {page*50+index+1} · {inventoryDate(row.created_at)}</small><span className="sign-choice-arrow" aria-hidden="true">→</span></button>)}</div>
   {count>50&&!loading&&<div className="sign-pagination"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Précédent</button><span>{page+1} / {Math.ceil(count/50)}</span><button disabled={(page+1)*50>=count} onClick={()=>setPage(p=>p+1)}>Suivant</button></div>}
  </>}
  {error&&<p role="alert" className="sign-error">{error} {!selected&&<button onClick={()=>setRetry(n=>n+1)}>Réessayer</button>}</p>}
  <footer><button disabled={busy} onClick={onClose}>Annuler</button>{selected&&<button className="sign-primary" disabled={busy} onClick={()=>void confirm()}><ShellIcon name="return"/>{busy?'Enregistrement…':'Confirmer le retour'}</button>}</footer>
 </div></InventoryDialog>;
}
