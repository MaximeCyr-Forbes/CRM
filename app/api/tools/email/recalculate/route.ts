import { withCRMIdentity } from "@/app/lib/auth/route";
import { requireApiAccess } from "@/app/lib/crm-access";
import { isSameOriginRequest } from "@/app/lib/google-calendar/config";
import { consolidate } from "@/app/lib/tools/email/engine";
export const POST = withCRMIdentity(async (request: Request) => {
 const access=await requireApiAccess();if(access.response)return access.response;
 if(!isSameOriginRequest(request))return Response.json({error:"Origine refusée."},{status:403});
 if(Number(request.headers.get("content-length"))>2_000_000)return Response.json({error:"Données trop volumineuses."},{status:413});
 try {
  const raw=await request.text();if(raw.length>2_000_000)throw new Error();
  const tx=JSON.parse(raw);
  if(!tx||typeof tx!=="object"||!Array.isArray(tx.conditions)||tx.conditions.length>300)throw new Error();
  return Response.json(consolidate(tx),{headers:{"Cache-Control":"private, no-store"}});
 }catch{return Response.json({ok:false,error:"Vérifiez les données de validation de la transaction."},{status:400});}
});
