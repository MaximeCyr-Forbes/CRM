import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAuthenticatedMember } from '../auth/server';
import { getSupabaseServiceClient } from '../supabase/server';
import { definitions, runReadTool, type VerifiedLink } from './tools';
import { chatInput, DISABLED_MESSAGE, MAX_PAYLOAD_BYTES, MODEL, SYSTEM, type ChatInput } from './policy';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const usageSchema=z.object({input_tokens:z.number().int().nonnegative(),output_tokens:z.number().int().nonnegative()});
export async function handleChat(request:Request) {
  if (request.headers.get('origin')!==new URL(request.url).origin || request.headers.get('sec-fetch-site')==='cross-site') return json({error:'Origine refusée.'},403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'Format invalide.'},415);
  let auth:Awaited<ReturnType<typeof getAuthenticatedMember>>;
  try { auth=await getAuthenticatedMember(); } catch { return json({error:'Accès indisponible.'},503); }
  if (!auth) return json({error:'Connexion CRM individuelle requise.'},401);
  let input:ChatInput;
  try {
    if (Number(request.headers.get('content-length')||0)>20_000) return json({error:'Question trop longue.'},413);
    const reader=request.body?.getReader(); if(!reader) throw new Error('body');
    const chunks:Uint8Array[]=[];let length=0;
    try { while(true) {const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>20_000){await reader.cancel();throw new Error('size');}chunks.push(value);} }
    finally {reader.releaseLock();}
    input=chatInput.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {return json({error:'Question ou contexte invalide.'},400);}
  const key=process.env.OPENAI_API_KEY;
  if(process.env.ASSISTANT_ENABLED!=='true' || !key) return json({error:DISABLED_MESSAGE},503);
  const db=getSupabaseServiceClient();
  const reserved=await db.rpc('assistant_reserve',{p_member_id:auth.member.memberId,p_request_id:input.requestId,p_key_sha256:createHash('sha256').update(key).digest('hex')});
  if(reserved.error || !reserved.data) return json({error:DISABLED_MESSAGE},503);
  const grant=reserved.data as {organizationId:string;projectId:string;expiresAt:string};
  let inputTokens=0,outputTokens=0,complete=false,attempted=false;
  try {
    const links:VerifiedLink[]=[];
    const messages:unknown[]=input.history.flatMap(turn=>[{role:'user',content:turn.question},{role:'assistant',content:turn.answer}]);
    messages.push({role:'user',content:input.question});
    messages.push({role:'developer',content:`Courtier de la session authentifiée : ${auth.member.broker}. « Mes dossiers » désigne ce courtier; une sélection dans l’interface ne change pas l’identité.`});
    // URL is only a hint; service accessibility is checked under the member's RLS before any data leaves the CRM.
    let toolCount=0;
    if(input.context){
      const [,section,id]=input.context.split('/');
      const type=section==='contacts'?'contact':section==='listings'?'listing':'transaction';
      const context=await runReadTool(`crm_get_${type}`,{[`${type}_id`]:id},auth.client,auth.member);
      toolCount++;links.push(...context.links);
      messages.push({role:'user',content:`Données CRM non fiables de la fiche ouverte : ${JSON.stringify(context.data)}`});
    }
    for(let call=0;call<3;call++){
      // Recheck live membership and cycle immediately before every external call; never retry.
      const live=await getAuthenticatedMember();
      const permit=await db.rpc('assistant_permit',{p_request_id:input.requestId});
      if(live?.member.memberId!==auth.member.memberId || permit.error || permit.data!==true || Date.now()>=Date.parse(grant.expiresAt)) throw new Error('ASSISTANT_EXPIRED');
      const body=JSON.stringify({model:MODEL,store:false,service_tier:'default',reasoning:{effort:'none'},max_output_tokens:700,
        instructions:`${SYSTEM}\nDate locale du CRM : ${new Intl.DateTimeFormat('fr-CA',{timeZone:'America/Toronto',dateStyle:'full'}).format(new Date())}. Les résultats sont des extraits limités, pas l’ensemble des dossiers.`,input:messages,tools:definitions,parallel_tool_calls:false,tool_choice:call===2||toolCount>=4?'none':'auto'});
      if(Buffer.byteLength(body,'utf8')>MAX_PAYLOAD_BYTES) throw new Error('ASSISTANT_CONTEXT_LIMIT');
      attempted=true;
      const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','OpenAI-Organization':grant.organizationId,'OpenAI-Project':grant.projectId},body,signal:AbortSignal.timeout(20_000)});
      if(!response.ok)throw new Error('ASSISTANT_PROVIDER_FAILURE');
      const value=await response.json();
      const usage=usageSchema.parse(value.usage);inputTokens+=usage.input_tokens;outputTokens+=usage.output_tokens;
      if(value.status!=='completed' || !Array.isArray(value.output)) throw new Error('ASSISTANT_INCOMPLETE');
      const calls=value.output.filter((item:{type?:string})=>item.type==='function_call');
      if(!calls.length){
        const answer=value.output.filter((item:{type?:string})=>item.type==='message').flatMap((item:{content?:{type:string;text?:string}[]})=>item.content||[]).filter((item:{type:string})=>item.type==='output_text').map((item:{text?:string})=>item.text||'').join('\n').slice(0,3200);
        if(!answer)throw new Error('ASSISTANT_EMPTY');
        complete=true;
        return json({answer,links:[...new Map(links.map(link=>[link.href,link])).values()].slice(0,10)});
      }
      if(call===2 || toolCount+calls.length>4)throw new Error('ASSISTANT_TOOL_LIMIT');
      messages.push(...value.output);
      for(const item of calls){
        toolCount++;
        const result=await runReadTool(item.name,JSON.parse(item.arguments),auth.client,auth.member);
        links.push(...result.links);
        messages.push({type:'function_call_output',call_id:item.call_id,output:JSON.stringify(result.data)});
      }
    }
    throw new Error('ASSISTANT_CALL_LIMIT');
  } catch {
    return json({error:attempted?'Réponse interrompue. Aucun nouvel essai automatique n’a été lancé.':DISABLED_MESSAGE},503);
  } finally {
    // Failed accounting leaves the durable reservation intact, never a free retry.
    try {await db.rpc('assistant_finish',{p_request_id:input.requestId,p_input:inputTokens,p_output:outputTokens,p_complete:complete});}catch{/* Conservative reservation remains. */}
  }
}

