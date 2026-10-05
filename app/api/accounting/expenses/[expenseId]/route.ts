import { accountingBody, accountingRoute } from "../../../../lib/accounting/http";
import { deleteExpense, updateExpense, setExpensePayment } from "../../../../lib/accounting/server";
import { AccountingError } from "../../../../lib/accounting/model";
type Context={params:Promise<{expenseId:string}>};
export async function PATCH(request:Request, context:Context) { return accountingRoute(request,async actor=>{
  const body=await accountingBody(request), id=(await context.params).expenseId;
  return Response.json({data:body.action === "payment" ? await setExpensePayment(id,body.is_paid,actor!) : await updateExpense(id,body,actor!)});
}); }
export async function DELETE(request:Request, context:Context) { return accountingRoute(request,async()=>{ if((await accountingBody(request)).confirm!==true) throw new AccountingError("Confirmez la suppression de la dépense."); await deleteExpense((await context.params).expenseId); return Response.json({ok:true}); }); }
