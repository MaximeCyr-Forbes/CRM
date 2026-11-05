import { withCRMIdentity } from "@/app/lib/auth/route";
import { requireApiAccess } from "@/app/lib/crm-access";
import { isSameOriginRequest } from "@/app/lib/google-calendar/config";
import { analyzeEmailBundle } from "@/app/lib/tools/email/analysis";
import { validateOaciqFiles } from "@/app/lib/transactions/oaciq-agenda";
import { parseOaciqOcr } from "@/app/lib/transactions/oaciq-ocr";
export const runtime="nodejs";
export const maxDuration=120;
export const POST=withCRMIdentity(async (request:Request)=>{
 const access=await requireApiAccess();if(access.response)return access.response;
 if(!isSameOriginRequest(request))return Response.json({error:"Origine refusée."},{status:403});
 if(Number(request.headers.get("content-length"))>4_600_000)return Response.json({error:"Dossier trop volumineux."},{status:413});
 try {
  const form=await request.formData(),files=form.getAll("pdf");
  if(!files.every((f):f is File=>f instanceof File))throw new Error();
  const error=validateOaciqFiles(files);if(error)return Response.json({ok:false,error},{status:400});
  const ocr=parseOaciqOcr(form.get("ocr_data"),files.length);
  const inputs=[];
  for(const [index,file] of files.entries())inputs.push({name:file.name,data:new Uint8Array(await file.arrayBuffer()),ocrPages:ocr.find(d=>d.index===index)?.pages});
  return Response.json(await analyzeEmailBundle(inputs),{headers:{"Cache-Control":"private, no-store"}});
 }catch{return Response.json({ok:false,error:"Les documents n’ont pas pu être lus. Vérifiez les PDF et réessayez."},{status:400});}
});
