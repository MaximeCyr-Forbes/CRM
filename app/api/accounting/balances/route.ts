import { accountingBody, accountingRoute } from '../../../lib/accounting/http';
import { listBrokerBalances, setBrokerBalance } from '../../../lib/accounting/balances-server';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  return accountingRoute(request,async()=>Response.json({data:await listBrokerBalances()}));
}
export async function PATCH(request:Request) {
  return accountingRoute(request,async actor=>Response.json({data:await setBrokerBalance(await accountingBody(request),actor!)}));
}
