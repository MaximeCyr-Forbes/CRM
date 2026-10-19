"use client";
import {useRef,useState,type FormEvent} from 'react';
import {InventoryDialog} from './dialog';
import {inventoryRequest} from '../lib/sign-inventory/client';
import type {Stock} from '../lib/sign-inventory/model';
import {stockChanges} from './stock-draft';
export function StockDialog({stock,canEdit,onClose,onChanged,onSaved}:{stock:Stock[];canEdit:boolean;onClose:()=>void;onChanged:()=>void;onSaved:()=>void}){
 const [baseline,setBaseline]=useState(stock),[draft,setDraft]=useState(()=>Object.fromEntries(stock.map(s=>[s.id,String(s.total)])));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false);const pending=useRef(false);
 const changed=baseline.some(s=>draft[s.id]!==String(s.total));
 async function save(e:FormEvent){e.preventDefault();if(!canEdit||pending.current)return;setError('');let changes;
  try{changes=stockChanges(baseline,draft);}catch(e){setError((e as Error).message);return;}
  pending.current=true;setBusy(true);let saved=false;
  try{for(const s of changes){await inventoryRequest('/api/sign-inventory',{action:'stock',id:s.id,total:s.total,version:s.version});saved=true;setBaseline(rows=>rows.map(row=>row.id===s.id?{...row,total:s.total,available:s.total-Number(row.used),version:row.version+1}:row));}onSaved();}
  catch(e){setError(`${(e as Error).message}${saved?' Les quantités déjà enregistrées sont conservées.':''}`);setConflict(true);}
  finally{if(saved)onChanged();pending.current=false;setBusy(false);}
 }
 async function reload(){if(pending.current)return;pending.current=true;setBusy(true);try{const r=await inventoryRequest();setBaseline(r.stock);setDraft(Object.fromEntries(r.stock.map((s:Stock)=>[s.id,String(s.total)])));setConflict(false);setError('');onChanged();}catch(e){setError((e as Error).message);}finally{pending.current=false;setBusy(false);}}
 return <InventoryDialog title="Gérer l’inventaire" busy={busy} onClose={onClose}><form className="sign-stock-form" onSubmit={e=>void save(e)}><p className="sign-dialog-helper">Les quantités totales que l’équipe possède. Les disponibilités se calculent automatiquement.</p>{!canEdit&&<p className="sign-hint">Connexion à un espace CRM autorisé requise.</p>}
  <fieldset disabled={busy||!canEdit||conflict}><legend className="sign-sr">Quantités totales</legend>{(['sign','bac','addon'] as const).map(kind=><section className="sign-stock-group" key={kind}><h3>{kind==='sign'?'Pancartes':kind==='bac'?'Boîtes à clés':'Ajouts'}</h3>{baseline.filter(s=>s.kind===kind).map(s=><div className="sign-stock-row" key={s.id} data-stock={s.id}><div><label htmlFor={`stock-${s.id}`}>{s.label}</label><small>{s.used} en circulation · {s.available} disponible(s)</small></div><div className="sign-stepper"><button type="button" aria-label={`Diminuer ${s.label}`} disabled={Number(draft[s.id])<=Number(s.used)||draft[s.id]===''} onClick={()=>setDraft(d=>({...d,[s.id]:String(Math.max(Number(s.used),Number(d[s.id])-1))}))}>−</button><input id={`stock-${s.id}`} aria-label={`Total ${s.label}`} title="Quantité totale possédée" type="number" inputMode="numeric" min={Number(s.used)} max="100000" step="1" required value={draft[s.id]} onChange={e=>setDraft(d=>({...d,[s.id]:e.target.value}))}/><button type="button" aria-label={`Augmenter ${s.label}`} disabled={Number(draft[s.id])>=100000} onClick={()=>setDraft(d=>({...d,[s.id]:String(Math.min(100000,Math.max(Number(s.used),Number(d[s.id])||0)+1))}))}>+</button></div></div>)}</section>)}</fieldset>
  {error&&<p role="alert" className="sign-error">{error}{conflict&&<button type="button" disabled={busy} onClick={()=>void reload()}>Recharger les quantités</button>}</p>}
  <footer><button type="button" disabled={busy} onClick={onClose}>{canEdit?'Annuler':'Fermer'}</button>{canEdit&&<button type="submit" className="sign-primary" disabled={busy||!changed||conflict}>{busy?'Enregistrement…':'Enregistrer les modifications'}</button>}</footer>
 </form></InventoryDialog>;
}
