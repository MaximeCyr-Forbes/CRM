import {ShellIcon} from '../components/shell-icons';
import type {Assignment} from '../lib/sign-inventory/model';
export const inventoryDate=(value:string)=>new Intl.DateTimeFormat('fr-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Toronto'}).format(new Date(value));
export function MaterialBadges({row}:{row:Assignment}){
 return <div className="sign-materials">{row.sign_type&&<span className={`sign-badge ${row.sign_type}`}>{row.sign_label}</span>}{row.addons.map(x=><span className={`sign-badge sign-addon ${x.id.replace('addon:','')}`} key={x.id}>{x.label}</span>)}{!row.sign_type&&!row.addons.length&&<span className="sign-muted">Sans pancarte</span>}</div>;
}
export function BacBadge({present}:{present:boolean}){return present?<span className="sign-badge sign-bac-badge"><ShellIcon name="key"/>BAC</span>:<span className="sign-muted" aria-label="Aucune boîte à clés">—</span>;}
export function InventorySearch({value,onChange,autoFocus=false}:{value:string;onChange:(value:string)=>void;autoFocus?:boolean}){
 return <label className="sign-search"><span className="sign-sr">Rechercher une propriété</span><ShellIcon name="search"/><input autoFocus={autoFocus} type="search" placeholder="Rechercher une propriété…" value={value} onChange={e=>onChange(e.target.value)}/></label>;
}
