import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({access:vi.fn(),actor:vi.fn(),rpc:vi.fn(),order:vi.fn()}));
vi.mock('../../lib/crm-access',()=>({requireApiAccess:mocks.access,birthdayWorkspaceActor:mocks.actor}));
vi.mock('../../lib/supabase/server',()=>({getSupabaseAdmin:()=>({rpc:mocks.rpc,from:()=>({select:()=>({order:mocks.order})})})}));
import {POST,GET} from './route';
beforeEach(()=>{vi.clearAllMocks();mocks.access.mockResolvedValue({response:null});mocks.actor.mockResolvedValue('immoplus');mocks.rpc.mockResolvedValue({data:{id:'bac'},error:null});});
const request=(body:unknown,origin='https://crm.example')=>new Request('https://crm.example/api/sign-inventory',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const stock={action:'stock',id:'bac',total:5,version:0};
it('protects unauthenticated reads',async()=>{mocks.access.mockResolvedValue({response:Response.json({}, {status:401})});expect((await GET(new Request('https://crm.example/api/sign-inventory'))).status).toBe(401);expect(mocks.rpc).not.toHaveBeenCalled();});
it('protects unauthenticated writes',async()=>{mocks.access.mockResolvedValue({response:Response.json({}, {status:401})});expect((await POST(request(stock))).status).toBe(401);expect(mocks.rpc).not.toHaveBeenCalled();});
it('rejects cross-origin writes',async()=>{expect((await POST(request(stock,'https://other.example'))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();});
it('requires a signed operational actor',async()=>{mocks.actor.mockResolvedValue(null);expect((await POST(request(stock))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();});
it.each(['maxime','sandrine','france'])('allows stock adjustments by %s with verified actor',async actor=>{mocks.actor.mockResolvedValue(actor);expect((await POST(request({...stock,actor:'forged'}))).status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith('sign_inventory_write',expect.objectContaining({p_actor:actor}));});
it('passes only the verified actor and returns uncached response',async()=>{const r=await POST(request({...stock,actor:'forged'}));expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toBe('private, no-store');expect(mocks.rpc).toHaveBeenCalledWith('sign_inventory_write',{p_action:'stock',p_actor:'immoplus',p_data:{id:'bac',total:5,version:0}});});
it('preserves business conflict messages',async()=>{mocks.rpc.mockResolvedValue({error:{code:'P0001',message:'Stock insuffisant : BAC.'}});const r=await POST(request(stock));expect(r.status).toBe(409);expect(await r.json()).toEqual({error:'Stock insuffisant : BAC.'});});
it('reads unfiltered server stock even when the ledger shows filtered history',async()=>{
 const signs=[{id:'sign:france',kind:'sign',total:7,used:4,available:3}];
 mocks.order.mockResolvedValue({data:[],error:null});
 mocks.rpc.mockImplementation(async name=>({data:name==='sign_inventory_availability'?signs:{data:[],count:0},error:null}));
 const response=await GET(new Request('https://crm.example/api/sign-inventory?view=history&broker=maxime'));
 expect(response.status).toBe(200);
 expect((await response.json()).stock).toEqual(signs);
 expect(mocks.rpc).toHaveBeenCalledWith('sign_inventory_availability');
});
it('reports inconsistent stock without hiding the raw API evidence',async()=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
 try{
  const signs=[{id:'sign:france',kind:'sign',total:2,used:3,available:-1}];
  mocks.order.mockResolvedValue({data:[],error:null});
  mocks.rpc.mockImplementation(async name=>({data:name==='sign_inventory_availability'?signs:{data:[],count:0},error:null}));
  const response=await GET(new Request('https://crm.example/api/sign-inventory'));
  expect(response.status).toBe(200);
  expect((await response.json()).stock[0].available).toBe(-1);
  expect(warn).toHaveBeenCalledWith('Sign inventory availability inconsistency',expect.objectContaining({total:2,used:3,available:-1}));
 }finally{warn.mockRestore();}
});