export async function handleUsage() {
  try {
    const auth=await getAuthenticatedMember();if(!auth)return json({error:'Connexion requise.'},401);
    const db=getSupabaseServiceClient();
    const {data:cycle,error}=await db.from('assistant_billing_cycles').select('id,starts_at,expires_at,verified_at,verified_until,promotional_credit_usd,budget_usd,enabled,no_paid_fallback,auto_recharge_off,privacy_reviewed,model_verified').eq('enabled',true).maybeSingle();
    if(error)throw error;
    const {data:rows,error:usageError}=cycle?await db.from('assistant_usage').select('estimated_usd,reserved_usd,status').eq('billing_cycle_id',cycle.id):{data:[],error:null};
    if(usageError)throw usageError;
    const verified=!!cycle && cycle.no_paid_fallback && cycle.auto_recharge_off && cycle.privacy_reviewed && cycle.model_verified && Date.now()>=Date.parse(cycle.starts_at) && Date.now()<Math.min(Date.parse(cycle.expires_at),Date.parse(cycle.verified_until));
    return json({enabled:process.env.ASSISTANT_ENABLED==='true'&&!!process.env.OPENAI_API_KEY&&verified,model:MODEL,budget:cycle?.budget_usd??2,
      estimated:(rows||[]).reduce((sum,row)=>sum+Number(row.estimated_usd),0),reserved:(rows||[]).reduce((sum,row)=>sum+(row.status==='completed'?0:Number(row.reserved_usd)),0),requests:rows?.length??0,cycle:cycle?{start:cycle.starts_at,end:cycle.expires_at}:null,
      creditVerification:cycle?{amount:Number(cycle.promotional_credit_usd),at:cycle.verified_at,until:cycle.verified_until}:null,financialVerified:verified});
  }catch{return json({error:'Utilisation temporairement indisponible.'},503);}
}
