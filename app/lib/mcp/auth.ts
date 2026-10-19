import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MCPAccessError, identityFromMembership, type MCPIdentity } from './access';

export type MCPAuth = { identity:MCPIdentity; client:SupabaseClient };
export function mcpOrigin() {
  const origin=process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/,'');
  if(!origin || new URL(origin).protocol!=='https:') throw new Error('MCP HTTPS origin is not configured');
  return origin;
}
export function resourceMetadata() {
  const issuer=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'');
  if(!issuer) throw new Error('MCP identity provider is not configured');
  return {resource:`${mcpOrigin()}/api/mcp`,authorization_servers:[`${issuer}/auth/v1`],scopes_supported:['openid'],bearer_methods_supported:['header'],resource_name:'CRM Équipe Forbes'};
}
export function authChallenge() {
  return Response.json({error:'Authentification individuelle CRM requise.'},{status:401,headers:{'Cache-Control':'no-store','WWW-Authenticate':`Bearer resource_metadata="${mcpOrigin()}/.well-known/oauth-protected-resource", scope="openid"`}});
}
export function bearerToken(request:Request) {
  const header=request.headers.get('authorization');
  if(!header || !/^Bearer [A-Za-z0-9._~-]+$/.test(header) || header.length>8192) throw new MCPAccessError('UNAUTHORIZED','Authentification individuelle CRM requise.');
  return header.slice(7);
}
export async function authenticateMCP(request:Request):Promise<MCPAuth> {
  const token=bearerToken(request), url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'');
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url || !key) throw new Error('MCP user client is not configured');
  const client=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`},fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20_000)})},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const verified=await client.auth.getClaims(token);
  const claims=verified.data?.claims;
  if(verified.error || !claims || claims.iss!==`${url}/auth/v1` || claims.aud!=='authenticated' || typeof claims.sub!=='string'
    || typeof claims.client_id!=='string' || typeof claims.session_id!=='string' || !Number.isFinite(claims.exp) || claims.exp*1000<=Date.now()) throw new MCPAccessError('UNAUTHORIZED','Connexion invalide ou expirée.');
  // The RPC also checks the live OAuth consent and auth session (not only JWT).
  const membership=await client.rpc('crm_mcp_identity');
  if(membership.error || !membership.data) throw new MCPAccessError('FORBIDDEN','Connexion révoquée ou accès CRM non attribué.');
  const identity=identityFromMembership(claims.sub,claims.client_id,claims.session_id,membership.data);
  const rate=await client.rpc('crm_mcp_rate_limit');
  if(rate.error) throw new MCPAccessError('FORBIDDEN','Accès CRM indisponible.');
  if(rate.data!==true) throw new MCPAccessError('RATE_LIMITED','Limite atteinte. Réessayez dans une minute.');
  return {identity,client};
}
