import { crmMemberContext } from '../auth/context';
import {getSupabaseAdmin} from '../supabase/server';
import {birthdayWorkspaceActor,requireApiAccess} from '../crm-access';
import {InventoryError,canManageStock,mutation} from './model';
import type {WorkspaceUser} from '../workspace';
export async function inventoryRoute(request:Request,action:(actor:WorkspaceUser|null)=>Promise<unknown>){
 const access=await requireApiAccess();if(access.response)return access.response;
 try{
  let actor:WorkspaceUser|null=null;
  if(request.method!=='GET'){
   if(request.headers.get('origin')!==new URL(request.url).origin)throw new InventoryError('Origine refusée.',403);
   actor=await birthdayWorkspaceActor(request);if(!actor)throw new InventoryError('Sélectionnez votre espace utilisateur.',403);
  }
  return Response.json(await action(actor),{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){
  const db=e as {code?:string;message?:string};
  const known=e instanceof InventoryError||db.code==='P0001';
  if(!known)console.error('Sign inventory operation failed',{code:db.code});
  return Response.json({error:known?db.message:'Opération impossible. Actualisez et réessayez ; le matériel déjà enregistré est conservé.'},{status:e instanceof InventoryError?e.status:db.code==='P0001'?409:502,headers:{'Cache-Control':'private, no-store'}});
 }
}
export async function readInventory(params:URLSearchParams){
 const db=getSupabaseAdmin(),page=Number(params.get('page')??0);
 if(!Number.isInteger(page)||page<0||page>100000)throw new InventoryError('Page invalide.');
 const results=await Promise.all([
  db.rpc(crmMemberContext.getStore()?'crm_inventory_availability':'sign_inventory_availability'),db.from('sign_inventory_types').select('id,label').order('label'),
  db.rpc('sign_inventory_assignments',{p_returned:params.get('view')==='history',p_search:(params.get('search')??'').slice(0,160),p_broker:params.get('broker')??'',p_page:page})
 ]);
 for(const r of results)if(r.error)throw r.error;
 return {stock:results[0].data,types:results[1].data,assignments:results[2].data};
}
export async function writeInventory(input:unknown,actor:WorkspaceUser,options: {mcp?:boolean} = {}){
 const {action,data}=mutation(input);
 if(action==='stock'&&!canManageStock(actor))throw new InventoryError('Seuls les administrateurs et adjointes peuvent modifier le stock total.',403);
 const db=getSupabaseAdmin();
 if(action==='assign'||action==='edit'){
  const {data:stocks,error}=await db.rpc(options.mcp || crmMemberContext.getStore()?'crm_inventory_availability':'sign_inventory_availability');if(error)throw error;
  if(!stocks.some((s:{broker:string|null})=>s.broker===('broker' in data?data.broker:null)))throw new InventoryError('Courtier introuvable.');
 }
 const {data:result,error}=await db.rpc(options.mcp || crmMemberContext.getStore()?'crm_inventory_write':'sign_inventory_write',{p_action:action,p_data:data,p_actor:actor});if(error)throw error;
 return result;
}
export async function searchProperties(search:string){
 const {data,error}=await getSupabaseAdmin().rpc('sign_inventory_listings',{p_search:search.slice(0,160)});if(error)throw error;return {data};
}
