import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CRMMember } from '../auth/identity';
const mocks = vi.hoisted(() => ({ listings: vi.fn(),expenses:vi.fn() }));
vi.mock('../accounting/server',()=>({listExpenses:mocks.expenses}));
vi.mock('../listings/server-service', () => ({ listListings: mocks.listings, getListing: vi.fn() }));
import { runReadTool } from './tools';
const id = '11111111-1111-4111-8111-111111111111';
const member: CRMMember = { memberId: id, identityId: id, authUserId: id, broker: 'maxime', brokers: ['maxime'], role: 'broker' };
beforeEach(() => {mocks.listings.mockReset().mockResolvedValue([]);mocks.expenses.mockReset().mockResolvedValue([]);});
it('accounting reads never materialize and propagate errors',async()=>{
 const result=await runReadTool('crm_query_accounting',{query:'Immoplus',mode:'latest'},{} as SupabaseClient,member);
 expect(mocks.expenses).toHaveBeenCalledWith({materialize:false});expect(result.links).toEqual([{href:'/accounting',label:'Ouvrir Comptabilité'}]);
 mocks.expenses.mockRejectedValue(Error('SQL'));await expect(runReadTool('crm_query_accounting',{query:'Immoplus',mode:'latest'},{} as SupabaseClient,member)).rejects.toThrow('SQL');
});
function database(rows: unknown[], contact: unknown = { id }) {
  const q: Record<string, any> = {};
  for (const name of ['select', 'eq', 'not', 'order','in','lte','gte']) q[name] = vi.fn(() => q);
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
it('seller lookup checks the listing and follows only role=owner with contact RLS join',async()=>{
 const db=database([{contacts:{id,first_name:'Exemple'}}]);const result=await runReadTool('crm_get_listing_owners',{listing_id:id},db.client,member);
 expect(db.from.mock.calls.map(c=>c[0])).toEqual(['listings','listing_contacts']);expect(db.q.select).toHaveBeenCalledWith('contacts!inner(id,first_name,last_name)');expect(db.q.eq).toHaveBeenCalledWith('role','owner');expect(result.links[0].href).toBe(`/contacts/${id}`);
});
it('inaccessible listing never queries its owners',async()=>{const db=database([],null);await expect(runReadTool('crm_get_listing_owners',{listing_id:id},db.client,member)).rejects.toThrow('inaccessible');expect(db.from).toHaveBeenCalledTimes(1);});
it.each(['maxime','france','sandrine'] as const)('followups preserve %s server grants and query only due dates',async broker=>{
 const db=database([]);await runReadTool('crm_get_due_contact_followups',{to:'2026-11-17'},db.client,{...member,broker,brokers:[broker]});expect(db.q.in).toHaveBeenCalledWith('broker',[broker]);expect(db.q.lte).toHaveBeenCalledWith('next_follow_up_date','2026-11-17');expect(db.q.limit).toHaveBeenCalledWith(6);
});
it('conditions exclude completed deadlines and closed transactions, preserve broker scope',async()=>{
 const db=database([]);await runReadTool('crm_get_private_deadlines',{from:'2026-01-01',to:'2026-12-31',conditions:true},db.client,member);expect(db.q.eq).toHaveBeenCalledWith('completed',false);expect(db.q.in).toHaveBeenCalledWith('transactions.broker',['maxime']);expect(db.q.not).toHaveBeenCalledWith('transactions.status','in','(completed,cancelled)');expect(db.q.in).toHaveBeenCalledWith('transactions.status',['pa_accepted','inspection','financing','other_conditions']);
});
it.each(['crm_get_broker_listings','crm_get_due_contact_followups','crm_get_private_deadlines'])('new reads reject outside broker: %s',async tool=>{const db=database([]);const args=tool==='crm_get_broker_listings'?{broker:'france'}:tool==='crm_get_private_deadlines'?{broker:'france',from:'2026-01-01',to:'2026-12-31'}:{broker:'france',to:'2026-11-17'};await expect(runReadTool(tool,args,db.client,member)).rejects.toThrow('inaccessible');expect(db.from).not.toHaveBeenCalled();});
