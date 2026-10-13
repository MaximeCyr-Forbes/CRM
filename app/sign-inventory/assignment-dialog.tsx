"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {InventoryDialog} from './dialog';
import {inventoryRequest} from '../lib/sign-inventory/client';
import type {Assignment,InventoryData,PropertyChoice} from '../lib/sign-inventory/model';
import {LISTING_STATUS_LABELS,type ListingStatus} from '../data/listing-types';
import {ShellIcon} from '../components/shell-icons';
export function AssignmentDialog({row,data,onClose,onSaved}:{row:Assignment|null;data:InventoryData;onClose:()=>void;onSaved:()=>void}){
 const [id]=useState(()=>row?.id??crypto.randomUUID());
 const [property,setProperty]=useState<PropertyChoice|null>(row?.listing_id?{id:row.listing_id,address:row.address,broker:row.broker,status:''}:null);
 const [search,setSearch]=useState(''),[choices,setChoices]=useState<PropertyChoice[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState('');
 const [broker,setBroker]=useState(row?.broker??''),[type,setType]=useState(row?.sign_type??(row?'':data.types.find(t=>t.id==='sale')?.id??data.types[0]?.id??''));
 const [addons,setAddons]=useState(row?.addons.map(a=>a.id)??[]),[bac,setBac]=useState(row?.has_bac??false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef(false);
 useEffect(()=>{
  if(property)return;let active=true;setSearching(true);setSearchError('');
  const timer=setTimeout(()=>void inventoryRequest(`/api/sign-inventory/listings?search=${encodeURIComponent(search)}`).then(r=>{if(active)setChoices(r.data);}).catch(e=>{if(active)setSearchError((e as Error).message);}).finally(()=>{if(active)setSearching(false);}),200);
  return()=>{active=false;clearTimeout(timer);};
 },[search,property]);
 function choose(p:PropertyChoice){setProperty(p);if(data.stock.some(s=>s.kind==='sign'&&s.broker===p.broker))setBroker(p.broker);else setBroker('');}
 const available=(stockId:string)=>{
  const s=data.stock.find(s=>s.id===stockId);const own=row&&(stockId===`sign:${row.broker}`&&row.sign_type||stockId==='bac'&&row.has_bac||row.addons.some(a=>a.id===stockId));
  return Number(s?.available??0)+(own?1:0);
 };
 async function save(e:FormEvent){e.preventDefault();if(pending.current)return;setError('');if(!property){setError('Sélectionnez une propriété du CRM.');return;}pending.current=true;setBusy(true);
  try{await inventoryRequest('/api/sign-inventory',{action:row?'edit':'assign',id,version:row?.version??0,listing_id:property.id,broker,sign_type:type||null,has_bac:bac,addons});onSaved();}
  catch(e){setError((e as Error).message);}finally{pending.current=false;setBusy(false);}
 }
 return <InventoryDialog title={row?'Modifier le matériel':'Attribuer du matériel'} busy={busy} onClose={onClose}><form onSubmit={e=>void save(e)}>
  <fieldset disabled={busy}>
   <legend className="sign-sr">Matériel à installer</legend>
   <label>Propriété {property?<div className="sign-selected"><strong>{property.address}</strong><button type="button" onClick={()=>setProperty(null)}>Changer</button></div>:<input autoFocus type="search" placeholder="Rechercher une propriété…" value={search} onChange={e=>setSearch(e.target.value)}/>}</label>
   {!property&&<div className="sign-property-choices" aria-label="Propriétés du CRM">{searching?<p role="status">Recherche…</p>:searchError?<p role="alert">{searchError}</p>:choices.length?choices.map(p=><button type="button" key={p.id} onClick={()=>choose(p)}><strong>{p.address}</strong><small>{LISTING_STATUS_LABELS[p.status as ListingStatus]??p.status}</small></button>):<p>Aucune propriété trouvée.</p>}</div>}
   <div className="sign-form-grid"><label>Courtier<select required value={broker} onChange={e=>setBroker(e.target.value)}><option value="">Choisir un courtier</option>{data.stock.filter(s=>s.kind==='sign').map(s=><option key={s.id} value={s.broker!}>{s.label}</option>)}</select></label>
   <label>Type de pancarte<select value={type} onChange={e=>setType(e.target.value)}><option value="">Aucune pancarte</option>{data.types.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label></div>
   {broker&&type&&<p className={`sign-hint ${available(`sign:${broker}`)<=0?'sign-stock-warning':''}`}>{available(`sign:${broker}`)<=0?`Aucune pancarte disponible pour ${data.stock.find(s=>s.broker===broker)?.label??broker}. Choisissez un autre courtier ou ajustez l’inventaire.`:`${available(`sign:${broker}`)} pancarte(s) disponible(s)`}</p>}
   <div className="sign-options"><p>Ajouts</p>{data.stock.filter(s=>s.kind==='addon').map(s=><label key={s.id}><input type="checkbox" checked={addons.includes(s.id)} disabled={!addons.includes(s.id)&&available(s.id)<=0} onChange={e=>setAddons(a=>e.target.checked?[...a,s.id]:a.filter(id=>id!==s.id))}/><span>{s.label}</span><small>{available(s.id)} disponible(s)</small></label>)}</div>
   <label className="sign-bac"><input type="checkbox" checked={bac} disabled={!bac&&available('bac')<=0} onChange={e=>setBac(e.target.checked)}/><ShellIcon name="key"/> Boîte à clés <small>{available('bac')} disponible(s)</small></label>
  </fieldset>
  {error&&<p role="alert" className="sign-error">{error}</p>}
  <footer><button type="button" disabled={busy} onClick={onClose}>Annuler</button><button className="sign-primary" disabled={busy||!property||!broker||(!!type&&available(`sign:${broker}`)<=0)} type="submit">{busy?'Enregistrement…':row?'Enregistrer':'Attribuer'}</button></footer>
 </form></InventoryDialog>;
}
