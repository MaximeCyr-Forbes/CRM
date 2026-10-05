import { accountingBody, accountingRoute } from "../../../lib/accounting/http";
import { cleanupInvoices, createExpense, listExpenses } from "../../../lib/accounting/server";
export const dynamic="force-dynamic";
export async function GET(request:Request) { return accountingRoute(request,async()=>Response.json({data:await listExpenses()})); }
export async function POST(request:Request) { return accountingRoute(request,async actor=>Response.json({data:await createExpense(await accountingBody(request),actor!)},{status:201})); }
// Controlled authenticated cleanup after page load; no render-triggered writes or cron.
export async function PATCH(request:Request) { return accountingRoute(request,async()=>{ await cleanupInvoices(); return Response.json({ok:true}); }); }
