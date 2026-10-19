import { withCRMIdentity } from '../../../lib/auth/route';
import { accountingBody, accountingRoute } from '../../../lib/accounting/http';
import { listBrokerBalances, setBrokerBalance } from '../../../lib/accounting/balances-server';
export const dynamic='force-dynamic';
async function GETHandler(request:Request) {
  return accountingRoute(request,async()=>Response.json({data:await listBrokerBalances()}));
}
async function PATCHHandler(request:Request) {
  return accountingRoute(request,async actor=>Response.json({data:await setBrokerBalance(await accountingBody(request),actor!)}));
}

export const GET = withCRMIdentity(GETHandler);
export const PATCH = withCRMIdentity(PATCHHandler);
