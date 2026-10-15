import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),actor:vi.fn(),origin:vi.fn(),send:vi.fn(),history:vi.fn()}));
vi.mock('../../../../../lib/crm-access',()=>({requireApiAccess:m.access,birthdayWorkspaceActor:m.actor}));
vi.mock('../../../../../lib/google-calendar/config',()=>({isSameOriginRequest:m.origin}));
vi.mock('../../../../../lib/transactions/direct-client-email-server',()=>({sendDirectClientEmail:m.send,directClientEmailHistory:m.history}));
import {GET,POST} from './route';
const ctx={params:Promise.resolve({transactionId:'scope'})};const req=()=>new Request('https://crm.example/api',{method:'POST',body:JSON.stringify({clientIds:['id'],subject:'QA',message:'QA'})});
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({response:null});m.actor.mockResolvedValue('maxime');m.origin.mockReturnValue(true);m.send.mockResolvedValue({sent:1});});
it('requires authentication',async()=>{m.access.mockResolvedValue({response:Response.json({},{status:401})});expect((await POST(req(),ctx)).status).toBe(401);expect(m.send).not.toHaveBeenCalled();});
it('requires same origin and signed workspace',async()=>{m.origin.mockReturnValue(false);expect((await POST(req(),ctx)).status).toBe(403);m.origin.mockReturnValue(true);m.actor.mockResolvedValue(null);expect((await POST(req(),ctx)).status).toBe(403);expect(m.send).not.toHaveBeenCalled();});
it('passes only server transaction scope and verified actor',async()=>{expect((await POST(req(),ctx)).status).toBe(200);expect(m.send).toHaveBeenCalledWith('scope',{clientIds:['id'],subject:'QA',message:'QA'},'maxime');});

it('protects history and disables shared caching',async()=>{m.access.mockResolvedValueOnce({response:Response.json({},{status:401})});expect((await GET(new Request('https://crm.example/api'),ctx)).status).toBe(401);expect(m.history).not.toHaveBeenCalled();m.history.mockResolvedValue({entries:[],hasMore:false});const response=await GET(new Request('https://crm.example/api?offset=50'),ctx);expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(m.history).toHaveBeenCalledWith('scope',50);});
