import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),actor:vi.fn(),origin:vi.fn(),sync:vi.fn()}));
vi.mock('../../../../lib/auth/route',()=>({withCRMIdentity:(handler:unknown)=>handler}));
vi.mock('../../../../lib/crm-access',()=>({requireApiAccess:m.access}));
vi.mock('../../../../lib/auth/context',()=>({crmMemberContext:{getStore:m.actor}}));
vi.mock('../../../../lib/google-calendar/config',()=>({isSameOriginRequest:m.origin}));
vi.mock('../../../../lib/centris/sync',()=>({syncCentris:m.sync}));
import {POST} from './route';
const req=(body:unknown={dryRun:true})=>new Request('https://crm.example/api/listings/centris/sync',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({response:null});m.actor.mockReturnValue({memberId:'verified',broker:'france'});m.origin.mockReturnValue(true);m.sync.mockResolvedValue({dryRun:true});});
it('rejects anonymous requests and missing identity',async()=>{
 m.access.mockResolvedValueOnce({response:Response.json({},{status:401})});expect((await POST(req())).status).toBe(401);
 m.actor.mockReturnValue(null);expect((await POST(req())).status).toBe(403);expect(m.sync).not.toHaveBeenCalled();
});
it('rejects cross-origin calls and broker injection',async()=>{
 m.origin.mockReturnValueOnce(false);expect((await POST(req())).status).toBe(403);
 expect((await POST(req({dryRun:false,broker:'maxime'}))).status).toBe(400);expect(m.sync).not.toHaveBeenCalled();
});
it('uses only verified server actor and disables caching',async()=>{
 const response=await POST(req());expect(response.status).toBe(200);
 expect(m.sync).toHaveBeenCalledWith({memberId:'verified',broker:'france',source:'manual'},true);
 expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
it('does not expose raw credentials or errors',async()=>{
 m.sync.mockRejectedValue(new Error('private upstream content'));const response=await POST(req());
 expect(response.status).toBe(503);expect(await response.text()).not.toContain('private upstream');
});
