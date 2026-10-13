import {beforeEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({access:vi.fn(),history:vi.fn()}));
vi.mock('../../../../lib/crm-access',()=>({requireApiAccess:mock.access}));
vi.mock('../../../../lib/accounting/balances-server',()=>({listBalanceHistory:mock.history}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();mock.access.mockResolvedValue({response:null});mock.history.mockResolvedValue({data:[],nextCursor:null});});
it('requires CRM authentication before reading history',async()=>{
 mock.access.mockResolvedValue({response:Response.json({}, {status:401})});
 expect((await GET(new Request('https://crm.example/api/accounting/balances/history?broker=a'))).status).toBe(401);expect(mock.history).not.toHaveBeenCalled();
});
it('returns a private uncached page for the requested broker and cursor',async()=>{
 const response=await GET(new Request('https://crm.example/api/accounting/balances/history?broker=a&before=10'));
 expect(mock.history).toHaveBeenCalledWith('a','10');expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(await response.json()).toEqual({data:[],nextCursor:null});
});
