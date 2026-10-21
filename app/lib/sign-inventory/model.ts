import {hasCRMFunctionalAccess,type WorkspaceUser} from '../workspace';
export type Stock={id:string;kind:'sign'|'addon'|'bac';broker:string|null;label:string;total:number;used:number;available:number;version:number};
export type SignType={id:string;label:string};
export type PropertyChoice={id:string;address:string;broker:string;status:string;source?:'listing'|'transaction';active_assignments?:Assignment[]};
export type Assignment={id:string;listing_id:string|null;transaction_id?:string|null;address:string;address_snapshot:string;broker:string;broker_label:string;sign_type:string|null;sign_label:string|null;has_bac:boolean;addons:SignType[];version:number;created_at:string;created_by:string;updated_at:string;updated_by:string;returned_at:string|null;returned_by:string|null};
export type InventoryData={stock:Stock[];types:SignType[];assignments:{data:Assignment[];count:number}};
export function requiresPhysicalSign(signType:string|null,addons:readonly unknown[]){return Boolean(signType)||addons.length>0;}
export class InventoryError extends Error {constructor(message:string,public status=400){super(message);}}
export function canManageStock(actor:WorkspaceUser|null){return hasCRMFunctionalAccess(actor);}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function integer(value:unknown,max=2147483646){if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>max)throw new InventoryError('Quantité ou version invalide.');return value;}
export function mutation(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new InventoryError('Requête invalide.');
 const b=input as Record<string,unknown>,action=b.action;
 if(!['stock','assign','edit','return'].includes(String(action)))throw new InventoryError('Opération invalide.');
 if(typeof b.id!=='string'||b.id.length>100)throw new InventoryError('Identifiant invalide.');
 if(action==='stock')return {action,data:{id:b.id,total:integer(b.total,100000),version:integer(b.version)}};
 if(!uuid.test(b.id))throw new InventoryError('Attribution invalide.');
 const version=action==='assign'?0:integer(b.version);
 if(action==='return')return {action,data:{id:b.id,version}};
 const listing=typeof b.listing_id==='string'&&uuid.test(b.listing_id),transaction=typeof b.transaction_id==='string'&&uuid.test(b.transaction_id);
 if(listing===transaction||(b.listing_id!=null&&!listing)||(b.transaction_id!=null&&!transaction))throw new InventoryError('Sélectionnez une propriété du CRM.');
 if(typeof b.broker!=='string'||!b.broker||b.broker.length>80)throw new InventoryError('Sélectionnez un courtier.');
 if(b.sign_type!==null&&(typeof b.sign_type!=='string'||b.sign_type.length>80))throw new InventoryError('Type de pancarte invalide.');
 if(typeof b.has_bac!=='boolean'||!Array.isArray(b.addons)||b.addons.length>30||b.addons.some(x=>typeof x!=='string'||x.length>100)||new Set(b.addons).size!==b.addons.length)throw new InventoryError('Matériel invalide.');
 if(!b.sign_type&&!b.has_bac&&!b.addons.length)throw new InventoryError('Sélectionnez au moins un article.');
 return {action,data:{id:b.id,version,listing_id:b.listing_id??null,...(transaction?{transaction_id:b.transaction_id}:{}),broker:b.broker,sign_type:b.sign_type,has_bac:b.has_bac,addons:b.addons}};
}
