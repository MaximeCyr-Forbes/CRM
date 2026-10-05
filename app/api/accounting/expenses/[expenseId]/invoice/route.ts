import { accountingBody, accountingRoute } from "../../../../../lib/accounting/http";
import { completeInvoice, deleteInvoice, openInvoice, prepareInvoice } from "../../../../../lib/accounting/server";
import { AccountingError } from "../../../../../lib/accounting/model";
type Context={params:Promise<{expenseId:string}>};
export async function GET(request:Request, context:Context) { return accountingRoute(request,async()=>new Response(null,{status:302,headers:{Location:await openInvoice((await context.params).expenseId),"Referrer-Policy":"no-referrer"}})); }
export async function POST(request:Request, context:Context) { return accountingRoute(request,async actor=>{
  const body=await accountingBody(request), id=(await context.params).expenseId;
  if(body.action==="prepare") return Response.json(await prepareInvoice(id,{name:body.name,type:body.type,size:body.size}));
  if(body.action==="complete" && typeof body.documentId==="string") return Response.json({data:await completeInvoice(id,body.documentId,actor!)});
  throw new AccountingError("Action de facture invalide.");
}); }
export async function DELETE(request:Request, context:Context) { return accountingRoute(request,async actor=>{if((await accountingBody(request)).save_without_invoice!==true)throw new AccountingError("Confirmez l’enregistrement sans facture.",409);return Response.json({data:await deleteInvoice((await context.params).expenseId,actor!)});}); }
