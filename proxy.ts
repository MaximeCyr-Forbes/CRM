import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { CRM_ACCESS_COOKIE, isValidCRMAccessToken } from './app/lib/crm-access';
import { memberFromDatabase } from './app/lib/auth/identity';
const PUBLIC_PATHS = new Set([
 '/login',"/manifest.webmanifest",'/api/access/login','/api/access/logout','/api/access/session',
 '/api/access/google','/api/access/callback','/api/access/consent','/oauth/consent',
 '/api/mcp','/.well-known/oauth-protected-resource',
 "/api/google-calendar/webhook",'/api/cron/birthday-greetings',
]);
export async function proxy(request: NextRequest) {
 const path=request.nextUrl.pathname;
 const requestHeaders=new Headers(request.headers);
 requestHeaders.set('x-crm-return-path',path+request.nextUrl.search);
 let response=NextResponse.next({request:{headers:requestHeaders}});
 if(PUBLIC_PATHS.has(path))return response; // Each public API enforces its own dedicated authentication.
 let authorized=false;
 const hasIndividualCookie=request.cookies.getAll().some(({name})=>/^sb-.*-auth-token(?:\.\d+)?$/.test(name));
 if(process.env.CRM_GOOGLE_LOGIN_ENABLED==='true' && hasIndividualCookie){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(url && key){
   const client=createServerClient(url,key,{cookieOptions:{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/'},cookies:{
    getAll:()=>request.cookies.getAll(),
    setAll:values=>{
     for(const {name,value} of values)request.cookies.set(name,value);
     requestHeaders.set('cookie',request.cookies.toString());
     response=NextResponse.next({request:{headers:requestHeaders}});
     for(const {name,value,options} of values)response.cookies.set(name,value,options);
     response.headers.set('Cache-Control','private, no-store');
    },
   }});
   try{
    const user=await client.auth.getUser();
    if(!user.error && user.data.user){const result=await client.rpc('crm_authenticated_member');const member=memberFromDatabase(result.data);authorized=!result.error && member?.authUserId===user.data.user.id;}
   }catch{/* Fail closed; never fall back to the shared password for a rejected identity. */}
  }
 }else authorized=await isValidCRMAccessToken(request.cookies.get(CRM_ACCESS_COOKIE)?.value);
 const finish=(next:NextResponse)=>{for(const cookie of response.cookies.getAll())next.cookies.set(cookie);next.headers.set('Cache-Control','private, no-store');return next;};
 if(authorized){
  if(path === "/pipeline")return finish(NextResponse.redirect(new URL("/contacts", request.url)));
  return response;
 }
 if(path.startsWith('/api/'))return finish(NextResponse.json({error:'Accès CRM requis.'},{status:401}));
 const login=new URL('/login',request.url);login.searchParams.set('returnTo',path+request.nextUrl.search);
 return finish(NextResponse.redirect(login));
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']};
