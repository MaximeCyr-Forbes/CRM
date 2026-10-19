import {beforeEach,describe,expect,it,vi} from 'vitest';
import {z} from 'zod';
const state=vi.hoisted(()=>({auth:vi.fn(),finish:vi.fn(),run:vi.fn(),claim:vi.fn()}));
vi.mock('../crm-access',()=>({requireApiAccess:vi.fn(),birthdayWorkspaceActor:vi.fn()}));
vi.mock('../supabase/server',()=>({getSupabaseServiceClient:()=>({rpc:state.finish}),getSupabaseAdmin:vi.fn()}));
vi.mock('./auth',async importOriginal=>({...await importOriginal<typeof import('./auth')>(),authenticateMCP:state.auth}));
import { handleMCP,executeTool,tools } from './server';
import type {MCPAuth} from './auth';
import type {ToolDefinition} from './read-tools';
const identity={userId:'u',memberId:'m',identityId:'i',role:'broker' as const,actor:'france' as const,brokers:['france'],teamId:'t',clientId:'c',sessionId:'s',canWrite:true,canReadTeamAccounting:false,canManageRecommendations:false};
const auth=()=>({identity,client:{rpc:state.claim}} as unknown as MCPAuth);
const request=(method:string,params:unknown={})=>new Request('https://crm.example/api/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('NEXT_PUBLIC_APP_URL','https://crm.example');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://project.supabase.co');
 state.auth.mockResolvedValue(auth());state.finish.mockResolvedValue({data:null,error:null});state.claim.mockResolvedValue({data:{claimed:true},error:null});state.run.mockResolvedValue({entity:'note',id:'qa'});
});
describe('MCP HTTP protocol',()=>{
 it('initializes the official streamable HTTP server',async()=>{
  const res=await handleMCP(request('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'qa',version:'1'}}));
  expect(res.status).toBe(200);expect((await res.json()).result.serverInfo.name).toBe('forbes-crm');
 });
 it('lists strict granular tools with security annotations and no generic SQL/delete tool',async()=>{
  const res=await handleMCP(request('tools/list'));
  const payload=await res.json();expect(payload.result.tools.length).toBe(tools.length);
  for(const tool of payload.result.tools){expect(tool.inputSchema.additionalProperties).toBe(false);expect(tool._meta.securitySchemes).toEqual([{type:'oauth2',scopes:['openid']}]);expect(tool.name).not.toMatch(/delete|sql|shell/);}
 });
 it('returns an OAuth challenge when individual authentication is missing',async()=>{
  state.auth.mockRejectedValue(new Error('no session'));const res=await handleMCP(request('tools/list'));
  expect(res.status).toBe(401);expect(res.headers.get('www-authenticate')).toContain('oauth-protected-resource');
 });
 it('rejects an unrelated browser origin',async()=>{
  const req=request('tools/list');req.headers.set('origin','https://evil.example');expect((await handleMCP(req)).status).toBe(403);expect(state.auth).not.toHaveBeenCalled();
 });
 it('rejects actor injection before a tool runs',async()=>{
  const res=await handleMCP(request('tools/call',{name:'crm_search_contacts',arguments:{query:'QA',actor:'maxime'}}));
  const payload=await res.json();expect(payload.result?.isError || payload.error).toBeTruthy();expect(state.claim).not.toHaveBeenCalled();
 });
});
describe('MCP durable action ledger',()=>{
 const tool:ToolDefinition={name:'crm_qa_note',description:'QA',write:true,schema:z.strictObject({action_id:z.uuid()}),run:state.run};
 const args={action_id:'00000000-0000-4000-8000-000000000001'};
 it('writes once and finishes under the verified member',async()=>{
  expect(await executeTool(tool,args,auth())).toEqual({entity:'note',id:'qa'});
  expect(state.run).toHaveBeenCalledOnce();expect(state.finish).toHaveBeenCalledWith('crm_mcp_finish_action',expect.objectContaining({p_member_id:'m',p_status:'succeeded'}));
 });
 it('replays a prior successful result without executing again',async()=>{
  state.claim.mockResolvedValue({data:{claimed:false,status:'succeeded',result:{entity:'note',id:'qa'}},error:null});
  expect(await executeTool(tool,args,auth())).toMatchObject({id:'qa',replayed:true});expect(state.run).not.toHaveBeenCalled();
 });
 it('does not retry an uncertain write',async()=>{
  state.claim.mockResolvedValue({data:{claimed:false,status:'uncertain'},error:null});
  await expect(executeTool(tool,args,auth())).rejects.toThrow('déjà');expect(state.run).not.toHaveBeenCalled();
 });
 it('retains an uncertain state when the domain write fails',async()=>{
  state.run.mockRejectedValue(new Error('database unavailable'));
  await expect(executeTool(tool,args,auth())).rejects.toThrow('database unavailable');expect(state.finish).toHaveBeenCalledWith('crm_mcp_finish_action',expect.objectContaining({p_status:'uncertain',p_member_id:'m'}));
 });
});

describe('atomic inventory MCP tool',()=>{
 it('advertises additive inputs and commits without a separate ledger claim',async()=>{
  const inventory=tools.find(t=>t.name==='crm_add_sign_inventory_stock')!;
  state.claim.mockResolvedValue({data:{entity:'sign_inventory_stock',id:'bac',new_total:3},error:null});
  const admin={...auth(),identity:{...identity,role:'admin' as const,actor:'maxime' as const}};
  expect(await executeTool(inventory,{action_id:'00000000-0000-4000-8000-000000000001',inventory_type:'bac',quantity:3},admin)).toMatchObject({new_total:3});
  expect(state.claim).toHaveBeenCalledOnce();expect(state.claim).toHaveBeenCalledWith('crm_mcp_add_inventory_stock',expect.anything());expect(state.finish).not.toHaveBeenCalled();
  const payload=await (await handleMCP(request('tools/list'))).json();
  const entry=payload.result.tools.find((t:any)=>t.name===inventory.name);
  expect(entry.inputSchema.properties.quantity.minimum).toBe(1);expect(entry.annotations.destructiveHint).toBe(false);expect(entry.inputSchema.properties.total).toBeUndefined();
 });
});
