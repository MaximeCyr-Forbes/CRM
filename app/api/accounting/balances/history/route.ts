import { accountingRoute } from '../../../../lib/accounting/http';
import { listBalanceHistory } from '../../../../lib/accounting/balances-server';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  return accountingRoute(request,async()=>{
    const params=new URL(request.url).searchParams;
    return Response.json(await listBalanceHistory(params.get('broker'),params.get('before')));
  });
}
