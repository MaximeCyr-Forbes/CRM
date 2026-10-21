"use client";
import {useRef,useState,type FormEvent} from 'react';
import {InventoryDialog} from './dialog';
import {inventoryRequest} from '../lib/sign-inventory/client';
import {requiresPhysicalSign,type Assignment,type InventoryData} from '../lib/sign-inventory/model';

export function addonEdit(row:Assignment,selected:string[]){
 return {action:'edit',id:row.id,version:row.version,listing_id:row.listing_id,...(row.transaction_id?{transaction_id:row.transaction_id}:{}),broker:row.broker,sign_type:row.sign_type,has_bac:row.has_bac,addons:[...new Set([...row.addons.map(a=>a.id),...selected])]};
}
export function AddonDialog({row,data,onClose,onSaved}:{row:Assignment;data:InventoryData;onClose:()=>void;onSaved:()=>void}){
 const [selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef(false);
 const needsSign=!requiresPhysicalSign(row.sign_type,row.addons);
 const signAvailable=data.stock.find(s=>s.id===`sign:${row.broker}`)?.available??0;
 async function save(e:FormEvent){
  e.preventDefault();if(pending.current||!selected.length||(needsSign&&signAvailable<=0))return;
  pending.current=true;setBusy(true);setError('');
  try{await inventoryRequest('/api/sign-inventory',addonEdit(row,selected));onSaved();}
  catch(e){setError((e as Error).message);}finally{pending.current=false;setBusy(false);}
 }
 return <InventoryDialog title="Ajouter un ajout" busy={busy} onClose={onClose}><form onSubmit={e=>void save(e)}>
  <p className="sign-addon-address"><strong>{row.address}</strong><br/>{row.broker_label}</p>
  {needsSign&&<p className="sign-hint">Cette attribution contient seulement un BAC. Ajouter un ajout mobilisera aussi une pancarte de {row.broker_label} ({signAvailable} disponible(s)).</p>}
  {needsSign&&signAvailable<=0&&<p className="sign-error" role="alert">Aucune pancarte disponible pour ce courtier.</p>}
  <fieldset className="sign-options" disabled={busy}><legend className="sign-sr">Ajouts disponibles</legend>
   {data.stock.filter(s=>s.kind==='addon').map(s=>{
    const present=row.addons.some(a=>a.id===s.id);
    return <label key={s.id}><input type="checkbox" checked={present||selected.includes(s.id)} disabled={present||s.available<=0||(needsSign&&signAvailable<=0)} onChange={e=>setSelected(old=>e.target.checked?[...old,s.id]:old.filter(id=>id!==s.id))}/><span>{s.label}</span><small>{present?'Déjà associé':s.available<=0?`Aucun « ${s.label} » disponible à l’entrepôt.`:`${s.available} disponible(s)`}</small></label>;
   })}
  </fieldset>
  {error&&<p role="alert" className="sign-error">{error}</p>}
  <footer><button type="button" disabled={busy} onClick={onClose}>Annuler</button><button className="sign-primary" type="submit" disabled={busy||!selected.length||(needsSign&&signAvailable<=0)}>{busy?'Enregistrement…':'Enregistrer'}</button></footer>
 </form></InventoryDialog>;
}
