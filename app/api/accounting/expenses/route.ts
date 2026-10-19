import { withCRMIdentity } from '../../../lib/auth/route';
import { accountingBody, accountingRoute } from "../../../lib/accounting/http";
import { cleanupInvoices, createExpense, listExpenses, listAccountingBrokers } from "../../../lib/accounting/server";
export const dynamic="force-dynamic";
async function GETHandler(request:Request) { return accountingRoute(request,async()=>{ const [data,brokers]=await Promise.all([listExpenses(),listAccountingBrokers()]); return Response.json({data,brokers}); }); }
async function POSTHandler(request:Request) { return accountingRoute(request,async actor=>Response.json({data:await createExpense(await accountingBody(request),actor!)},{status:201})); }
// Controlled authenticated cleanup after page load; no render-triggered writes or cron.
async function PATCHHandler(request:Request) { return accountingRoute(request,async()=>{ await cleanupInvoices(); return Response.json({ok:true}); }); }

export const GET = withCRMIdentity(GETHandler);
export const POST = withCRMIdentity(POSTHandler);
export const PATCH = withCRMIdentity(PATCHHandler);
