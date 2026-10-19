import {describe,it,expect,vi} from 'vitest';
import {inventoryStockSchema,addInventoryStockTool} from './inventory-stock';
import type {MCPIdentity} from './access';
import type {SupabaseClient} from '@supabase/supabase-js';
const args={action_id:'00000000-0000-4000-8000-000000000001',inventory_type:'sign',broker:'maxime',quantity:2};
const identity={role:'admin',actor:'maxime'} as MCPIdentity;
describe('additive MCP inventory',()=>{
 it.each([0,-1,-5,1.5,'moins 3','2',null])('rejects quantity %s in schema and backend',async quantity=>{
  expect(inventoryStockSchema.safeParse({...args,quantity}).success).toBe(false);
  await expect(addInventoryStockTool.run({...args,quantity},{} as SupabaseClient,identity)).rejects.toMatchObject({code:'INVENTORY_ADDITION_MUST_BE_POSITIVE'});
 });
 it.each([{broker:null},{broker:'unknown'},{total:0},{new_total:0},{actor:'france'},{inventory_type:'bac'},{inventory_type:'addon',broker:null}])('rejects unsupported input %j',changes=>expect(inventoryStockSchema.safeParse({...args,...changes}).success).toBe(false));
 it('passes only additive parameters to the atomic RPC',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{new_total:7},error:null});
  expect(await addInventoryStockTool.run(args,{rpc} as unknown as SupabaseClient,identity)).toEqual({new_total:7});
  expect(rpc).toHaveBeenCalledWith('crm_mcp_add_inventory_stock',{p_data:{...args,addon_type:null}});
 });
 it('denies stock management to non admin',async()=>{
  const rpc=vi.fn();await expect(addInventoryStockTool.run(args,{rpc} as unknown as SupabaseClient,{...identity,role:'broker'})).rejects.toMatchObject({code:'FORBIDDEN'});expect(rpc).not.toHaveBeenCalled();
 });
});
