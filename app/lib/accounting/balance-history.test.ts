import {beforeEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),select:vi.fn(),eq:vi.fn(),order:vi.fn(),limit:vi.fn(),lt:vi.fn(),result:{data:[] as unknown[],error:null as unknown}}));
vi.mock('../supabase/server',()=>({getSupabaseAdmin:()=>mock}));
import {listBalanceHistory} from './balances-server';
beforeEach(()=>{
 vi.clearAllMocks();mock.result={data:[],error:null};mock.rpc.mockResolvedValue({data:[{broker:'broker_a'}],error:null});
 const query={select:mock.select,eq:mock.eq,order:mock.order,limit:mock.limit,lt:mock.lt,then:(resolve:Function)=>Promise.resolve(mock.result).then(value=>resolve(value))};
 for(const fn of [mock.from,mock.select,mock.eq,mock.order,mock.limit,mock.lt])fn.mockReturnValue(query);
});
it('scopes history to the requested broker and orders newest first',async()=>{
 expect(await listBalanceHistory('broker_a',null)).toEqual({data:[],nextCursor:null});
 expect(mock.eq).toHaveBeenCalledWith('broker','broker_a');expect(mock.order).toHaveBeenCalledWith('version',{ascending:false});
});
it('returns twenty entries and a stable cursor without dropping the next entry',async()=>{
 mock.result.data=Array.from({length:21},(_,i)=>({version:31-i}));
 const result=await listBalanceHistory('broker_a',null);expect(result.data).toHaveLength(20);expect(result.nextCursor).toBe(12);
 await listBalanceHistory('broker_a','12');expect(mock.lt).toHaveBeenCalledWith('version',12);
});
it.each([null,'unknown'])('rejects unknown broker %s before reading history',async broker=>{
 await expect(listBalanceHistory(broker,null)).rejects.toMatchObject({status:400});expect(mock.from).not.toHaveBeenCalled();
});
it.each(['0','-1','1.2','abc','2147483648'])('rejects invalid cursor %s',async cursor=>{
 await expect(listBalanceHistory('broker_a',cursor)).rejects.toMatchObject({status:400});expect(mock.from).not.toHaveBeenCalled();
});
it('surfaces database failure instead of presenting an empty history',async()=>{
 mock.result.error=new Error('unavailable');await expect(listBalanceHistory('broker_a',null)).rejects.toThrow('unavailable');
});
