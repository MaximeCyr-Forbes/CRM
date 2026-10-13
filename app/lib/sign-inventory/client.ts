import {workspaceRequest} from '../workspace-request';
export async function inventoryRequest(url='/api/sign-inventory',body?:unknown){
 const r=body===undefined?await fetch(url,{cache:'no-store'}):await workspaceRequest(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw new Error(data.error??'Opération impossible. Réessayez.');return data;
}
