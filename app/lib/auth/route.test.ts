import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crmMemberContext } from './context';
import { supabaseRequestContext } from '../supabase/request-context';
const state = vi.hoisted(() => ({ enabled: true, resolve: vi.fn(), cookies: [] as {name:string;value:string}[] }));
vi.mock('./server', () => ({ googleLoginEnabled: () => state.enabled, getAuthenticatedMember: state.resolve }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => state.cookies }) }));
import { withCRMIdentity } from './route';
beforeEach(() => { state.enabled=true;state.cookies=[];state.resolve.mockReset(); });
describe('individual identity request boundary', () => {
 it('binds the verified actor and RLS client for the whole handler', async () => {
  const member={memberId:'m',identityId:'i',authUserId:'u',broker:'maxime',role:'admin',brokers:['maxime','france']}; const client={};
  state.resolve.mockResolvedValue({member,client});
  const response=await withCRMIdentity(async () => {
   await Promise.resolve(); expect(crmMemberContext.getStore()).toBe(member);expect(supabaseRequestContext.getStore()).toBe(client);
   return Response.json({ok:true});
  })();
  expect(response.status).toBe(200);expect(crmMemberContext.getStore()).toBeUndefined();expect(supabaseRequestContext.getStore()).toBeUndefined();
 });
 it('rejects a disabled individual identity even alongside a legacy cookie', async () => {
  state.resolve.mockResolvedValue(null);state.cookies=[{name:'sb-project-auth-token.0',value:'rejected'},{name:'ef_crm_access',value:'legacy'}];
  const handler=vi.fn();expect((await withCRMIdentity(handler)()).status).toBe(403);expect(handler).not.toHaveBeenCalled();
 });
 it('fails closed when live membership cannot be verified', async () => {
  state.resolve.mockRejectedValue(new Error('unavailable'));const handler=vi.fn();
  expect((await withCRMIdentity(handler)()).status).toBe(503);expect(handler).not.toHaveBeenCalled();
 });
 it('preserves the legacy handler guard during gradual rollout', async () => {
  state.resolve.mockResolvedValue(null);const handler=vi.fn(async()=>Response.json({error:'legacy guard'},{status:401}));
  expect((await withCRMIdentity(handler)()).status).toBe(401);expect(handler).toHaveBeenCalledOnce();
 });
});
