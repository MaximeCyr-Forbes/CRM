import { withCRMIdentity } from '../../../../lib/auth/route';
import { accountingRoute } from '../../../../lib/accounting/http';
import { listBalanceHistory } from '../../../../lib/accounting/balances-server';
export const dynamic='force-dynamic';
async function GETHandler(request:Request) {
  return accountingRoute(request,async()=>{
    const params=new URL(request.url).searchParams;
    return Response.json(await listBalanceHistory(params.get('broker'),params.get('before')));
  });
}

export const GET = withCRMIdentity(GETHandler);
