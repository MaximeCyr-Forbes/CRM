import {it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({state:{last_success_at:'2026-11-13',status:'success'},schedule:true,limit:vi.fn(),runs:[{started_at:'2026-11-13',status:'success',trigger_source:'cron',result:{created:0,updated:0,unchanged:18,secret:'not for UI'}}]}));
vi.mock('../supabase/server',()=>({getSupabaseServiceClient:()=>({from:(table:string)=>({select:()=>table==='centris_sync_state'?{eq:()=>({single:async()=>({data:mock.state,error:null})})}:{order:()=>({limit:(n:number)=>{mock.limit(n);return Promise.resolve({data:mock.runs,error:null});}})}}),rpc:async()=>({data:mock.schedule,error:null})})}));
vi.mock('./client',async original=>({...await original<typeof import('./client')>(),isConfigured:()=>true}));
import {centrisStatus} from './sync';
it('exposes at most ten summarized runs and uses the real scheduler state',async()=>{
 const status=await centrisStatus();expect(status.automatic).toBe(true);expect(status.connected).toBe(true);expect(mock.limit).toHaveBeenCalledWith(10);
 expect(status.history?.[0]).toMatchObject({unchanged:18,source:'cron',created:0});expect(JSON.stringify(status.history)).not.toContain('secret');
 mock.schedule=false;mock.state.status='failed';const failed=await centrisStatus();expect(failed.automatic).toBe(false);expect(failed.connected).toBe(false);
});
