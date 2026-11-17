import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CRMMember } from '../auth/identity';
const mocks = vi.hoisted(() => ({ listings: vi.fn() }));
vi.mock('../listings/server-service', () => ({ listListings: mocks.listings, getListing: vi.fn() }));
import { runReadTool } from './tools';
const id = '11111111-1111-4111-8111-111111111111';
const member: CRMMember = { memberId: id, identityId: id, authUserId: id, broker: 'maxime', brokers: ['maxime'], role: 'broker' };
beforeEach(() => mocks.listings.mockReset().mockResolvedValue([]));
function database(rows: unknown[], contact: unknown = { id }) {
  const q: Record<string, any> = {};
  for (const name of ['select', 'eq', 'not', 'order']) q[name] = vi.fn(() => q);
  q.limit = vi.fn(async () => ({ data: rows, error: null }));
  q.maybeSingle = vi.fn(async () => ({ data: contact, error: null }));
  const from = vi.fn((_table: string) => q);
  return { client: { from } as unknown as SupabaseClient, from, q };
}
it('uses the existing commercial active-listing service and limits excerpts', async () => {
  mocks.listings.mockResolvedValue(Array.from({length: 8}, () => ({id, address:'Rue Exemple', status:'active', purpose:'sale', broker:'maxime'})));
  const result = await runReadTool('crm_get_active_broker_listings', {broker:'maxime'}, {} as SupabaseClient, member);
  expect(mocks.listings).toHaveBeenCalledWith({broker:'maxime',status:'active'});
  expect(result.data).toMatchObject({total:8,truncated:true});
  expect((result.data as {listings:unknown[]}).listings).toHaveLength(5);
  expect(result.links[0].href).toBe(`/listings/${id}`);
});
it.each(['crm_get_active_broker_listings','crm_get_active_broker_transactions'])('rejects an unauthorized broker in %s', async name => {
  const db=database([]);
  await expect(runReadTool(name,{broker:'france'},db.client,member)).rejects.toThrow('inaccessible');
  expect(db.from).not.toHaveBeenCalled();expect(mocks.listings).not.toHaveBeenCalled();
});
it('filters active transactions in the authenticated database and never writes', async () => {
  const db=database([{id,address:'Rue Exemple',status:'inspection'}]);
  const result=await runReadTool('crm_get_active_broker_transactions',{broker:'maxime'},db.client,member);
  expect(db.from).toHaveBeenCalledWith('transactions');
  expect(db.q.eq).toHaveBeenCalledWith('broker','maxime');
  expect(db.q.not).toHaveBeenCalledWith('status','in','(completed,cancelled)');
  expect(result.links).toEqual([{href:`/transactions/${id}`,label:'Rue Exemple'}]);
});
it('uses the real owner relation, not matching names or addresses', async () => {
  const db=database([{listing_id:id,listings:{id,address:'Rue Exemple'}}]);
  const result=await runReadTool('crm_get_contact_listings',{contact_id:id},db.client,member);
  expect(db.from.mock.calls.map(call=>call[0])).toEqual(['contacts','listing_contacts']);
  expect(db.q.eq).toHaveBeenCalledWith('contact_id',id);expect(db.q.eq).toHaveBeenCalledWith('role','owner');
  expect(result.links).toEqual([{href:`/listings/${id}`,label:'Rue Exemple'}]);
});
it('denies inaccessible contacts before querying relationships', async () => {
  const db=database([],null);
  await expect(runReadTool('crm_get_contact_listings',{contact_id:id},db.client,member)).rejects.toThrow('inaccessible');
  expect(db.from).toHaveBeenCalledTimes(1);
});
it('returns an explicit empty relationship rather than inventing a listing', async () => {
  const db=database([]);
  expect(await runReadTool('crm_get_contact_listings',{contact_id:id},db.client,member)).toEqual({data:{listings:[],truncated:false},links:[]});
});
