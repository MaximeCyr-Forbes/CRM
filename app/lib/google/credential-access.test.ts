import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { crmMemberContext } from '../auth/context';
import { withSupabaseClient } from '../supabase/request-context';
const mocks = vi.hoisted(() => ({ service: vi.fn(), legacy: vi.fn() }));
vi.mock('../supabase/server', () => ({ getSupabaseServiceClient: mocks.service, getSupabaseAdmin: mocks.legacy }));
import { googleConnectionDatabase, listAuthorizedGoogleConnections } from './credential-access';
const member = { memberId: 'm', identityId: 'i', authUserId: 'u', broker: 'france' as const, role: 'broker' as const, brokers: ['france' as const] };
beforeEach(() => vi.clearAllMocks());
describe('server-only Google credential bridge', () => {
 it('allows only the verified member broker', () => {
  const client = {}; mocks.service.mockReturnValue(client);
  crmMemberContext.run(member, () => {
   expect(googleConnectionDatabase('france')).toBe(client);
   expect(() => googleConnectionDatabase('maxime')).toThrow('inaccessible');
  });
  expect(mocks.service).toHaveBeenCalledTimes(1);
 });
 it('rejects an RLS request without a verified actor instead of escalating', async () => {
  await withSupabaseClient({} as SupabaseClient, async () => {
   expect(() => googleConnectionDatabase('france')).toThrow('requise');
   expect(() => listAuthorizedGoogleConnections()).toThrow('requise');
  });
  expect(mocks.service).not.toHaveBeenCalled(); expect(mocks.legacy).not.toHaveBeenCalled();
 });
 it('filters connection listing by server-derived permissions', () => {
  const filter = vi.fn(); const select = vi.fn(() => ({ in: filter })); const from = vi.fn(() => ({ select }));
  mocks.service.mockReturnValue({ from });
  crmMemberContext.run(member, listAuthorizedGoogleConnections);
  expect(from).toHaveBeenCalledWith('google_calendar_connections');
  expect(filter).toHaveBeenCalledWith('broker', ['france']);
 });
 it('preserves the existing trusted scheduler path', () => {
  const client = {}; mocks.legacy.mockReturnValue(client);
  expect(googleConnectionDatabase('maxime')).toBe(client);
 });
});
