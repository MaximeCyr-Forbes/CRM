import { accountingBody, accountingRoute } from "../../../../lib/accounting/http";
import { deleteExpense, updateExpense } from "../../../../lib/accounting/server";
import { AccountingError } from "../../../../lib/accounting/model";
type Context={params:Promise<{expenseId:string}>};
export async function PATCH(request:Request, context:Context) { return accountingRoute(request,async actor=>Response.json({data:await updateExpense((await context.params).expenseId,await accountingBody(request),actor!)})); }
export async function DELETE(request:Request, context:Context) { return accountingRoute(request,async()=>{ if((await accountingBody(request)).confirm!==true) throw new AccountingError("Confirmez la suppression de la dépense."); await deleteExpense((await context.params).expenseId); return Response.json({ok:true}); }); }
