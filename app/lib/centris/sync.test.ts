import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({db:{from:vi.fn(),rpc:vi.fn(),storage:{from:vi.fn(),getBucket:vi.fn(),createBucket:vi.fn()}},collection:vi.fn()}));
vi.mock('../supabase/server',()=>({getSupabaseServiceClient:()=>mock.db}));
vi.mock('./client',async(importOriginal)=>({...await importOriginal<typeof import('./client')>(),centrisClient:{collection:mock.collection},isConfigured:()=>true}));
import {syncCentris} from './sync';
const actor={memberId:'actor',identityId:'identity',authUserId:'auth',broker:'maxime' as const,role:'broker' as const,brokers:['maxime' as const]};
const mappings=['maxime','france','sandrine'].map((broker,i)=>({broker,member_key:`m${i}`,member_mls_id:`${i}`,member_email:`${i}@example.test`}));
const property={ListingKey:'k1',ListingId:'123',ListAgentKey:'m0',StreetShortName:'Rue Test',Township:'Ville Test',ListPrice:500000,RentPrice:null,PropertyType:'Residential',StandardStatus:'Active',MlsStatus:'Active',ModificationTimestamp:'2026-11-13T00:00:00Z'};
let upsert:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 vi.clearAllMocks();upsert=vi.fn().mockResolvedValue({error:null});
 mock.db.from.mockImplementation(()=>({select:()=>Promise.resolve({data:mappings,error:null}),upsert}));
 mock.collection.mockResolvedValue([property]);
 mock.db.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>({data:name==='centris_start_sync'?true:name==='centris_apply_property'?{action:args.p_dry_run?'created':'created'}:null,error:null}));
});
it('dry run calls no write, storage or run RPC and creates no mapping',async()=>{
 const result=await syncCentris(actor,true);
 expect(result.created).toBe(1);expect(result.dryRun).toBe(true);
 expect(mock.db.rpc.mock.calls.every(([name,args])=>name==='centris_apply_property'&&args.p_dry_run===true)).toBe(true);
 expect(upsert).not.toHaveBeenCalled();expect(mock.db.storage.createBucket).not.toHaveBeenCalled();
});
it('preflights all records before any actual listing write',async()=>{
 mock.collection.mockResolvedValue([property,{...property,ListingKey:'k2',ListingId:'456'}]);
 const result=await syncCentris(actor,false);
 const applies=mock.db.rpc.mock.calls.filter(([name])=>name==='centris_apply_property');
 expect(applies.map(([,args])=>args.p_dry_run)).toEqual([true,true,false,false]);
 expect(result.created).toBe(2);expect(upsert).toHaveBeenCalledTimes(1);
});
it('fails safely when discovery/property fetch fails, no mapping/listing write',async()=>{
 mock.collection.mockRejectedValue(new Error('private token must not leak'));
 await expect(syncCentris(actor,false)).rejects.toThrow('temporairement indisponible');
 expect(upsert).not.toHaveBeenCalled();
 expect(mock.db.rpc.mock.calls.some(([name])=>name==='centris_apply_property')).toBe(false);
 expect(mock.db.rpc.mock.calls.at(-1)?.[1].p_status).toBe('failed');
});
it('blocks identity conflicts and duplicate keys before writes',async()=>{
 mock.db.rpc.mockImplementation(async(name:string)=>({data:name==='centris_start_sync'?true:{action:'conflict'},error:null}));
 await expect(syncCentris(actor,false)).rejects.toThrow();expect(upsert).not.toHaveBeenCalled();
 mock.collection.mockResolvedValue([property,property]);
 await expect(syncCentris(actor,true)).rejects.toThrow();
});
it('retains successful items on a partial per-property failure',async()=>{
 mock.collection.mockResolvedValue([property,{...property,ListingKey:'k2',ListingId:'456'}]);
 mock.db.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>({data:name==='centris_start_sync'?true:{action:'created'},
 error:name==='centris_apply_property'&&!args.p_dry_run&&(args.p_source as {key:string}).key==='k2'?{message:'private'}:null}));
 const result=await syncCentris(actor,false);
 expect(result.created).toBe(1);expect(result.errors).toBe(1);
 expect(mock.db.rpc.mock.calls.at(-1)?.[1].p_status).toBe('partial');
});
it('rejects an entirely unknown property classification',async()=>{
 mock.collection.mockResolvedValue([{...property,PropertyType:'Unknown'}]);
 await expect(syncCentris(actor,false)).rejects.toThrow();expect(upsert).not.toHaveBeenCalled();
});
