import { crmMemberContext } from '../auth/context';
import { getSupabaseServiceClient } from '../supabase/server';
import type { WorkingBroker } from '../workspace';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {createHash} from 'node:crypto';
import {withSupabaseClient} from '../supabase/request-context';
import {MCPAccessError,requireWrite} from './access';
import {authenticateMCP,authChallenge,mcpOrigin,type MCPAuth} from './auth';
import {checked,readTools,type ToolDefinition} from './read-tools';
import {writeTools} from './write-tools';
import {syncTransactionDeadline} from '../google-calendar/service';
export const tools=[...readTools,...writeTools];
function canonical(value:unknown):string {
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(value && typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
 return JSON.stringify(value);
}
export async function executeTool(tool:ToolDefinition,input:Record<string,any>,auth:MCPAuth) {
 const i=auth.identity;
 return crmMemberContext.run({memberId:i.memberId,identityId:i.identityId,authUserId:i.userId,broker:i.actor as WorkingBroker,role:i.role,brokers:i.brokers as WorkingBroker[]},()=>executeAuthenticatedTool(tool,input,auth));
}
async function executeAuthenticatedTool(tool:ToolDefinition,input:Record<string,any>,auth:MCPAuth) {
 const parsed=tool.schema.parse(input);
 if(tool.write)requireWrite(auth.identity);
 let claimed=false;
 try {
  if(tool.write && !tool.atomicWrite){
   const hash=createHash('sha256').update(canonical(parsed)).digest('hex');
   const prior=await checked(auth.client.rpc('crm_mcp_begin_action',{p_action_id:parsed.action_id,p_tool:tool.name,p_hash:hash}));
   if(!prior.claimed){
    if(prior.status==='succeeded')return {...prior.result,replayed:true};
    throw new MCPAccessError('CONFLICT','Cette action a déjà été tentée ou est en cours. Vérifiez son résultat dans le CRM avant toute autre action.');
   }
   claimed=true;
  }
  const result=await withSupabaseClient(auth.client,()=>tool.run(parsed,auth.client,auth.identity));
  if(tool.write && !tool.atomicWrite){
   const record=result as {entity:string;id:string};
   await checked(getSupabaseServiceClient().rpc('crm_mcp_finish_action',{p_member_id:auth.identity.memberId,p_action_id:parsed.action_id,p_status:'succeeded',p_result:result}));
   if(tool.name==='crm_update_transaction_deadline'){
    // Scope was verified under RLS and the CRM save is durable. Google token
    // access remains inside the existing server-only secondary sync service.
    try{await withSupabaseClient(auth.client,()=>syncTransactionDeadline(record.id));}catch{return {...record,warning:'CRM enregistré. Synchronisation Google à réessayer.'};}
   }
  }
  return result;
 }catch(error){
  if(claimed){try{await getSupabaseServiceClient().rpc('crm_mcp_finish_action',{p_member_id:auth.identity.memberId,p_action_id:parsed.action_id,p_status:'uncertain',p_result:null});}catch{/* Leave the durable started record: never retry an uncertain write. */}}
  throw error;
 }
}
export function createMCPServer(auth:MCPAuth){
 const server=new McpServer({name:'forbes-crm',version:'1.0.0'},{maxToolInputElements:2000});
 for(const tool of tools){
  server.registerTool(tool.name,{description:tool.description,inputSchema:tool.schema,
   annotations:{readOnlyHint:!tool.write,destructiveHint:tool.write && !tool.atomicWrite,idempotentHint:true,openWorldHint:tool.name==='crm_update_transaction_deadline'},
   _meta:{securitySchemes:[{type:'oauth2',scopes:['openid']}]},
  },async input=>{
   const requestId=crypto.randomUUID(),start=Date.now();
   try{const result=await executeTool(tool,input,auth);console.info('CRM MCP',{tool:tool.name,requestId,status:'ok',durationMs:Date.now()-start});return {content:[{type:'text' as const,text:JSON.stringify(result)}]};}
   catch(error){
    const code=error instanceof MCPAccessError?error.code:'OPERATION_FAILED';
    console.warn('CRM MCP',{tool:tool.name,requestId,status:code,durationMs:Date.now()-start});
    return {isError:true,content:[{type:'text' as const,text:JSON.stringify({error:code,message:error instanceof MCPAccessError?error.message:'Opération non confirmée. Vérifiez les données et l’état de la ressource dans le CRM.',request_id:requestId})}]};
   }
  });
 }
 return server;
}
export async function handleMCP(request:Request){
 const origin=request.headers.get('origin');
 if(origin && origin!==mcpOrigin() && origin!=='https://chatgpt.com')return new Response(null,{status:403});
 let auth:MCPAuth;
 try{auth=await authenticateMCP(request);}catch(error){
  if(error instanceof MCPAccessError && error.code==='RATE_LIMITED')return Response.json({error:error.message},{status:429,headers:{'Retry-After':'60','Cache-Control':'no-store'}});
  return authChallenge();
 }
 const server=createMCPServer(auth);
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true,maxRequestBodySize:64*1024});
 try{await server.connect(transport);const response=await transport.handleRequest(request);response.headers.set('Cache-Control','no-store');return response;}
 finally{await server.close();}
}
