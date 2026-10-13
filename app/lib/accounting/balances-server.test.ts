import {beforeEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase/server',()=>({getSupabaseAdmin:()=>mock}));
import {listBrokerBalances,setBrokerBalance} from './balances-server';
const rows=[{broker:'france',label:'Courtier A',balance:'0.00',version:0,updated_at:null,updated_by:null},{broker:'sandrine',label:'Courtier B',balance:'0.00',version:0,updated_at:null,updated_by:null}];
beforeEach(()=>{mock.rpc.mockReset();mock.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>name==='accounting_list_broker_balances'?{data:rows,error:null}:{data:[{broker:args.p_broker,balance:args.p_balance,version:1,updated_by:args.p_actor}],error:null});});
describe('Balance server',()=>{
 it('uses dynamic list and zero defaults returned by database',async()=>expect(await listBrokerBalances()).toEqual(rows));
 it('uses server actor, ignores a forged updated_by',async()=>{const result=await setBrokerBalance({broker:'france',balance:'1250,75',version:0,updated_by:'sandrine'},'immoplus');expect(result.updated_by).toBe('immoplus');expect(mock.rpc).toHaveBeenLastCalledWith('accounting_set_broker_balance',{p_broker:'france',p_balance:'1250.75',p_actor:'immoplus',p_expected_version:0});});
 it('rejects cross-broker modification',async()=>{await expect(setBrokerBalance({broker:'sandrine',balance:'5',version:0},'france')).rejects.toMatchObject({status:403});expect(mock.rpc).toHaveBeenCalledTimes(1);});
 it('rejects unknown broker',async()=>{await expect(setBrokerBalance({broker:'unknown',balance:'5',version:0},'maxime')).rejects.toMatchObject({status:400});expect(mock.rpc).toHaveBeenCalledTimes(1);});
 it('rejects invalid amount before database calls',async()=>{await expect(setBrokerBalance({broker:'france',balance:'5.555',version:0},'france')).rejects.toThrow();expect(mock.rpc).not.toHaveBeenCalled();});
 it('maps an empty compare-and-save result to 409',async()=>{mock.rpc.mockResolvedValueOnce({data:rows,error:null}).mockResolvedValueOnce({data:[],error:null});await expect(setBrokerBalance({broker:'france',balance:'5',version:0},'france')).rejects.toMatchObject({status:409});});
 it('surfaces stale version as conflict instead of overwriting',async()=>{mock.rpc.mockResolvedValueOnce({data:rows,error:null}).mockResolvedValueOnce({data:null,error:{code:'40001'}});await expect(setBrokerBalance({broker:'france',balance:'5',version:0},'france')).rejects.toMatchObject({status:409});});
});
