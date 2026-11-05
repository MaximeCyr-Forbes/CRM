import { withCRMIdentity } from '@/app/lib/auth/route';
import { requireApiAccess } from '@/app/lib/crm-access';
import { isSameOriginRequest } from '@/app/lib/google-calendar/config';
import { VISION_PROMPT } from '@/app/lib/tools/email/vision-prompt';
import { mergeVisualReview } from '@/app/lib/tools/email/visual-review';
import { z } from 'zod';
const payload=z.object({transaction:z.object({id:z.string(),conditions:z.array(z.any()).max(300),issues:z.array(z.string()),amendments:z.array(z.any()),overrides:z.array(z.any()),terms:z.record(z.string(),z.any())}).passthrough(),document:z.object({form_id:z.string().max(40),file_name:z.string().max(300)}).passthrough(),pages:z.array(z.object({page:z.number().int().min(1).max(150),text:z.string().max(18000),image:z.string().max(3_500_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)})).min(1).max(8)});
export const runtime='nodejs';
export const maxDuration=240;
export const POST=withCRMIdentity(async(request:Request)=>{
 const access=await requireApiAccess();if(access.response)return access.response;
 if(!isSameOriginRequest(request))return Response.json({error:'Origine refusée.'},{status:403});
 if(Number(request.headers.get('content-length'))>4_500_000)return Response.json({error:'Lecture visuelle trop volumineuse.'},{status:413});
 const key=process.env.AI_GATEWAY_API_KEY||(process.env.VERCEL==='1'?request.headers.get('x-vercel-oidc-token'):null)||process.env.VERCEL_OIDC_TOKEN;
 if(!key)return Response.json({error:'Lecture visuelle indisponible : connexion AI Gateway à configurer. Confirmez les champs manuellement.'},{status:503});
 try{
  const raw=await request.text();if(new TextEncoder().encode(raw).length>4_500_000)throw new Error();
  const input=payload.parse(JSON.parse(raw));
  const content:unknown[]=[{type:'text',text:JSON.stringify({identity_hint:input.document,pages:input.pages.map(p=>({source_page:p.page,native_text:p.text}))})}];
  for(const page of input.pages)content.push({type:'text',text:`Page PDF ${page.page}`},{type:'image_url',image_url:{url:page.image,detail:'high'}});
  const response=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.VISION_MODEL||'openai/gpt-5.4-mini',max_tokens:14000,messages:[{role:'system',content:VISION_PROMPT},{role:'user',content}],stream:false}),signal:AbortSignal.timeout(220000)});
  if(!response.ok){
   const failure=await response.json().catch(()=>null);
   console.warn('tool_vision_gateway_error',{status:response.status,type:failure?.error?.type,code:failure?.error?.code,message:typeof failure?.error?.message==='string'?failure.error.message.slice(0,1200):undefined});
   return Response.json({error:`Lecture visuelle AI Gateway indisponible (HTTP ${response.status}). Confirmez les champs manuellement.`},{status:502});
  }
  const result=await response.json(),choice=result.choices?.[0];
  if(choice?.finish_reason==='length'||typeof choice?.message?.content!=='string')throw new Error();
  const facts=JSON.parse(choice.message.content.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
  return Response.json({ok:true,transaction:mergeVisualReview(input.transaction,input.document,facts,input.pages.map(p=>p.page))},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'Lecture visuelle incomplète ou invalide. Confirmez les champs manuellement.'},{status:400});}
});
